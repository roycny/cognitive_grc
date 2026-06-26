"""
AI Tools module.

Currently hosts the **SCA Agent** — Software Composition Analysis. Users upload
dependency manifests / lockfiles, which are scanned with Google OSV-Scanner; an
AI model then triages the findings, and the result can be exported as a PDF or
saved to an inventory of reports.
"""

import json as _json
import logging
import os
import subprocess
import tempfile
import uuid
from datetime import datetime
from typing import List, Literal, Optional
from xml.sax.saxutils import escape as _esc  # neutralise ReportLab markup in dynamic text

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import get_current_active_user
from app.database import get_db
from app.models.user import User, UserRole
from app.services.audit_log_service import emit_audit_log, get_client_ip
from app.services.ai_service import ai_service
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-tools", tags=["ai-tools"])


def _require_editor_or_admin(current_user: User):
    if current_user.role not in (UserRole.ADMIN, UserRole.EDITOR):
        raise HTTPException(status_code=403, detail="Not authorized to perform this action")


def _delete_file(path: str) -> None:
    """Remove a temporary file after it has been streamed to the client."""
    try:
        os.unlink(path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# SIEM Script Agent — generate & refine
# ---------------------------------------------------------------------------

_SIEM_SCRIPT_TYPES = ("AQL Query", "Python (API Script)", "YARA Rule", "Sigma Rule")


class SIEMGenerateRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    goal: str = Field(min_length=1, max_length=4000)
    script_type: str = "AQL Query"
    timeframe: str = Field(default="Last 24 Hours", max_length=100)
    log_sources: Optional[str] = Field(default="", max_length=2000)
    ioc_content: Optional[str] = Field(default="", max_length=20000)
    model_name: str = "ollama/llama3.1"


class ChatHistoryEntry(BaseModel):
    """A single turn in the SIEM refinement chat history."""
    role: Literal["user", "agent", "model"]
    content: str = Field(max_length=8000)


class SIEMRefineRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    current_script: str = Field(min_length=1, max_length=20000)
    refinement_request: str = Field(min_length=1, max_length=2000)
    script_type: str = "AQL Query"
    # Typed + bounded: prevents injection via arbitrary keys and caps context size.
    chat_history: List[ChatHistoryEntry] = Field(default_factory=list, max_length=50)
    model_name: str = "ollama/llama3.1"


class SIEMScriptResponse(BaseModel):
    script: str
    reply: Optional[str] = None


@router.post("/siem-agent/generate", response_model=SIEMScriptResponse)
@limiter.limit("10/minute")
def generate_siem_script(
    request: Request,
    body: SIEMGenerateRequest,
    bg: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    """Generate a SIEM/SOC detection script from a natural-language goal."""
    _require_editor_or_admin(current_user)
    if body.script_type not in _SIEM_SCRIPT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"script_type must be one of: {', '.join(_SIEM_SCRIPT_TYPES)}",
        )

    script = ai_service.generate_siem_script(
        goal=body.goal,
        script_type=body.script_type,
        timeframe=body.timeframe,
        log_sources=body.log_sources or "",
        ioc_content=body.ioc_content or "",
        model_name=body.model_name,
    )

    bg.add_task(
        emit_audit_log,
        current_user.username, "AI_ACTION", "SIEMScriptAgent", None,
        f"Generated {body.script_type} script",
        get_client_ip(request),
    )
    return {"script": script}


@router.post("/siem-agent/refine", response_model=SIEMScriptResponse)
@limiter.limit("20/minute")
def refine_siem_script(
    request: Request,
    body: SIEMRefineRequest,
    bg: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    """Refine a generated SIEM script via the chat assistant."""
    _require_editor_or_admin(current_user)

    result = ai_service.refine_siem_script(
        current_script=body.current_script,
        refinement_request=body.refinement_request,
        chat_history=[h.model_dump() for h in body.chat_history],
        script_type=body.script_type,
        model_name=body.model_name,
    )

    bg.add_task(
        emit_audit_log,
        current_user.username, "AI_ACTION", "SIEMScriptAgent", None,
        f"Refined {body.script_type} script via chat",
        get_client_ip(request),
    )
    return result


# ---------------------------------------------------------------------------
# SCA Agent — scanning
# ---------------------------------------------------------------------------

_SCA_MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MB
_SCA_MAX_FILES = 10


def _sca_lockfile_type(filename: str) -> Optional[str]:
    """Map an uploaded filename to the osv-scanner lockfile type prefix, or None if unsupported."""
    name = filename.lower()
    if name.endswith(".xml"):
        return "pom.xml"
    if name.endswith(".txt"):
        return "requirements.txt"
    if name.endswith("yarn.lock"):
        return "yarn.lock"
    if name.endswith("poetry.lock"):
        return "poetry.lock"
    if name.endswith("package-lock.json"):
        return "package-lock.json"
    if name.endswith("composer.lock"):
        return "composer.lock"
    return None


def _is_sbom(filename: str) -> bool:
    """Return True if the file is a GitHub/SPDX SBOM JSON export."""
    name = filename.lower()
    return name.endswith(".json") and not name.endswith("package-lock.json")


class SCAVulnerabilityItem(BaseModel):
    id: str
    summary: str
    severity: str = "UNKNOWN"
    cvss_score: Optional[float] = None
    aliases: List[str] = []
    references: List[str] = []


class SCAVulnerablePackage(BaseModel):
    name: str
    version: str
    ecosystem: str
    vulnerabilities: List[SCAVulnerabilityItem]


class SCAScanResponse(BaseModel):
    filename: str
    total_vulnerabilities: int
    packages: List[SCAVulnerablePackage]
    scan_error: Optional[str] = None


def _cvss_to_severity(score: float) -> str:
    if score >= 9.0:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    return "LOW"


def _parse_osv_output(raw: str) -> List[SCAVulnerablePackage]:
    try:
        data = _json.loads(raw)
    except (ValueError, TypeError):
        return []

    packages: List[SCAVulnerablePackage] = []
    for scan_result in data.get("results", []):
        for pkg in scan_result.get("packages", []):
            pkg_info = pkg.get("package", {})
            groups_by_id: dict = {}
            for group in pkg.get("groups", []):
                max_sev = group.get("max_severity")
                for gid in group.get("ids", []):
                    groups_by_id[gid] = max_sev
                for alias in group.get("aliases", []):
                    groups_by_id[alias] = max_sev

            vulns: List[SCAVulnerabilityItem] = []
            for vuln in pkg.get("vulnerabilities", []):
                vid = vuln.get("id", "")
                raw_score = groups_by_id.get(vid)
                cvss_score: Optional[float] = None
                severity = "UNKNOWN"
                if raw_score is not None:
                    try:
                        cvss_score = float(raw_score)
                        severity = _cvss_to_severity(cvss_score)
                    except (ValueError, TypeError):
                        pass

                vulns.append(SCAVulnerabilityItem(
                    id=vid,
                    summary=vuln.get("summary", ""),
                    severity=severity,
                    cvss_score=cvss_score,
                    aliases=vuln.get("aliases", []),
                    references=[
                        r.get("url", "") for r in vuln.get("references", []) if r.get("url")
                    ],
                ))

            if vulns:
                packages.append(SCAVulnerablePackage(
                    name=pkg_info.get("name", ""),
                    version=pkg_info.get("version", ""),
                    ecosystem=pkg_info.get("ecosystem", ""),
                    vulnerabilities=vulns,
                ))
    return packages


def _scan_one(filename: str, content: bytes) -> SCAScanResponse:
    """Run osv-scanner on a single in-memory file and return the result."""
    is_sbom = _is_sbom(filename)
    lockfile_type = None if is_sbom else _sca_lockfile_type(filename)

    if not is_sbom and lockfile_type is None:
        return SCAScanResponse(
            filename=filename,
            total_vulnerabilities=0,
            packages=[],
            scan_error="Unsupported file type. Accepted: .xml (Maven), .txt (pip), yarn.lock, "
                       "poetry.lock, package-lock.json, composer.lock, or a GitHub SPDX SBOM (.json)",
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        # Never build the on-disk path from the client-supplied filename — it can
        # contain path-traversal sequences ("../") or be absolute, which would let
        # an attacker write arbitrary content outside tmpdir. osv-scanner is told
        # the manifest type explicitly via the --lockfile prefix (and SBOMs just
        # need a .spdx.json suffix), so the stored name is otherwise irrelevant.
        stored_name = "sbom.spdx.json" if is_sbom else f"manifest{os.path.splitext(filename)[1].lower()}"
        file_path = os.path.join(tmpdir, stored_name)
        with open(file_path, "wb") as fh:
            fh.write(content)

        cmd = (
            ["osv-scanner", "scan", "--sbom", file_path, "--format", "json"]
            if is_sbom
            else ["osv-scanner", "scan", "source", "--format", "json", "--lockfile", f"{lockfile_type}:{file_path}"]
        )

        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        except FileNotFoundError:
            return SCAScanResponse(
                filename=filename,
                total_vulnerabilities=0,
                packages=[],
                scan_error="osv-scanner is not installed on the server",
            )
        except subprocess.TimeoutExpired:
            return SCAScanResponse(
                filename=filename,
                total_vulnerabilities=0,
                packages=[],
                scan_error="Scan timed out after 60 s",
            )

        raw_output = proc.stdout or proc.stderr or ""
        # osv-scanner exits 1 when vulnerabilities are found — that's a success.
        if proc.returncode not in (0, 1):
            # Exit 128 with "found 0 packages" means the file parsed cleanly but had no deps.
            if proc.returncode == 128 and "found 0 packages" in (proc.stderr or ""):
                return SCAScanResponse(
                    filename=filename, total_vulnerabilities=0, packages=[], scan_error=None,
                )
            return SCAScanResponse(
                filename=filename,
                total_vulnerabilities=0,
                packages=[],
                scan_error=f"osv-scanner exited with code {proc.returncode}: {proc.stderr.strip()[:300]}",
            )

        pkgs = _parse_osv_output(raw_output)
        return SCAScanResponse(
            filename=filename,
            total_vulnerabilities=sum(len(p.vulnerabilities) for p in pkgs),
            packages=pkgs,
            scan_error=None,
        )


@router.post("/sca-agent/scan", response_model=List[SCAScanResponse])
@limiter.limit("5/minute")
async def sca_scan(
    request: Request,
    bg: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """Run osv-scanner against one or more uploaded SCA manifests/lockfiles."""
    _require_editor_or_admin(current_user)

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > _SCA_MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {_SCA_MAX_FILES} files per request")

    results: List[SCAScanResponse] = []
    for upload in files:
        filename = upload.filename or ""
        content = await upload.read()
        if len(content) > _SCA_MAX_FILE_BYTES:
            results.append(SCAScanResponse(
                filename=filename,
                total_vulnerabilities=0,
                packages=[],
                scan_error="File exceeds 2 MB limit",
            ))
            continue
        results.append(_scan_one(filename, content))

    total_vulns = sum(r.total_vulnerabilities for r in results)
    filenames = ", ".join(r.filename for r in results)
    bg.add_task(
        emit_audit_log,
        current_user.username, "AI_ACTION", "SCAAgent", None,
        f"Scanned {len(results)} file(s) [{filenames}]: {total_vulns} total vulnerabilities found",
        get_client_ip(request),
    )

    return results


# ---------------------------------------------------------------------------
# SCA Agent — AI analysis
# ---------------------------------------------------------------------------

class SCAScanResultInput(BaseModel):
    filename: str
    total_vulnerabilities: int
    packages: List[SCAVulnerablePackage]
    scan_error: Optional[str] = None


class SCAAnalyzeRequest(BaseModel):
    # `model_name` collides with Pydantic's protected "model_" namespace; opt out.
    model_config = ConfigDict(protected_namespaces=())

    app_name: str = Field(min_length=1, max_length=200)
    scan_results: List[SCAScanResultInput] = Field(min_length=1)
    model_name: str = "ollama/llama3.1"


class SCAFinding(BaseModel):
    package_version: str
    vulnerability_id: str
    action_required: str   # "Must Fix" | "Verify Reachability" | "Ignore/Accept Risk"
    why: str
    how_to_verify: str


class SCAAnalysisResponse(BaseModel):
    summary: str
    risk_level: str
    recommendations: List[str]
    findings: List[SCAFinding] = []


def _build_vuln_summary(scan_results: List[SCAScanResultInput]) -> str:
    """Flatten scan results into a concise text block for the AI prompt."""
    lines: List[str] = []
    for r in scan_results:
        lines.append(f"File: {r.filename}")
        if r.scan_error:
            lines.append(f"  Scan error: {r.scan_error}")
            continue
        for pkg in r.packages:
            for v in pkg.vulnerabilities:
                score = f"CVSS {v.cvss_score:.1f}" if v.cvss_score is not None else "no CVSS"
                aliases = ", ".join(v.aliases[:2]) if v.aliases else ""
                alias_str = f" ({aliases})" if aliases else ""
                lines.append(
                    f"  {pkg.name}@{pkg.version} [{pkg.ecosystem}] — "
                    f"{v.id}{alias_str} | {v.severity} | {score} | {v.summary[:120]}"
                )
    return "\n".join(lines)


@router.post("/sca-agent/analyze", response_model=SCAAnalysisResponse)
@limiter.limit("5/minute")
def sca_analyze(
    request: Request,
    body: SCAAnalyzeRequest,
    bg: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    """Use AI to produce an executive summary, risk level, and triage from SCA findings."""
    _require_editor_or_admin(current_user)

    vuln_summary = _build_vuln_summary(body.scan_results)
    result = ai_service.analyze_sca_vulnerabilities(
        app_name=body.app_name,
        vuln_summary=vuln_summary,
        model_name=body.model_name,
    )

    bg.add_task(
        emit_audit_log,
        current_user.username, "AI_ACTION", "SCAAgent", None,
        f"Generated AI analysis for '{body.app_name}' — risk level: {result.get('risk_level')}",
        get_client_ip(request),
    )
    return result


# ---------------------------------------------------------------------------
# SCA Agent — PDF report
# ---------------------------------------------------------------------------

class SCAReportFinding(BaseModel):
    package_version: str = ""
    vulnerability_id: str = ""
    action_required: str = ""
    why: str = ""
    how_to_verify: str = ""


class SCAReportRequest(BaseModel):
    app_name: str = Field(min_length=1, max_length=200)
    scan_results: List[SCAScanResultInput] = Field(min_length=1)
    ai_summary: str = ""
    ai_risk_level: str = "UNKNOWN"
    ai_recommendations: List[str] = []
    ai_findings: List[SCAReportFinding] = []


_REPORT_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "sca_reports")
os.makedirs(_REPORT_UPLOAD_DIR, exist_ok=True)


def _generate_sca_pdf(app_name: str, scan_results: List[SCAScanResultInput],
                      ai_summary: str, ai_risk_level: str,
                      ai_findings: list, output_path: str) -> None:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        BaseDocTemplate, Frame, HRFlowable, KeepTogether, NextPageTemplate,
        PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    )
    from reportlab.lib.enums import TA_CENTER

    W, H = A4
    today = datetime.utcnow().strftime("%B %d, %Y")

    # ── Palette ────────────────────────────────────────────────────────────
    NAVY  = colors.HexColor("#0D1B2A")
    BLUE  = colors.HexColor("#1565C0")
    C_CR  = colors.HexColor("#C62828")
    C_HI  = colors.HexColor("#E65100")
    C_ME  = colors.HexColor("#F9A825")
    C_LO  = colors.HexColor("#1565C0")
    C_UN  = colors.HexColor("#546E7A")
    WHITE = colors.white
    TEXT  = colors.HexColor("#212121")
    LGRAY = colors.HexColor("#F5F5F5")
    MGRAY = colors.HexColor("#E0E0E0")
    DGRAY = colors.HexColor("#616161")

    SEV_C   = {"CRITICAL": C_CR, "HIGH": C_HI, "MEDIUM": C_ME, "LOW": C_LO, "UNKNOWN": C_UN}
    SEV_HEX = {"CRITICAL": "#C62828", "HIGH": "#E65100", "MEDIUM": "#F9A825",
               "LOW": "#1565C0", "UNKNOWN": "#546E7A"}
    RISK_C  = SEV_C.get(ai_risk_level.upper(), C_UN)

    # ── Style factory ───────────────────────────────────────────────────────
    _style_cache: dict = {}

    def S(name, **kw):
        key = (name, tuple(sorted(kw.items())))
        if key not in _style_cache:
            base = dict(fontName="Helvetica", fontSize=9, textColor=TEXT, leading=13)
            base.update(kw)
            _style_cache[key] = ParagraphStyle(f"s_{name}_{len(_style_cache)}", **base)
        return _style_cache[key]

    SEC  = S("sec",  fontSize=13, fontName="Helvetica-Bold", textColor=NAVY,  spaceBefore=10, spaceAfter=4)
    BODY = S("body", fontSize=9,  leading=14, spaceAfter=3)
    TH   = S("th",   fontSize=8,  fontName="Helvetica-Bold", textColor=WHITE,  alignment=TA_CENTER)
    TD   = S("td",   fontSize=8,  leading=11)
    TDC  = S("tdc",  fontSize=8,  leading=11, alignment=TA_CENTER)
    MONO = S("mono", fontSize=7.5, fontName="Courier")

    # ── Page geometry ───────────────────────────────────────────────────────
    ACC  = 4 * mm
    LM   = 2.2 * cm
    RM   = 2.0 * cm
    BM   = 1.6 * cm
    FRAME_TOP = H - 1.8 * cm
    CW   = W - LM - RM - ACC

    def _draw_body_chrome(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(BLUE)
        canvas.rect(0, 0, ACC, H, fill=1, stroke=0)
        canvas.setStrokeColor(MGRAY)
        canvas.setLineWidth(0.5)
        canvas.line(LM + ACC, H - 1.55 * cm, W - RM, H - 1.55 * cm)
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(LM + ACC, H - 1.15 * cm, "Cognitive GRC")
        canvas.setFillColor(DGRAY)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(LM + ACC + 2.4 * cm, H - 1.15 * cm, "· Software Composition Analysis Report")
        canvas.setFillColor(BLUE)
        canvas.drawRightString(W - RM, H - 1.15 * cm, app_name)
        canvas.setStrokeColor(MGRAY)
        canvas.line(LM + ACC, BM - 0.15 * cm, W - RM, BM - 0.15 * cm)
        canvas.setFillColor(DGRAY)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(LM + ACC, BM - 0.5 * cm, f"Confidential · {today}")
        canvas.drawRightString(W - RM, BM - 0.5 * cm, f"Page {doc.page}")
        canvas.restoreState()

    def _draw_cover(canvas, doc):
        if doc.page > 1:
            _draw_body_chrome(canvas, doc)
            return
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, H - 3.8 * cm, W, 3.8 * cm, fill=1, stroke=0)
        canvas.setFillColor(BLUE)
        canvas.rect(0, 0, ACC, H - 3.8 * cm, fill=1, stroke=0)
        canvas.rect(0, 0, W, 1.1 * cm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(LM + ACC, H - 1.5 * cm, "Cognitive GRC")
        canvas.setFillColor(colors.HexColor("#90A4AE"))
        canvas.setFont("Helvetica", 7.5)
        canvas.drawRightString(W - RM, H - 1.1 * cm, "CONFIDENTIAL — DO NOT DISTRIBUTE")
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(LM + ACC, H - 2.45 * cm, "SOFTWARE COMPOSITION ANALYSIS")
        canvas.setFillColor(colors.HexColor("#90CAF9"))
        canvas.setFont("Helvetica", 9)
        canvas.drawString(LM + ACC, H - 3.1 * cm, "Vulnerability Assessment Report")
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(LM + ACC, 0.32 * cm, f"Generated {today}")
        canvas.drawRightString(W - RM, 0.32 * cm, "Page 1")
        canvas.restoreState()

    def _draw_page(canvas, doc):
        _draw_body_chrome(canvas, doc)

    cover_frame = Frame(
        LM + ACC, BM + 1.3 * cm, CW, H - 3.8 * cm - BM - 1.3 * cm,
        id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    body_frame = Frame(
        LM + ACC, BM, CW, FRAME_TOP - BM,
        id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    doc = BaseDocTemplate(
        output_path, pagesize=A4,
        pageTemplates=[
            PageTemplate("cover", frames=[cover_frame], onPage=_draw_cover),
            PageTemplate("body",  frames=[body_frame],  onPage=_draw_page),
        ],
    )

    # ── Pre-compute stats ─────────────────────────────────────────────────
    sev_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for r in scan_results:
        for pkg in r.packages:
            for v in pkg.vulnerabilities:
                if v.severity in sev_counts:
                    sev_counts[v.severity] += 1
    total_vulns = sum(r.total_vulnerabilities for r in scan_results)

    story = []
    story.append(Spacer(1, 1.2 * cm))
    story.append(Paragraph(
        _esc(app_name),
        S("cv_app", fontSize=26, fontName="Helvetica-Bold", textColor=NAVY, leading=30, spaceAfter=6),
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=BLUE, spaceAfter=10, spaceBefore=2))

    risk_label = S("rl", fontSize=9, fontName="Helvetica-Bold", textColor=RISK_C)
    meta_tbl = Table(
        [[Paragraph("Overall Risk", S("ml", fontSize=7, fontName="Helvetica-Bold", textColor=DGRAY)),
          Paragraph("Files Scanned", S("ml", fontSize=7, fontName="Helvetica-Bold", textColor=DGRAY)),
          Paragraph("Total Vulnerabilities", S("ml", fontSize=7, fontName="Helvetica-Bold", textColor=DGRAY))],
         [Paragraph(_esc(ai_risk_level), risk_label),
          Paragraph(str(len(scan_results)), S("mv", fontSize=9)),
          Paragraph(str(total_vulns), S("mv", fontSize=9))]],
        colWidths=[CW / 3] * 3,
    )
    meta_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("LINEBELOW",     (0, 0), (-1, 0), 0.5, MGRAY),
        ("LINEAFTER",     (0, 0), (1, -1), 0.5, MGRAY),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 0.8 * cm))

    sev_items = list(sev_counts.items())
    sev_colors_list = [C_CR, C_HI, C_ME, C_LO]
    card_data = [
        [Paragraph(k, S(f"ck{i}", fontSize=7, fontName="Helvetica-Bold",
                        textColor=WHITE, alignment=TA_CENTER))
         for i, (k, _) in enumerate(sev_items)],
        [Paragraph(str(v), S(f"cv{i}", fontSize=24, fontName="Helvetica-Bold",
                             textColor=WHITE, alignment=TA_CENTER, leading=26))
         for i, (_, v) in enumerate(sev_items)],
        [Paragraph("vulns", S(f"cs{i}", fontSize=6.5, textColor=WHITE, alignment=TA_CENTER))
         for i in range(4)],
    ]
    card_tbl = Table(card_data, colWidths=[CW / 4] * 4,
                     rowHeights=[0.55 * cm, 1.1 * cm, 0.45 * cm])
    card_style = [
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 2),
        ("LINEBEFORE",    (1, 0), (3, -1), 1, WHITE),
    ]
    for i, c in enumerate(sev_colors_list):
        card_style.append(("BACKGROUND", (i, 0), (i, -1), c))
    card_tbl.setStyle(TableStyle(card_style))
    story.append(card_tbl)
    story.append(Spacer(1, 0.6 * cm))

    if ai_summary:
        story.append(Paragraph("Executive Summary", SEC))
        story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=8))
        story.append(Paragraph(_esc(ai_summary), BODY))
        story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Scan Summary", SEC))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=8))

    scan_hdr = ["File", "Critical", "High", "Medium", "Low", "Total"]
    scan_rows: list = [[Paragraph(h, TH) for h in scan_hdr]]
    for r in scan_results:
        rc = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for pkg in r.packages:
            for v in pkg.vulnerabilities:
                if v.severity in rc:
                    rc[v.severity] += 1
        scan_rows.append([
            Paragraph(_esc(r.filename), TD),
            Paragraph(str(rc["CRITICAL"]), TDC),
            Paragraph(str(rc["HIGH"]),     TDC),
            Paragraph(str(rc["MEDIUM"]),   TDC),
            Paragraph(str(rc["LOW"]),      TDC),
            Paragraph(str(r.total_vulnerabilities), TDC),
        ])

    scan_tbl = Table(
        scan_rows,
        colWidths=[CW * 0.38, CW * 0.12, CW * 0.12, CW * 0.12, CW * 0.12, CW * 0.14],
        repeatRows=1,
    )
    scan_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), BLUE),
        ("ALIGN",         (1, 0), (-1, -1), "CENTER"),
        ("ALIGN",         (0, 0), (0, -1), "LEFT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LGRAY]),
        ("GRID",          (0, 0), (-1, -1), 0.4, MGRAY),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    story.append(scan_tbl)
    story.append(Spacer(1, 0.5 * cm))

    # ── AI Vulnerability Triage ───────────────────────────────────────────
    if ai_findings:
        story.append(NextPageTemplate("body"))
        story.append(PageBreak())
        ACTION_HEX = {
            "Must Fix":            "#C62828",
            "Verify Reachability": "#E65100",
            "Ignore/Accept Risk":  "#2E7D32",
        }
        ACTION_ORDER = {"Must Fix": 0, "Verify Reachability": 1, "Ignore/Accept Risk": 2}
        sorted_findings = sorted(ai_findings, key=lambda f: ACTION_ORDER.get(
            f.get("action_required") if isinstance(f, dict) else f.action_required, 9))

        story.append(Paragraph("Vulnerability Triage", SEC))
        story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=8))

        triage_hdr = [Paragraph(t, TH) for t in [
            "Package & Version", "Vulnerability ID", "Action Required", "Why", "How to Verify Reachability"
        ]]
        triage_col_w = [CW * p for p in [0.18, 0.13, 0.14, 0.27, 0.28]]
        triage_rows = [triage_hdr]

        for f in sorted_findings:
            pkg_v  = f.get("package_version",  "") if isinstance(f, dict) else f.package_version
            vid    = f.get("vulnerability_id",  "") if isinstance(f, dict) else f.vulnerability_id
            action = f.get("action_required",   "") if isinstance(f, dict) else f.action_required
            why    = f.get("why",               "") if isinstance(f, dict) else f.why
            verify = f.get("how_to_verify",     "") if isinstance(f, dict) else f.how_to_verify
            color  = ACTION_HEX.get(action, "#546E7A")
            triage_rows.append([
                Paragraph(_esc(pkg_v),  MONO),
                Paragraph(_esc(vid),    MONO),
                Paragraph(f"<font color='{color}'><b>{_esc(action)}</b></font>", TDC),
                Paragraph(_esc(why[:300]),    TD),
                Paragraph(_esc(verify[:300]) if verify != "N/A" else "N/A", TD),
            ])

        triage_tbl = Table(triage_rows, colWidths=triage_col_w, repeatRows=1)
        triage_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), BLUE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LGRAY]),
            ("GRID",          (0, 0), (-1, -1), 0.3, MGRAY),
            ("ALIGN",         (2, 0), (2, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ]))
        story.append(triage_tbl)
        story.append(Spacer(1, 0.5 * cm))

    # ── Critical & High Findings ──────────────────────────────────────────
    story.append(NextPageTemplate("body"))
    story.append(PageBreak())
    story.append(Paragraph("Critical & High Vulnerability Findings", SEC))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=8))

    col_w = [CW * p for p in [0.18, 0.09, 0.14, 0.10, 0.07, 0.42]]
    hdr_row = [Paragraph(t, TH) for t in ["Package", "Version", "CVE / ID", "Severity", "CVSS", "Summary"]]

    findings_added = False
    for r in scan_results:
        for pkg in r.packages:
            ch = [v for v in pkg.vulnerabilities if v.severity in ("CRITICAL", "HIGH")]
            if not ch:
                continue
            findings_added = True
            pkg_p = Paragraph(
                f"<b>{_esc(pkg.name)}</b><br/>"
                f"<font size='7' color='#757575'>{_esc(pkg.ecosystem)} · {_esc(r.filename)}</font>",
                TD,
            )
            rows = [hdr_row]
            for v in sorted(ch, key=lambda x: 0 if x.severity == "CRITICAL" else 1):
                hex_c = SEV_HEX.get(v.severity, "#546E7A")
                rows.append([
                    pkg_p if v is ch[0] else Paragraph("", TD),
                    Paragraph(_esc(pkg.version), MONO),
                    Paragraph(_esc(v.id), MONO),
                    Paragraph(f"<font color='{hex_c}'><b>{_esc(v.severity)}</b></font>", TDC),
                    Paragraph(f"{v.cvss_score:.1f}" if v.cvss_score else "—", TDC),
                    Paragraph(_esc(v.summary[:200]), TD),
                ])
            tbl = Table(rows, colWidths=col_w, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, 0), BLUE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LGRAY]),
                ("GRID",          (0, 0), (-1, -1), 0.3, MGRAY),
                ("ALIGN",         (2, 0), (4, -1), "CENTER"),
                ("VALIGN",        (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING",    (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING",   (0, 0), (-1, -1), 4),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
            ]))
            story.append(KeepTogether([tbl, Spacer(1, 0.3 * cm)]))

    if not findings_added:
        story.append(Paragraph("No Critical or High vulnerabilities were identified.", BODY))

    doc.build(story)


@router.post("/sca-agent/report")
@limiter.limit("5/minute")
def sca_report(
    request: Request,
    body: SCAReportRequest,
    bg: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    """Generate and return a PDF SCA report."""
    _require_editor_or_admin(current_user)

    safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in body.app_name)[:60]
    filename = f"SCA_Report_{safe_name}_{uuid.uuid4().hex[:8]}.pdf"
    output_path = os.path.join(_REPORT_UPLOAD_DIR, filename)

    _generate_sca_pdf(
        app_name=body.app_name,
        scan_results=body.scan_results,
        ai_summary=body.ai_summary,
        ai_risk_level=body.ai_risk_level,
        ai_findings=[f.model_dump() for f in body.ai_findings],
        output_path=output_path,
    )

    bg.add_task(
        emit_audit_log,
        current_user.username, "AI_ACTION", "SCAAgent", None,
        f"Generated SCA PDF report for '{body.app_name}'",
        get_client_ip(request),
    )

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=filename,
        background=BackgroundTask(_delete_file, output_path),
    )


# ---------------------------------------------------------------------------
# SCA Agent — save & history
# ---------------------------------------------------------------------------

@router.post("/sca-agent/save")
def save_sca_report(
    request: Request,
    body: SCAReportRequest,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Save an SCA report to the database."""
    _require_editor_or_admin(current_user)

    from app.models.sca import SCAReport
    report = SCAReport(
        app_name=body.app_name,
        risk_level=body.ai_risk_level,
        summary=body.ai_summary,
        scan_results=[r.model_dump() for r in body.scan_results],
        recommendations=body.ai_recommendations,
        findings=[f.model_dump() for f in body.ai_findings],
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    bg.add_task(
        emit_audit_log,
        current_user.username, "CREATE", "SCAAgent", str(report.id),
        f"Saved SCA report for '{body.app_name}'",
        get_client_ip(request),
    )
    return {"id": report.id, "message": "Report saved successfully"}


@router.get("/sca-agent/history")
def list_sca_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all saved SCA reports."""
    from app.models.sca import SCAReport
    reports = db.query(SCAReport).order_by(SCAReport.created_at.desc()).all()

    def _count_severity(scan_results, level: str) -> int:
        count = 0
        for file_result in (scan_results or []):
            for pkg in (file_result.get("packages") or []):
                for vuln in (pkg.get("vulnerabilities") or []):
                    if vuln.get("severity", "").upper() == level:
                        count += 1
        return count

    return [
        {
            "id": r.id,
            "app_name": r.app_name,
            "risk_level": r.risk_level,
            "created_at": r.created_at,
            "critical_count": _count_severity(r.scan_results, "CRITICAL"),
            "high_count": _count_severity(r.scan_results, "HIGH"),
        }
        for r in reports
    ]


@router.get("/sca-agent/history/{report_id}")
def get_sca_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a specific saved SCA report."""
    from app.models.sca import SCAReport
    report = db.query(SCAReport).filter(SCAReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "id": report.id,
        "app_name": report.app_name,
        "ai_risk_level": report.risk_level,
        "ai_summary": report.summary,
        "scan_results": report.scan_results,
        "ai_recommendations": report.recommendations,
        "ai_findings": report.findings,
        "created_at": report.created_at,
    }


@router.delete("/sca-agent/history/{report_id}")
def delete_sca_report(
    request: Request,
    report_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a saved SCA report."""
    _require_editor_or_admin(current_user)

    from app.models.sca import SCAReport
    report = db.query(SCAReport).filter(SCAReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    db.delete(report)
    db.commit()

    bg.add_task(
        emit_audit_log,
        current_user.username, "DELETE", "SCAAgent", str(report_id),
        f"Deleted SCA report for '{report.app_name}'",
        get_client_ip(request),
    )
    return {"message": "Report deleted successfully"}
