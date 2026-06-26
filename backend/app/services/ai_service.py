"""
Lightweight AI service for the AI Tools module.

Supports two providers, selected by the ``model_name`` passed from the frontend
(the value the user picks in Settings, stored under the ``ai_model`` key):

  * ``ollama/<model>`` — a locally hosted Ollama model. No API key required;
    this is the default provider for local/self-hosted deployments.
  * anything else (e.g. ``gemini-2.5-pro``) — Google Gemini. Requires a
    ``GEMINI_API_KEY`` env var (or the ``/run/secrets/gemini_api_key`` Docker
    secret). Degrades gracefully to an "AI not configured" response if absent.

The ``google-generativeai`` package is imported lazily so the rest of the app
keeps working even when it (or a Gemini key) isn't available.
"""

import json
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# How long to wait on a single AI generation call (Ollama can be slow on CPU).
_OLLAMA_TIMEOUT_S = 300


# ---------------------------------------------------------------------------
# Policy Gap Analyst — supported control frameworks
# ---------------------------------------------------------------------------
# Each entry is a compact description the model uses as grounding when scoring a
# policy document for gaps. Keep keys human-readable — they double as the labels
# shown in the UI dropdown and stored on each saved gap.
POLICY_FRAMEWORKS: dict = {
    "NIST CSF 2.0": (
        "NIST Cybersecurity Framework (CSF) 2.0 — six core Functions:\n"
        "1. GOVERN (GV): cybersecurity risk-management strategy, roles, policy, oversight, supply-chain risk.\n"
        "2. IDENTIFY (ID): asset, data, supplier, and risk understanding; risk assessment.\n"
        "3. PROTECT (PR): identity & access control, awareness & training, data security, platform security, resilience.\n"
        "4. DETECT (DE): continuous monitoring and adverse-event analysis.\n"
        "5. RESPOND (RS): incident management, analysis, mitigation, reporting & communication.\n"
        "6. RECOVER (RC): incident recovery plan execution and communication."
    ),
    "NIST SP 800-53 Rev. 5": (
        "NIST SP 800-53 Rev. 5 security & privacy control families, e.g. AC (Access Control), "
        "AU (Audit & Accountability), CM (Configuration Management), CP (Contingency Planning), "
        "IA (Identification & Authentication), IR (Incident Response), RA (Risk Assessment), "
        "SC (System & Communications Protection), SI (System & Information Integrity), "
        "AT (Awareness & Training), MA (Maintenance), MP (Media Protection), PE (Physical & "
        "Environmental), PL (Planning), PS (Personnel Security), SA (System & Services Acquisition)."
    ),
    "ISO/IEC 27001:2022": (
        "ISO/IEC 27001:2022 ISMS clauses 4-10 plus Annex A (93 controls in 4 themes): "
        "Organizational (A.5), People (A.6), Physical (A.7), and Technological (A.8). "
        "Covers risk treatment, Statement of Applicability, access control, cryptography, "
        "operations security, supplier relationships, incident management, and continuity."
    ),
    "SOC 2 (Trust Services Criteria)": (
        "AICPA SOC 2 Trust Services Criteria: Security/Common Criteria (CC1-CC9 — control "
        "environment, communication, risk assessment, monitoring, logical & physical access, "
        "system operations, change management, risk mitigation), plus Availability, "
        "Confidentiality, Processing Integrity, and Privacy criteria."
    ),
    "PCI DSS v4.0": (
        "PCI DSS v4.0 twelve requirements: install/maintain network security controls; secure "
        "configurations; protect stored account data; protect data in transit; anti-malware; "
        "secure systems & software; restrict access by need-to-know; identify & authenticate "
        "access; restrict physical access; log & monitor; test security regularly; maintain an "
        "information security policy."
    ),
    "CIS Controls v8": (
        "CIS Critical Security Controls v8 (18 controls): inventory of enterprise assets & "
        "software, data protection, secure configuration, account & access control management, "
        "vulnerability management, audit log management, email/web & malware defenses, data "
        "recovery, network infrastructure management, security awareness, service-provider "
        "management, application software security, incident response, and penetration testing."
    ),
    "HIPAA Security Rule": (
        "HIPAA Security Rule safeguards for ePHI (45 CFR §164.308-316): Administrative "
        "safeguards (security management, risk analysis, workforce security, training, "
        "contingency plan), Physical safeguards (facility access, workstation & device "
        "controls), Technical safeguards (access control, audit controls, integrity, "
        "authentication, transmission security), plus organizational & documentation requirements."
    ),
    "GLBA Safeguards Rule": (
        "GLBA / Interagency Guidelines (§501(b)) Information Security Program: designate a "
        "qualified individual, written risk assessment, access controls, encryption of customer "
        "data in transit & at rest, MFA, secure development, change management, monitoring & "
        "logging, vendor oversight, incident response plan, training, and board reporting."
    ),
    "GDPR": (
        "EU GDPR data-protection obligations: lawful basis & consent, data-subject rights, "
        "data minimization & purpose limitation, records of processing (Art. 30), security of "
        "processing (Art. 32 — encryption, confidentiality, integrity, availability, resilience), "
        "breach notification (Arts. 33-34), DPIAs (Art. 35), data-protection by design & default, "
        "and international transfer safeguards."
    ),
    "OCC Cybersecurity Supervision (CSW)": (
        "OCC Cybersecurity Supervision Work Program domains: governance & risk management; cyber "
        "risk identification & assessment; cybersecurity controls (access, network, endpoint, "
        "encryption, patching); external dependency / third-party management; incident "
        "identification, reporting & response; awareness & training; business continuity & "
        "resilience; and independent audit."
    ),
}


class AIService:
    """Provider-agnostic helper for the AI Tools agents."""

    # -- provider helpers ---------------------------------------------------

    @staticmethod
    def _is_ollama_model(model_name: str) -> bool:
        return bool(model_name) and model_name.startswith("ollama/")

    @staticmethod
    def _ollama_model_name(model_name: str) -> str:
        return model_name[len("ollama/"):]

    def _call_ollama(self, model_name: str, prompt: str) -> str:
        """Call the local Ollama /api/generate endpoint and return the text."""
        actual_model = self._ollama_model_name(model_name)
        payload = json.dumps({
            "model": actual_model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.3},
        }).encode()
        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=_OLLAMA_TIMEOUT_S) as resp:
            data = json.loads(resp.read().decode())
        return data.get("response", "")

    @staticmethod
    def _get_gemini_api_key() -> str:
        """Read the Gemini key from a Docker secret first, then the environment."""
        try:
            with open("/run/secrets/gemini_api_key", "r") as fh:
                key = fh.read().strip()
                if key:
                    return key
        except FileNotFoundError:
            pass
        return os.getenv("GEMINI_API_KEY", "")

    def _call_gemini(self, model_name: str, prompt: str) -> str:
        """Call Google Gemini. Raises if the SDK or key is unavailable."""
        api_key = self._get_gemini_api_key()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")
        import google.generativeai as genai  # lazy import — optional dependency

        genai.configure(api_key=api_key)
        # The Settings page stores bare ids like "gemini-2.5-pro"; the SDK
        # accepts both that and the "models/..." form.
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        return response.text

    def _generate(self, model_name: str, prompt: str) -> str:
        if self._is_ollama_model(model_name):
            return self._call_ollama(model_name, prompt)
        return self._call_gemini(model_name, prompt)

    @staticmethod
    def _strip_code_fences(raw: str) -> str:
        """Remove leading/trailing markdown code fences the model may add."""
        text = raw.strip()
        for fence in ("```aql", "```sql", "```python", "```yaml", "```yml",
                      "```yara", "```json", "```"):
            if text.lower().startswith(fence):
                text = text[len(fence):]
                break
        if text.endswith("```"):
            text = text[: -len("```")]
        return text.strip()

    # -- SIEM Script Agent --------------------------------------------------

    # Per-format guidance so the model emits the right syntax for each target.
    _SIEM_FORMAT_HINTS = {
        "AQL Query": (
            "Output a single IBM QRadar AQL (Ariel Query Language) statement. "
            "Use SELECT ... FROM events/flows with a WHERE clause and an appropriate "
            "time window using LAST or START/STOP. Use '--' for inline comments."
        ),
        "Python (API Script)": (
            "Output a self-contained Python 3 script that queries a SIEM REST API "
            "(e.g. QRadar/Splunk/Elastic) using the requests library. Parameterise the "
            "base URL and API token via constants at the top. Use '#' for comments and "
            "include basic error handling."
        ),
        "YARA Rule": (
            "Output one or more valid YARA rules with meta, strings, and condition "
            "sections. Use '//' for comments. Include a meaningful rule name and "
            "author/description meta fields."
        ),
        "Sigma Rule": (
            "Output a valid Sigma detection rule in YAML following the official Sigma "
            "schema (title, status, description, logsource, detection, condition, level, "
            "tags). Use '#' for comments. Map to relevant MITRE ATT&CK techniques in tags."
        ),
    }

    def generate_siem_script(
        self,
        goal: str,
        script_type: str = "AQL Query",
        timeframe: str = "Last 24 Hours",
        log_sources: str = "",
        ioc_content: str = "",
        model_name: str = "ollama/llama3.1",
    ) -> str:
        """Generate a SIEM/SOC detection script from a natural-language goal."""
        if not self._is_ollama_model(model_name) and not self._get_gemini_api_key():
            return ("-- AI provider not configured. Select a local Ollama model in "
                    "Settings, or set GEMINI_API_KEY for cloud generation.")

        format_hint = self._SIEM_FORMAT_HINTS.get(
            script_type, "Output the requested artifact as raw text."
        )
        ioc_block = ioc_content.strip()[:6000]
        ioc_section = (
            f"\nIndicators of Compromise (IOCs) to incorporate into the detection:\n{ioc_block}\n"
            if ioc_block else ""
        )

        prompt = f"""You are a senior SOC security analyst and SIEM detection engineer.
Generate a highly accurate, production-ready {script_type} for a security investigation.

Context and parameters:
- Investigation goal: {goal}
- Output format: {script_type}
- Timeframe context: {timeframe}
- Log sources / devices (if applicable): {log_sources or "Not specified"}
{ioc_section}
Format requirements:
{format_hint}

Instructions:
1. Output ONLY the raw {script_type} — no conversational text, no explanations before or after.
2. Do NOT wrap the output in markdown code fences.
3. Add concise inline comments (using the correct comment syntax for the format) explaining the detection logic, especially where IOCs were injected.
4. Make reasonable, clearly-commented assumptions about field names if they are not specified.

Now output the {script_type}."""

        try:
            raw = self._generate(model_name, prompt)
            return self._strip_code_fences(raw)
        except Exception as e:
            logger.error(f"Error generating SIEM script: {e}")
            return f"-- Error generating script: {e}"

    def refine_siem_script(
        self,
        current_script: str,
        refinement_request: str,
        chat_history: list,
        script_type: str = "AQL Query",
        model_name: str = "ollama/llama3.1",
    ) -> dict:
        """Refine an existing SIEM script given a conversational request."""
        if not self._is_ollama_model(model_name) and not self._get_gemini_api_key():
            return {
                "script": current_script,
                "reply": "AI provider not configured. Select a local Ollama model in "
                         "Settings, or set GEMINI_API_KEY for cloud refinement.",
            }

        history_str = ""
        for msg in (chat_history or []):
            role = "User" if msg.get("role") == "user" else "Assistant"
            history_str += f"{role}: {msg.get('content')}\n"

        prompt = f"""You are a senior SOC security analyst and SIEM detection engineer
helping a user refine their {script_type}.

CURRENT {script_type.upper()}:
{current_script[:18000]}

PREVIOUS CONVERSATION:
{history_str or "(none)"}

USER REFINEMENT REQUEST:
{refinement_request}

Instructions:
1. Apply the requested change while keeping the script a valid {script_type}.
2. Respond with ONLY a JSON object with exactly two keys:
   - "script": the full updated raw {script_type} (no markdown fences inside the value).
   - "reply": a brief 1-2 sentence conversational explanation of what you changed.
3. Output nothing outside the JSON object.

Now output the JSON."""

        try:
            raw = self._generate(model_name, prompt)
            raw = self._strip_code_fences(raw)
            result = json.loads(raw)
            return {
                "script": str(result.get("script", current_script)),
                "reply": str(result.get("reply", "Updated the script based on your request.")),
            }
        except Exception as e:
            logger.error(f"Error refining SIEM script: {e}")
            return {"script": current_script, "reply": f"Error refining script: {e}"}

    # -- SCA Agent ----------------------------------------------------------

    def analyze_sca_vulnerabilities(
        self, app_name: str, vuln_summary: str, model_name: str = "ollama/llama3.1"
    ) -> dict:
        """
        Expert SCA triage: filter noise, flag known-exploited CVEs, analyse
        exploit conditions. Returns: summary, risk_level, recommendations,
        findings (a per-CVE triage table).
        """
        # If a cloud model is selected but no key is configured, fail soft.
        if not self._is_ollama_model(model_name) and not self._get_gemini_api_key():
            return {
                "summary": "AI provider not configured. Select a local Ollama model "
                           "in Settings, or set GEMINI_API_KEY for cloud analysis.",
                "risk_level": "UNKNOWN",
                "recommendations": [],
                "findings": [],
            }

        prompt = f"""Act as an Expert Application Security Engineer.

Application under review: {app_name}

Vulnerability report from OSV-Scanner:
<FINDINGS>
{vuln_summary[:14000]}
</FINDINGS>

My primary goal is to identify only Critical and High vulnerabilities that are ACTUALLY EXPLOITABLE in a production environment.
Aggressively filter noise, false positives, and low-risk items using these triage rules:

RULE 1 – Severity Filter:
  ONLY triage and output findings for vulnerabilities with CRITICAL or HIGH severity.
  COMPLETELY IGNORE and EXCLUDE any Medium, Low, or Unknown severity vulnerabilities. Do not include them in the findings array.

RULE 2 – Filter Non-Production Risk:
  Identify vulnerabilities in dev/test/build-time dependencies (linters, test runners, bundlers, type checkers, etc.).
  Mark these action_required = "Ignore/Accept Risk" with why explaining they are dev-only.

RULE 3 – Highlight Known Exploited Vulnerabilities (KEV):
  Cross-reference CVE/OSV IDs with known active exploitation (CISA KEV catalog, Metasploit modules, public PoC exploits).
  Mark these action_required = "Must Fix" and note the known exploit in why.

RULE 4 – Analyse Exploit Conditions:
  For remaining vulnerabilities read the description and determine the specific conditions required for exploitation
  (e.g. "requires parsing attacker-controlled XML", "requires local filesystem access", "Windows-only").
  If conditions are likely met in a typical web application, mark action_required = "Must Fix".
  If conditions are unclear or require unusual code paths, mark action_required = "Verify Reachability".

Produce a JSON object with exactly these four keys:

"summary": A 3-5 sentence executive summary of the ACTUAL risk posture, focusing on what is exploitable. Be direct.

"risk_level": One of "CRITICAL", "HIGH", "MEDIUM", "LOW" — overall risk after triage.

"recommendations": A JSON array of 4-6 concrete, prioritised remediation actions for the development team. Plain strings only.

"findings": A JSON array — one object per unique CVE/OSV ID — with exactly these five string fields:
  - "package_version": e.g. "requests 2.25.1"
  - "vulnerability_id": the CVE or OSV ID
  - "action_required": exactly one of "Must Fix", "Verify Reachability", or "Ignore/Accept Risk"
  - "why": brief justification referencing the triage rule applied
  - "how_to_verify": the exact function calls, import patterns, or code paths to grep for in the codebase to confirm reachability. If action_required is "Ignore/Accept Risk" write "N/A".

Return ONLY valid JSON. No markdown fences, no text outside the JSON object.
"""

        try:
            raw = self._generate(model_name, prompt)
            raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            result = json.loads(raw)

            findings = []
            for f in result.get("findings", []):
                findings.append({
                    "package_version":  str(f.get("package_version", "")),
                    "vulnerability_id": str(f.get("vulnerability_id", "")),
                    "action_required":  str(f.get("action_required", "Verify Reachability")),
                    "why":              str(f.get("why", "")),
                    "how_to_verify":    str(f.get("how_to_verify", "")),
                })

            return {
                "summary":         str(result.get("summary", "")),
                "risk_level":      str(result.get("risk_level", "UNKNOWN")).upper(),
                "recommendations": [str(r) for r in result.get("recommendations", [])],
                "findings":        findings,
            }
        except Exception as e:
            logger.error(f"Error analyzing SCA vulnerabilities: {e}")
            return {
                "summary": f"Analysis failed: {e}",
                "risk_level": "UNKNOWN",
                "recommendations": [],
                "findings": [],
            }

    # -- Project Risk Assessment --------------------------------------------

    @staticmethod
    def _score_to_rating(score: int) -> str:
        """5×5 matrix score (1..25) → qualitative band. Mirrors the model helper."""
        if score >= 16:
            return "Critical"
        if score >= 10:
            return "High"
        if score >= 5:
            return "Medium"
        return "Low"

    @staticmethod
    def _clamp_1_5(value, default: int = 3) -> int:
        try:
            return max(1, min(5, int(round(float(value)))))
        except (ValueError, TypeError):
            return default

    def assess_project_risk(
        self, project_name: str, document_text: str, model_name: str = "ollama/llama3.1"
    ) -> dict:
        """
        Assess the whole project's risk from project documentation. Identifies
        discrete risks, scores each on a 5×5 Likelihood × Impact matrix (inherent
        and residual), and proposes controls and remediation actions.

        Returns: executive_summary, overall_inherent_rating, overall_residual_rating,
        and a list of risk dicts. Ratings are recomputed server-side from the
        numeric scores so they are always internally consistent.
        """
        if not self._is_ollama_model(model_name) and not self._get_gemini_api_key():
            return {
                "executive_summary": "AI provider not configured. Select a local Ollama model "
                                     "in Settings, or set GEMINI_API_KEY for cloud assessment.",
                "overall_inherent_rating": "UNKNOWN",
                "overall_residual_rating": "UNKNOWN",
                "risks": [],
            }

        prompt = f"""Act as an expert IT project risk manager and GRC analyst.

You are assessing the overall delivery and security risk of the following project.

Project: {project_name}

Project documentation (requirements, design, change description, etc.):
<DOCUMENT>
{document_text[:18000]}
</DOCUMENT>

Identify the most material risks this project introduces or is exposed to, across
categories such as Security, Operational, Compliance/Regulatory, Financial, Schedule,
Third-Party, and Data Privacy. For EACH risk, score it on a 5×5 matrix:
  - likelihood: integer 1 (rare) to 5 (almost certain)
  - impact: integer 1 (negligible) to 5 (severe)
These two give the INHERENT risk (before additional controls).
Then, assuming your recommended mitigation is implemented, estimate the RESIDUAL
likelihood and impact (1..5 each) — residual scores should normally be lower than inherent.

Produce a JSON object with exactly these keys:

"executive_summary": A 3-5 sentence executive summary of the project's overall risk posture. Be direct and specific to this project.

"overall_inherent_rating": one of "Low","Medium","High","Critical" — the project's overall inherent risk.

"overall_residual_rating": one of "Low","Medium","High","Critical" — overall risk after mitigation.

"risks": a JSON array of 4-10 objects, each with exactly these fields:
  - "title": short risk name
  - "category": one of Security, Operational, Compliance, Financial, Schedule, Third-Party, Data Privacy
  - "description": 1-2 sentences describing the risk and why it applies to THIS project
  - "likelihood": integer 1-5 (inherent)
  - "impact": integer 1-5 (inherent)
  - "existing_controls": controls already implied by the documentation, or "None identified"
  - "recommended_mitigation": concrete action(s) to reduce the risk
  - "residual_likelihood": integer 1-5 (after mitigation)
  - "residual_impact": integer 1-5 (after mitigation)
  - "owner": the most appropriate role to own the action (e.g. "Project Manager", "Security Lead")
  - "action_items": a JSON array of 1-3 short, concrete action strings

Return ONLY valid JSON. No markdown fences, no text outside the JSON object.
"""

        try:
            raw = self._strip_code_fences(self._generate(model_name, prompt))
            result = json.loads(raw)

            risks = []
            inherent_max = 0
            residual_max = 0
            for r in result.get("risks", []):
                lk = self._clamp_1_5(r.get("likelihood"))
                im = self._clamp_1_5(r.get("impact"))
                rlk = self._clamp_1_5(r.get("residual_likelihood"), default=lk)
                rim = self._clamp_1_5(r.get("residual_impact"), default=im)
                inherent_score = lk * im
                residual_score = rlk * rim
                inherent_max = max(inherent_max, inherent_score)
                residual_max = max(residual_max, residual_score)

                action_items = r.get("action_items", [])
                if not isinstance(action_items, list):
                    action_items = [str(action_items)]

                risks.append({
                    "title": str(r.get("title", "Untitled risk"))[:300],
                    "category": str(r.get("category", "")),
                    "description": str(r.get("description", "")),
                    "likelihood": lk,
                    "impact": im,
                    "inherent_rating": self._score_to_rating(inherent_score),
                    "existing_controls": str(r.get("existing_controls", "")),
                    "recommended_mitigation": str(r.get("recommended_mitigation", "")),
                    "residual_likelihood": rlk,
                    "residual_impact": rim,
                    "residual_rating": self._score_to_rating(residual_score),
                    "owner": str(r.get("owner", "")),
                    "action_items": [str(a) for a in action_items],
                    "is_completed": False,
                })

            return {
                "executive_summary": str(result.get("executive_summary", "")),
                # Recompute overall ratings from the worst residual/inherent risk so
                # the headline number is always consistent with the table.
                "overall_inherent_rating": self._score_to_rating(inherent_max) if risks
                    else str(result.get("overall_inherent_rating", "UNKNOWN")),
                "overall_residual_rating": self._score_to_rating(residual_max) if risks
                    else str(result.get("overall_residual_rating", "UNKNOWN")),
                "risks": risks,
            }
        except Exception as e:
            logger.error(f"Error assessing project risk: {e}")
            return {
                "executive_summary": f"Assessment failed: {e}",
                "overall_inherent_rating": "UNKNOWN",
                "overall_residual_rating": "UNKNOWN",
                "risks": [],
            }

    # -- Policy Gap Analyst -------------------------------------------------

    _GAP_SEVERITIES = ("High", "Medium", "Low")

    def assess_policy_gaps(
        self,
        policy_text: str,
        framework: str,
        policy_name: str,
        model_name: str = "ollama/llama3.1",
    ) -> dict:
        """
        Assess a policy document against a control framework and identify gaps,
        discrepancies, and remediation recommendations.

        Returns ``{"gaps": [ {requirement, gap_description, recommendation,
        severity}, ... ]}``. On a configuration or model error, returns an empty
        list plus an ``error`` string so the caller can surface it.
        """
        if not self._is_ollama_model(model_name) and not self._get_gemini_api_key():
            return {
                "gaps": [],
                "error": "AI provider not configured. Select a local Ollama model in "
                         "Settings, or set GEMINI_API_KEY for cloud assessment.",
            }

        framework_description = POLICY_FRAMEWORKS.get(
            framework,
            f"the {framework} framework's core control domains and requirements.",
        )

        prompt = f"""You are a senior GRC cybersecurity compliance assessor. Assess the
following policy document against {framework} and identify gaps, discrepancies, and
actionable recommendations.

{framework} reference:
{framework_description}

Policy Document: "{policy_name}"
<POLICY>
{policy_text[:25000]}
</POLICY>

Instructions:
1. Review the policy against each major {framework} domain/function above.
2. Produce one entry for EACH gap or discrepancy found. A gap exists when the policy:
   - Omits a required control or topic entirely
   - Addresses a requirement only partially or vaguely
   - Contains language inconsistent with the framework requirement
   - Lacks specificity (no defined timeframes, roles, ownership, or procedures)
3. Assign severity: "High" (critical control missing), "Medium" (partial coverage),
   "Low" (minor wording or enhancement).
4. Make recommendations specific and actionable, referencing the exact framework requirement.

Return a JSON array of gap objects. Each object must have exactly these string fields:
- "requirement": the specific {framework} control/domain the gap relates to (e.g. "NIST CSF PR.AA-01" or "ISO/IEC 27001 A.8.15 Logging")
- "gap_description": what is missing or inadequate in the policy
- "recommendation": a specific action to close the gap
- "severity": exactly one of "High", "Medium", "Low"

Return ONLY the JSON array. No markdown fences, no text outside the JSON.
"""

        try:
            raw = self._strip_code_fences(self._generate(model_name, prompt))
            parsed = json.loads(raw)
            # The model is asked for a bare array, but tolerate a {"gaps": [...]} wrapper.
            items = parsed if isinstance(parsed, list) else parsed.get("gaps", [])

            gaps = []
            for g in items:
                if not isinstance(g, dict) or not g.get("requirement"):
                    continue
                severity = str(g.get("severity", "Medium")).strip().title()
                if severity not in self._GAP_SEVERITIES:
                    severity = "Medium"
                gaps.append({
                    "requirement": str(g.get("requirement", "")),
                    "gap_description": str(g.get("gap_description", "")),
                    "recommendation": str(g.get("recommendation", "")),
                    "severity": severity,
                })
            return {"gaps": gaps}
        except Exception as e:
            # Log the detail server-side; return a generic message so internal
            # details (hostnames, stack info) are never surfaced to the client.
            logger.error(f"Error assessing policy gaps: {e}")
            return {"gaps": [], "error": "Assessment failed. Please try again or check the AI provider configuration."}

    # -- Audit Dispute Agent ------------------------------------------------

    def analyze_audit_dispute(
        self,
        audit_text: str,
        input_type: str,
        title: str,
        model_name: str = "ollama/llama3.1",
    ) -> dict:
        if not self._is_ollama_model(model_name) and not self._get_gemini_api_key():
            return {
                "summary": "AI provider not configured. Select a local Ollama model "
                           "in Settings, or set GEMINI_API_KEY for cloud analysis.",
                "risk_rating": "UNKNOWN",
                "guidance": [],
                "evidence_suggestions": [],
                "control_references": [],
            }

        if input_type == "audit_observation":
            mode_instructions = """You are reviewing an AUDIT OBSERVATION (finding/issue).
Your goal is to help the auditee DISPUTE or MITIGATE the observation by:
1. Explaining why the residual risk is lower than the auditor assessed, citing existing
   compensating/mitigating controls already in place.
2. Providing a structured argument referencing OCC Cybersecurity Supervision Work Program
   (CSW) domains and NIST CSF 2.0 controls that demonstrate adequate coverage.
3. Suggesting evidence artifacts the auditee can present to lower the severity or close the finding.
4. Identifying what the auditor may have missed or mischaracterised.

For each control reference, explain how it mitigates the specific risk cited in the observation."""
        else:
            mode_instructions = """You are reviewing an AUDIT REQUEST (information request, evidence request, or audit scope item).
Your goal is to help the auditee RESPOND effectively by:
1. Breaking down what the auditor is actually asking for and why.
2. Mapping the request to specific OCC Cybersecurity Supervision Work Program (CSW)
   domains and NIST CSF 2.0 controls.
3. Listing the exact procedures, documents, and evidence artifacts to gather.
4. Flagging areas that need special attention or could become findings if not addressed properly.
5. Providing guidance on how to frame the response to satisfy the audit requirement."""

        prompt = f"""Act as a senior IT audit response specialist and GRC expert with deep knowledge of
OCC Cybersecurity Supervision Work Program (CSW) and NIST Cybersecurity Framework (CSF) 2.0.

{mode_instructions}

AUDIT {'OBSERVATION' if input_type == 'audit_observation' else 'REQUEST'}:
Title: {title}
<CONTENT>
{audit_text[:20000]}
</CONTENT>

Reference frameworks:

OCC Cybersecurity Supervision Work Program domains:
- Governance & Risk Management
- Cyber Risk Identification & Assessment
- Cybersecurity Controls (access, network, endpoint, encryption, patching)
- External Dependency / Third-Party Management
- Incident Identification, Reporting & Response
- Awareness & Training
- Business Continuity & Resilience
- Independent Audit

NIST CSF 2.0 Functions and Categories:
- GOVERN (GV): GV.OC, GV.RM, GV.RR, GV.PO, GV.OV, GV.SC
- IDENTIFY (ID): ID.AM, ID.RA, ID.IM
- PROTECT (PR): PR.AA, PR.AT, PR.DS, PR.PS, PR.IR
- DETECT (DE): DE.CM, DE.AE
- RESPOND (RS): RS.MA, RS.AN, RS.CO, RS.MI
- RECOVER (RC): RC.RP, RC.CO

Produce a JSON object with exactly these keys:

"summary": A 3-5 sentence executive summary of the {'observation and why the risk may be lower than assessed' if input_type == 'audit_observation' else 'audit request, what it requires, and key considerations'}.

"risk_rating": One of "Critical", "High", "Medium", "Low" — {'the assessed residual risk after considering mitigating controls' if input_type == 'audit_observation' else 'how critical it is to respond thoroughly to this request'}.

"guidance": A JSON array of objects, each with:
  - "title": short heading for this guidance point
  - "description": detailed actionable guidance (2-4 sentences)
  - "priority": "High", "Medium", or "Low"

"evidence_suggestions": A JSON array of objects, each with:
  - "document": name of the evidence artifact or procedure document
  - "description": what it should contain and why it addresses the {'observation' if input_type == 'audit_observation' else 'request'}
  - "attention_points": specific items within this document to highlight or verify before submitting

"control_references": A JSON array of objects, each with:
  - "framework": either "OCC CSW" or "NIST CSF 2.0"
  - "control_id": the specific domain or control category (e.g. "GV.RR", "Cybersecurity Controls")
  - "control_name": full name of the control
  - "relevance": how this control relates to the {'observation — how it mitigates the cited risk' if input_type == 'audit_observation' else 'audit request — what aspect it covers'}

Return ONLY valid JSON. No markdown fences, no text outside the JSON object.
"""

        try:
            raw = self._strip_code_fences(self._generate(model_name, prompt))
            result = json.loads(raw)

            guidance = []
            for g in result.get("guidance", []):
                if not isinstance(g, dict):
                    continue
                priority = str(g.get("priority", "Medium")).strip().title()
                if priority not in ("High", "Medium", "Low"):
                    priority = "Medium"
                guidance.append({
                    "title": str(g.get("title", "")),
                    "description": str(g.get("description", "")),
                    "priority": priority,
                })

            evidence = []
            for e in result.get("evidence_suggestions", []):
                if not isinstance(e, dict):
                    continue
                evidence.append({
                    "document": str(e.get("document", "")),
                    "description": str(e.get("description", "")),
                    "attention_points": str(e.get("attention_points", "")),
                })

            controls = []
            for c in result.get("control_references", []):
                if not isinstance(c, dict):
                    continue
                controls.append({
                    "framework": str(c.get("framework", "")),
                    "control_id": str(c.get("control_id", "")),
                    "control_name": str(c.get("control_name", "")),
                    "relevance": str(c.get("relevance", "")),
                })

            risk = str(result.get("risk_rating", "Medium")).strip().title()
            if risk not in ("Critical", "High", "Medium", "Low"):
                risk = "Medium"

            return {
                "summary": str(result.get("summary", "")),
                "risk_rating": risk,
                "guidance": guidance,
                "evidence_suggestions": evidence,
                "control_references": controls,
            }
        except Exception as e:
            logger.error(f"Error analyzing audit dispute: {e}")
            return {
                "summary": f"Analysis failed: {e}",
                "risk_rating": "UNKNOWN",
                "guidance": [],
                "evidence_suggestions": [],
                "control_references": [],
            }


ai_service = AIService()
