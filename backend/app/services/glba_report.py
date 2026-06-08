"""Render a GLBA Information Security Program assessment to a polished,
print-ready HTML report.

The report combines the static control template (``app.glba_template``) with the
saved owner/assessor responses for one assessment, plus an executive summary:

  * results recorded / total
  * Effective vs Deficient (Deficient + Not Implemented) vs N/A counts
  * high-risk control outcomes
  * scoring-rule violations — a control rated **Effective** without **Inspection**
    recorded, or a **high-risk** control rated Effective without **Reperformance**.

The output is a single self-contained HTML document (inline CSS, no external
assets) that mirrors the styling of the original ``glba_assessment_form.html``:
indigo program header, a green "Control Owner" zone and a slate "Assessor" zone
per control.  It opens in a browser tab and prints cleanly to PDF.
"""

from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from typing import TYPE_CHECKING, Dict, List, Optional

from app.glba_template import GLBA_CONTROLS, GLBA_DOMAINS, GlbaControl

if TYPE_CHECKING:  # imported only for type hints — avoids a runtime DB-layer dependency
    from app.models.glba import GLBAAssessment, GLBAControlResponse


# ---------------------------------------------------------------------------
# Scoring rules (mirrors scoringWarning() in GLBAAssessmentPage.tsx)
# ---------------------------------------------------------------------------
def scoring_violations(control: GlbaControl, resp: Optional[GLBAControlResponse]) -> List[str]:
    """Return scoring-rule violations for a control rated Effective.

    A rating of Effective requires Inspection; high-risk controls also require
    Reperformance.  Returns an empty list when the control isn't rated Effective
    or when the methods satisfy the rule.
    """
    if resp is None or resp.result != "Effective":
        return []
    methods = resp.test_methods or []
    msgs: List[str] = []
    if "Inspection" not in methods:
        msgs.append("Rated Effective without Inspection recorded.")
    if control.high_risk and "Reperformance" not in methods:
        msgs.append("High-risk control rated Effective without Reperformance recorded.")
    return msgs


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
def _build_summary(responses_by_id: Dict[str, GLBAControlResponse]) -> dict:
    total = len(GLBA_CONTROLS)
    recorded = effective = deficient = na = 0
    high_risk_outcomes: List[dict] = []
    violations: List[dict] = []

    for control in GLBA_CONTROLS:
        resp = responses_by_id.get(control.id)
        result = (resp.result if resp else None) or None
        if result:
            recorded += 1
        if result == "Effective":
            effective += 1
        elif result in ("Deficient", "Not Implemented"):
            deficient += 1
        elif result == "N/A":
            na += 1

        if control.high_risk:
            high_risk_outcomes.append(
                {
                    "id": control.id,
                    "title": control.title,
                    "result": result or "Not recorded",
                    "methods": (resp.test_methods if resp else None) or [],
                }
            )

        for msg in scoring_violations(control, resp):
            violations.append({"id": control.id, "title": control.title, "message": msg})

    return {
        "total": total,
        "recorded": recorded,
        "not_recorded": total - recorded,
        "effective": effective,
        "deficient": deficient,
        "na": na,
        "high_risk_outcomes": high_risk_outcomes,
        "violations": violations,
    }


# ---------------------------------------------------------------------------
# Small HTML helpers
# ---------------------------------------------------------------------------
def _text(value: Optional[str]) -> str:
    """Escape user text and preserve line breaks; em-dash placeholder when empty."""
    if value is None or str(value).strip() == "":
        return '<span class="muted">—</span>'
    return escape(str(value)).replace("\n", "<br>")

def _inline(value: Optional[str], placeholder: str = "—") -> str:
    if value is None or str(value).strip() == "":
        return f'<span class="muted">{escape(placeholder)}</span>'
    return escape(str(value))


_RESULT_CLASS = {
    "Effective": "res-effective",
    "Deficient": "res-deficient",
    "Not Implemented": "res-deficient",
    "N/A": "res-na",
}


def _result_badge(result: Optional[str]) -> str:
    label = result or "Not recorded"
    cls = _RESULT_CLASS.get(result or "", "res-none")
    return f'<span class="result-badge {cls}">{escape(label)}</span>'


def _chips(values: List[str]) -> str:
    items = [escape(v) for v in values if v]
    return "".join(f'<span class="chip">{v}</span>' for v in items)


def _fmt_dt(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return d.strftime("%Y-%m-%d %H:%M UTC")
    except (ValueError, TypeError):
        return escape(iso)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def render_report_html(assessment: GLBAAssessment, generated_by: str) -> str:
    responses_by_id: Dict[str, GLBAControlResponse] = {
        r.control_id: r for r in assessment.responses
    }
    summary = _build_summary(responses_by_id)
    domain_titles = {d["id"]: d["title"] for d in GLBA_DOMAINS}
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    entity = _inline(assessment.entity, "Untitled assessment")
    period = _inline(assessment.period)
    lead = _inline(assessment.lead)
    status = _inline(assessment.status)

    # ---- Executive summary ----
    pct = round((summary["recorded"] / summary["total"]) * 100) if summary["total"] else 0
    stat_cards = "".join(
        f'<div class="stat"><div class="stat-num">{val}</div><div class="stat-label">{escape(label)}</div></div>'
        for label, val in [
            (f"Results recorded ({pct}%)", f'{summary["recorded"]} / {summary["total"]}'),
            ("Effective", summary["effective"]),
            ("Deficient / Not Implemented", summary["deficient"]),
            ("N/A", summary["na"]),
            ("Not recorded", summary["not_recorded"]),
        ]
    )

    # High-risk outcomes table
    hr_rows = "".join(
        f"<tr><td class='mono'>{escape(o['id'])}</td><td>{escape(o['title'])}</td>"
        f"<td>{_result_badge(o['result'] if o['result'] != 'Not recorded' else None)}</td>"
        f"<td>{_inline(', '.join(o['methods']))}</td></tr>"
        for o in summary["high_risk_outcomes"]
    )
    high_risk_table = f"""
      <h3>High-risk control outcomes</h3>
      <table class="grid">
        <thead><tr><th>ID</th><th>Control</th><th>Result</th><th>Test methods</th></tr></thead>
        <tbody>{hr_rows}</tbody>
      </table>"""

    # Scoring-rule violations
    if summary["violations"]:
        v_rows = "".join(
            f"<li><span class='mono'>{escape(v['id'])}</span> — {escape(v['title'])}: {escape(v['message'])}</li>"
            for v in summary["violations"]
        )
        violations_block = f"""
      <div class="violations">
        <h3>⚠ Scoring-rule violations ({len(summary['violations'])})</h3>
        <ul>{v_rows}</ul>
      </div>"""
    else:
        violations_block = """
      <div class="violations clean">
        <h3>✓ No scoring-rule violations</h3>
        <p>Every control rated Effective has the required test methods recorded.</p>
      </div>"""

    # ---- Per-domain control sections ----
    domain_sections: List[str] = []
    for domain in GLBA_DOMAINS:
        controls = [c for c in GLBA_CONTROLS if c.domain == domain["id"]]
        cards = "".join(
            _render_control_card(c, responses_by_id.get(c.id)) for c in controls
        )
        domain_sections.append(
            f"""
      <section class="domain">
        <h2 class="domain-head"><span class="domain-badge">{escape(domain['id'])}</span>{escape(domain['title'])}</h2>
        {cards}
      </section>"""
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GLBA Assessment Report — {escape(assessment.entity or 'Untitled')}</title>
<style>{_CSS}</style>
</head>
<body>
<div class="print-hint no-print">Press <kbd>⌘/Ctrl</kbd> + <kbd>P</kbd> to print or save this report as a PDF.</div>

<header class="program-header">
  <div class="ph-title">
    <div class="shield">🛡</div>
    <div>
      <h1>GLBA Information Security Program Assessment</h1>
      <p class="cite">12 CFR Part 30, Appendix B · Regulation P (12 CFR Part 1016) · GLBA §501(b)</p>
    </div>
  </div>
  <table class="meta">
    <tr><th>Institution / legal entity</th><td>{entity}</td><th>Assessment period</th><td>{period}</td></tr>
    <tr><th>Lead assessor</th><td>{lead}</td><th>Status</th><td>{status}</td></tr>
    <tr><th>Created</th><td>{_fmt_dt(assessment.created_at)}</td><th>Last updated</th><td>{_fmt_dt(assessment.updated_at)}</td></tr>
    <tr><th>Generated</th><td>{escape(generated_at)}</td><th>Generated by</th><td>{escape(generated_by)}</td></tr>
  </table>
</header>

<section class="summary">
  <h2>Executive summary</h2>
  <div class="stats">{stat_cards}</div>
  {high_risk_table}
  {violations_block}
</section>

{''.join(domain_sections)}

<footer class="report-footer no-print-break">
  Generated by Cognitive GRC · GLBA assessment #{assessment.id} · {escape(generated_at)}
</footer>
</body>
</html>"""


def _render_control_card(control: GlbaControl, resp: Optional[GLBAControlResponse]) -> str:
    violations = scoring_violations(control, resp)
    methods = (resp.test_methods if resp else None) or []
    high_risk = '<span class="hr-badge">HIGH RISK</span>' if control.high_risk else ""

    evidence_items = "".join(f"<li>{escape(e)}</li>" for e in control.evidence)
    methods_str = ", ".join(escape(m) for m in methods) if methods else '<span class="muted">none recorded</span>'

    warning = ""
    if violations:
        warning = (
            '<div class="warn">⚠ '
            + " ".join(escape(v) for v in violations)
            + "</div>"
        )

    return f"""
        <article class="control">
          <div class="control-head">
            <span class="mono ctrl-id">{escape(control.id)}</span>
            {high_risk}
            {_result_badge(resp.result if resp else None)}
          </div>
          <h3 class="control-title">{escape(control.title)}</h3>
          <div class="chips">{_chips([control.citation, control.csf, control.nist, control.frequency])}</div>
          <p class="ref"><strong>Objective.</strong> {escape(control.objective)}</p>
          <p class="ref"><strong>Test procedure.</strong> {escape(control.procedure)}</p>

          <div class="zones">
            <div class="zone owner-zone">
              <div class="zone-head owner">Control Owner — self-report</div>
              <div class="field"><span class="flabel">Implementation</span><div class="fval">{_text(resp.owner_desc if resp else None)}</div></div>
              <div class="field"><span class="flabel">Evidence available</span><div class="fval">{_text(resp.owner_evidence if resp else None)}</div></div>
              <div class="field"><span class="flabel">Required evidence</span><ul class="ev">{evidence_items}</ul></div>
              <div class="field"><span class="flabel">Owner sign-off</span><div class="fval">{_inline(resp.owner_sign if resp else None)}</div></div>
            </div>

            <div class="zone assessor-zone">
              <div class="zone-head assessor">Assessor — testing &amp; conclusion</div>
              <div class="field"><span class="flabel">Test method(s) performed</span><div class="fval">{methods_str}</div></div>
              <div class="field inline-pair">
                <div><span class="flabel">Result</span><div class="fval">{_result_badge(resp.result if resp else None)}</div></div>
                <div><span class="flabel">Maturity tier</span><div class="fval">{_inline(resp.maturity if resp else None, '—')}</div></div>
              </div>
              <div class="field"><span class="flabel">Scoring rule</span><div class="fval scoring">{escape(control.scoring)}</div></div>
              {warning}
              <div class="field"><span class="flabel">Assessor notes / exceptions</span><div class="fval">{_text(resp.assessor_notes if resp else None)}</div></div>
              <div class="field"><span class="flabel">Assessor sign-off</span><div class="fval">{_inline(resp.assessor_sign if resp else None)}</div></div>
            </div>
          </div>
        </article>"""


# ---------------------------------------------------------------------------
# Stylesheet (mirrors glba_assessment_form.html / the React form colours)
# ---------------------------------------------------------------------------
_CSS = """
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1d2433; margin: 0; padding: 32px; background: #f5f6fa; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 18px; }
  h3 { font-size: 14px; }
  p { margin: 4px 0; }
  .muted { color: #98a2b3; }
  .mono { font-family: 'SF Mono', ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.04em; }

  .print-hint {
    max-width: 1000px; margin: 0 auto 16px; background: #eef0ff; color: #3538CD;
    border: 1px solid #c7c9f7; border-radius: 8px; padding: 8px 14px;
    font-size: 13px; font-weight: 600; text-align: center;
  }
  .print-hint kbd {
    background: #fff; border: 1px solid #c7c9f7; border-radius: 4px;
    padding: 1px 6px; font-family: inherit; font-size: 12px;
  }

  .program-header {
    background: #3538CD; color: #fff; border-radius: 14px; padding: 24px 28px;
    max-width: 1000px; margin: 0 auto 24px;
  }
  .ph-title { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
  .shield { font-size: 30px; }
  .cite { color: #c7c9f7; font-size: 12px; margin-top: 4px; }
  table.meta { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.meta th, table.meta td { text-align: left; padding: 5px 10px; vertical-align: top; }
  table.meta th { color: #c7c9f7; font-weight: 600; width: 16%; }
  table.meta td { color: #fff; width: 34%; }

  section.summary {
    max-width: 1000px; margin: 0 auto 28px; background: #fff; border: 1px solid #e4e7ec;
    border-radius: 14px; padding: 24px 28px;
  }
  .stats { display: flex; flex-wrap: wrap; gap: 14px; margin: 14px 0 8px; }
  .stat {
    flex: 1; min-width: 140px; border: 1px solid #e4e7ec; border-radius: 10px;
    padding: 14px 16px; background: #fafbfc;
  }
  .stat-num { font-size: 24px; font-weight: 700; color: #3538CD; }
  .stat-label { font-size: 12px; color: #667085; margin-top: 2px; }

  table.grid { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0 4px; }
  table.grid th, table.grid td { border: 1px solid #e4e7ec; padding: 7px 10px; text-align: left; vertical-align: top; }
  table.grid th { background: #f2f4f7; color: #475467; font-weight: 600; }

  .violations { margin-top: 18px; border-radius: 10px; padding: 14px 18px; background: #fef3f2; border: 1px solid #fda29b; }
  .violations.clean { background: #ecfdf3; border-color: #a6f4c5; }
  .violations h3 { margin: 0 0 6px; }
  .violations ul { margin: 6px 0 0; padding-left: 20px; }
  .violations li { margin: 3px 0; font-size: 13px; }

  .result-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
  .res-effective { background: #ecfdf3; color: #027a48; }
  .res-deficient { background: #fef3f2; color: #b42318; }
  .res-na { background: #f2f4f7; color: #475467; }
  .res-none { background: #f2f4f7; color: #98a2b3; }

  section.domain { max-width: 1000px; margin: 0 auto 8px; }
  .domain-head { display: flex; align-items: center; gap: 10px; margin: 22px 0 12px; }
  .domain-badge {
    width: 28px; height: 28px; border-radius: 6px; background: #3538CD; color: #fff;
    display: inline-grid; place-items: center; font-weight: 700; font-size: 14px;
  }

  article.control {
    background: #fff; border: 1px solid #e4e7ec; border-radius: 12px; padding: 18px 20px;
    margin-bottom: 16px; page-break-inside: avoid;
  }
  .control-head { display: flex; align-items: center; gap: 10px; }
  .ctrl-id { color: #667085; font-size: 12px; }
  .hr-badge { background: #fef3f2; color: #b42318; font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }
  .control-title { margin: 4px 0 8px; font-size: 15px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip { border: 1px solid #d0d5dd; color: #475467; font-size: 11px; padding: 1px 8px; border-radius: 10px; }
  .ref { font-size: 13px; color: #344054; }

  .zones { display: flex; gap: 14px; margin-top: 12px; }
  .zone { flex: 1; border-radius: 10px; padding: 14px; }
  .owner-zone { background: rgba(74,90,48,0.06); border: 1px solid rgba(74,90,48,0.25); }
  .assessor-zone { background: rgba(58,78,96,0.06); border: 1px solid rgba(58,78,96,0.25); }
  .zone-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
  .zone-head.owner { color: #4a5a30; }
  .zone-head.assessor { color: #3a4e60; }

  .field { margin-bottom: 10px; }
  .flabel { display: block; font-size: 11px; font-weight: 600; color: #667085; margin-bottom: 2px; }
  .fval { font-size: 13px; color: #1d2433; }
  .fval.scoring { font-size: 12px; color: #667085; }
  .inline-pair { display: flex; gap: 18px; }
  ul.ev { margin: 2px 0; padding-left: 18px; }
  ul.ev li { font-size: 12px; color: #667085; }

  .warn {
    background: #fffaeb; border: 1px solid #fec84b; color: #b54708;
    border-radius: 8px; padding: 7px 10px; font-size: 12px; margin-bottom: 10px;
  }

  .report-footer { max-width: 1000px; margin: 24px auto 0; text-align: center; color: #98a2b3; font-size: 12px; }

  @media print {
    body { background: #fff; padding: 0; }
    .no-print { display: none !important; }
    .program-header, section.summary, section.domain, .report-footer { max-width: none; }
    .program-header { border-radius: 0; }
  }
"""
