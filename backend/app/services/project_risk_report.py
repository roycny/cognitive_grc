"""PDF generation for Project Risk Assessment reports.

Renders a polished report: cover, executive summary, overall inherent/residual
risk cards, a 5×5 residual-risk heatmap showing where each risk lands, and a
detailed risk register table. Mirrors the visual language of the SCA report.
"""

from datetime import datetime
from xml.sax.saxutils import escape as _esc  # neutralise ReportLab markup in dynamic text

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, HRFlowable, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

# ── Palette ────────────────────────────────────────────────────────────────
NAVY = colors.HexColor("#0D1B2A")
BLUE = colors.HexColor("#1565C0")
WHITE = colors.white
TEXT = colors.HexColor("#212121")
LGRAY = colors.HexColor("#F5F5F5")
MGRAY = colors.HexColor("#E0E0E0")
DGRAY = colors.HexColor("#616161")

RATING_HEX = {
    "Critical": "#C62828",
    "High": "#E65100",
    "Medium": "#F9A825",
    "Low": "#2E7D32",
}
RATING_C = {k: colors.HexColor(v) for k, v in RATING_HEX.items()}
RATING_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}


def _rating_color(rating):
    return RATING_C.get(rating or "", colors.HexColor("#546E7A"))


def generate_project_risk_pdf(assessment, output_path: str) -> None:
    W, H = A4
    today = datetime.utcnow().strftime("%B %d, %Y")
    project = assessment.project_name or "Untitled Project"
    risks = list(assessment.risks)

    # ── Styles ───────────────────────────────────────────────────────────────
    _cache: dict = {}

    def S(name, **kw):
        key = (name, tuple(sorted(kw.items())))
        if key not in _cache:
            base = dict(fontName="Helvetica", fontSize=9, textColor=TEXT, leading=13)
            base.update(kw)
            _cache[key] = ParagraphStyle(f"s_{name}_{len(_cache)}", **base)
        return _cache[key]

    SEC = S("sec", fontSize=13, fontName="Helvetica-Bold", textColor=NAVY, spaceBefore=10, spaceAfter=4)
    BODY = S("body", fontSize=9, leading=14, spaceAfter=3)
    TH = S("th", fontSize=8, fontName="Helvetica-Bold", textColor=WHITE, alignment=TA_CENTER)
    TD = S("td", fontSize=7.5, leading=10)
    TDC = S("tdc", fontSize=7.5, leading=10, alignment=TA_CENTER)

    # ── Geometry ─────────────────────────────────────────────────────────────
    ACC = 4 * mm
    LM = 2.0 * cm
    RM = 1.8 * cm
    BM = 1.6 * cm
    FRAME_TOP = H - 1.8 * cm
    CW = W - LM - RM - ACC

    def _chrome(canvas, doc):
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
        canvas.drawString(LM + ACC + 2.4 * cm, H - 1.15 * cm, "· Project Risk Assessment")
        canvas.setFillColor(BLUE)
        canvas.drawRightString(W - RM, H - 1.15 * cm, project[:48])
        canvas.setStrokeColor(MGRAY)
        canvas.line(LM + ACC, BM - 0.15 * cm, W - RM, BM - 0.15 * cm)
        canvas.setFillColor(DGRAY)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(LM + ACC, BM - 0.5 * cm, f"Confidential · {today}")
        canvas.drawRightString(W - RM, BM - 0.5 * cm, f"Page {doc.page}")
        canvas.restoreState()

    frame = Frame(LM + ACC, BM, CW, FRAME_TOP - BM, id="body",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc = BaseDocTemplate(output_path, pagesize=A4,
                          pageTemplates=[PageTemplate("body", frames=[frame], onPage=_chrome)])

    story = []
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(project, S("title", fontSize=22, fontName="Helvetica-Bold",
                                      textColor=NAVY, leading=26, spaceAfter=4)))
    story.append(Paragraph("Project Risk Assessment Report",
                           S("sub", fontSize=11, textColor=DGRAY, spaceAfter=6)))
    story.append(HRFlowable(width="100%", thickness=2, color=BLUE, spaceAfter=10))

    # ── Meta + overall rating cards ─────────────────────────────────────────
    inh = assessment.overall_inherent_rating or "—"
    res = assessment.overall_residual_rating or "—"
    meta = Table(
        [[Paragraph("Assessor", S("ml", fontSize=7, fontName="Helvetica-Bold", textColor=DGRAY)),
          Paragraph("Period", S("ml", fontSize=7, fontName="Helvetica-Bold", textColor=DGRAY)),
          Paragraph("Status", S("ml", fontSize=7, fontName="Helvetica-Bold", textColor=DGRAY)),
          Paragraph("Risks", S("ml", fontSize=7, fontName="Helvetica-Bold", textColor=DGRAY))],
         [Paragraph(assessment.assessor or "—", S("mv", fontSize=9)),
          Paragraph(assessment.period or "—", S("mv", fontSize=9)),
          Paragraph(assessment.status or "—", S("mv", fontSize=9)),
          Paragraph(str(len(risks)), S("mv", fontSize=9))]],
        colWidths=[CW / 4] * 4,
    )
    meta.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, MGRAY),
    ]))
    story.append(meta)
    story.append(Spacer(1, 0.5 * cm))

    def _rating_card(label, rating):
        c = _rating_color(rating)
        t = Table(
            [[Paragraph(label, S("cl", fontSize=8, fontName="Helvetica-Bold", textColor=WHITE, alignment=TA_CENTER))],
             [Paragraph((rating or "—").upper(), S("cv", fontSize=15, fontName="Helvetica-Bold",
                                                   textColor=WHITE, alignment=TA_CENTER, leading=18))]],
            colWidths=[CW / 2 - 0.3 * cm], rowHeights=[0.55 * cm, 0.9 * cm],
        )
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), c), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        return t

    cards = Table([[_rating_card("Overall Inherent Risk", inh), _rating_card("Overall Residual Risk", res)]],
                  colWidths=[CW / 2, CW / 2])
    cards.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 6),
                               ("RIGHTPADDING", (1, 0), (1, 0), 0)]))
    story.append(cards)
    story.append(Spacer(1, 0.6 * cm))

    # ── Executive summary ────────────────────────────────────────────────────
    if assessment.executive_summary:
        story.append(Paragraph("Executive Summary", SEC))
        story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=8))
        story.append(Paragraph(_esc(assessment.executive_summary), BODY))
        story.append(Spacer(1, 0.5 * cm))

    # ── 5×5 residual risk heatmap ────────────────────────────────────────────
    story.append(Paragraph("Residual Risk Matrix", SEC))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=8))

    # Count risks per (impact, likelihood) cell using residual scores.
    grid = {(i, l): 0 for i in range(1, 6) for l in range(1, 6)}
    for r in risks:
        l = r.residual_likelihood or r.likelihood
        i = r.residual_impact or r.impact
        if l and i:
            grid[(i, l)] += 1

    # Rows = impact 5..1 (top=high), cols = likelihood 1..5
    matrix_rows = [[Paragraph("Impact ↓ / Likelihood →", S("mh", fontSize=6.5, fontName="Helvetica-Bold",
                                                           textColor=WHITE, alignment=TA_CENTER))]
                   + [Paragraph(str(l), S("mh2", fontSize=8, fontName="Helvetica-Bold",
                                          textColor=WHITE, alignment=TA_CENTER)) for l in range(1, 6)]]
    for i in range(5, 0, -1):
        row = [Paragraph(str(i), S("mi", fontSize=8, fontName="Helvetica-Bold",
                                   textColor=WHITE, alignment=TA_CENTER))]
        for l in range(1, 6):
            n = grid[(i, l)]
            row.append(Paragraph(str(n) if n else "", S(f"cell{i}{l}", fontSize=9,
                       fontName="Helvetica-Bold", textColor=colors.white, alignment=TA_CENTER)))
        matrix_rows.append(row)

    cellw = (CW - 1.4 * cm) / 5
    matrix = Table(matrix_rows, colWidths=[1.4 * cm] + [cellw] * 5,
                   rowHeights=[0.6 * cm] + [0.85 * cm] * 5)
    mstyle = [
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, WHITE),
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("BACKGROUND", (0, 1), (0, -1), NAVY),
    ]
    # Color each data cell by its score band.
    for ri, i in enumerate(range(5, 0, -1), start=1):
        for ci, l in enumerate(range(1, 6), start=1):
            band = ("Critical" if i * l >= 16 else "High" if i * l >= 10
                    else "Medium" if i * l >= 5 else "Low")
            mstyle.append(("BACKGROUND", (ci, ri), (ci, ri), _rating_color(band)))
    matrix.setStyle(TableStyle(mstyle))
    story.append(matrix)
    story.append(Spacer(1, 0.2 * cm))
    legend = " · ".join(f'<font color="{RATING_HEX[k]}">■</font> {k}' for k in
                        ["Low", "Medium", "High", "Critical"])
    story.append(Paragraph(f"Cell values = number of risks · {legend}",
                           S("lg", fontSize=7.5, textColor=DGRAY)))
    story.append(Spacer(1, 0.6 * cm))

    # ── Risk register table ──────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Risk Register", SEC))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=8))

    hdr = [Paragraph(t, TH) for t in
           ["#", "Risk / Category", "Inherent", "Residual", "Recommended Mitigation", "Owner / Actions"]]
    col_w = [CW * p for p in [0.04, 0.26, 0.09, 0.09, 0.30, 0.22]]
    rows = [hdr]

    ordered = sorted(risks, key=lambda r: RATING_ORDER.get(r.residual_rating or "", 9))
    for idx, r in enumerate(ordered, start=1):
        inh_c = RATING_HEX.get(r.inherent_rating or "", "#546E7A")
        res_c = RATING_HEX.get(r.residual_rating or "", "#546E7A")
        risk_cell = Paragraph(
            f"<b>{_esc((r.title or '')[:120])}</b><br/>"
            f"<font size='6.5' color='#757575'>{_esc(r.category or '—')} · "
            f"L{r.likelihood or '-'}×I{r.impact or '-'}</font>", TD)
        actions = r.action_items if isinstance(r.action_items, list) else []
        action_txt = "<br/>".join(f"• {_esc(str(a))}" for a in actions[:3]) if actions else ""
        owner_cell = Paragraph(
            (f"<b>{_esc(r.owner)}</b><br/>" if r.owner else "") + action_txt, TD)
        rows.append([
            Paragraph(str(idx), TDC),
            risk_cell,
            Paragraph(f"<font color='{inh_c}'><b>{_esc(r.inherent_rating or '—')}</b></font>", TDC),
            Paragraph(f"<font color='{res_c}'><b>{_esc(r.residual_rating or '—')}</b></font>", TDC),
            Paragraph(_esc((r.recommended_mitigation or "—")[:400]), TD),
            owner_cell,
        ])

    if len(rows) == 1:
        story.append(Paragraph("No risks have been recorded for this assessment.", BODY))
    else:
        tbl = Table(rows, colWidths=col_w, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BLUE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LGRAY]),
            ("GRID", (0, 0), (-1, -1), 0.3, MGRAY),
            ("ALIGN", (2, 0), (3, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(KeepTogether([tbl]))

    doc.build(story)
