"""Seed realistic bank-IT demo data for the Audit, Issue, and KRI modules.

Idempotent: rows are keyed by their business code (audit_code / issue_number /
kri_code), so re-running only inserts what's missing — existing rows are left
untouched.

Run from inside the backend container:

    docker compose exec backend python seed_demo_data.py
"""
from app.database import SessionLocal
from app.models.audit import Audit
from app.models.issue import Issue
from app.models.kri import KRI


AUDITS = [
    dict(audit_code="AUD-2026-001", audit_type="Internal",
         title="Core Banking Platform — Access Controls Review",
         start_date="2026-04-06", end_date="2026-06-12", status="Fieldwork",
         requests_total=42, requests_open=11, walkthroughs=6, total_findings=5, open_findings=3, past_due=1,
         key_risks="Privileged access to core banking; segregation of duties in payments.",
         auditor_concerns="Several DBA accounts share credentials; access reviews not consistently evidenced."),
    dict(audit_code="AUD-2026-002", audit_type="Regulatory",
         title="FFIEC Cybersecurity Maturity Assessment",
         start_date="2026-06-01", end_date="2026-08-15", status="Planning",
         requests_total=60, requests_open=60, walkthroughs=0, total_findings=0, open_findings=0, past_due=0,
         key_risks="Inherent risk profile vs. cybersecurity maturity domains.",
         auditor_concerns="Awaiting current asset inventory and threat intelligence procedures."),
    dict(audit_code="AUD-2026-003", audit_type="Internal",
         title="Cloud Infrastructure (AWS) Configuration & Hardening",
         start_date="2026-03-02", end_date="2026-05-20", status="Reporting",
         requests_total=38, requests_open=4, walkthroughs=5, total_findings=7, open_findings=4, past_due=2,
         key_risks="Public S3 exposure, over-permissive IAM roles, missing guardrails.",
         auditor_concerns="CIS benchmark drift in non-prod; CloudTrail gaps in two accounts."),
    dict(audit_code="AUD-2026-004", audit_type="External",
         title="SOC 2 Type II Readiness — Payments Platform",
         start_date="2026-05-04", end_date="2026-07-31", status="Fieldwork",
         requests_total=55, requests_open=18, walkthroughs=8, total_findings=3, open_findings=3, past_due=0,
         key_risks="Control operating effectiveness over the audit period.",
         auditor_concerns="Change management evidence incomplete for emergency releases."),
    dict(audit_code="AUD-2025-019", audit_type="Internal",
         title="Identity & Access Management — Privileged Access",
         start_date="2025-10-01", end_date="2025-12-15", status="Remediation",
         requests_total=30, requests_open=2, walkthroughs=4, total_findings=6, open_findings=2, past_due=1,
         key_risks="Standing privileged access; lack of just-in-time elevation.",
         auditor_concerns="PAM tool deployed but not covering all platforms (mainframe pending)."),
    dict(audit_code="AUD-2025-021", audit_type="Regulatory",
         title="GLBA Safeguards Rule Examination",
         start_date="2025-09-08", end_date="2025-11-21", status="Completed",
         requests_total=48, requests_open=0, walkthroughs=7, total_findings=4, open_findings=0, past_due=0,
         key_risks="Customer information safeguards; service provider oversight.",
         auditor_concerns="Closed — all findings remediated and validated."),
    dict(audit_code="AUD-2026-005", audit_type="Internal",
         title="Third-Party / Vendor Risk Management",
         start_date="2026-07-06", end_date="2026-09-18", status="Scheduled",
         requests_total=0, requests_open=0, walkthroughs=0, total_findings=0, open_findings=0, past_due=0,
         key_risks="Concentration risk in critical service providers; fourth-party risk.",
         auditor_concerns="Scoping in progress."),
    dict(audit_code="AUD-2026-006", audit_type="Internal",
         title="Disaster Recovery & Business Continuity Test",
         start_date="2026-08-03", end_date="2026-09-30", status="Planning",
         requests_total=12, requests_open=12, walkthroughs=0, total_findings=0, open_findings=0, past_due=0,
         key_risks="Recovery time/point objectives for tier-1 banking systems.",
         auditor_concerns="Prior-year DR test did not meet RTO for online banking."),
]

ISSUES = [
    dict(issue_number="ISS-2026-014", issue_type="Audit", name="Excessive privileged access to core banking database",
         status="Open", risk_rating="High", owner="Database Engineering",
         identified_date="2026-04-22", target_date="2026-07-15",
         description="12 DBA accounts hold standing SYSDBA privileges with no just-in-time elevation or session recording.",
         remediation_plan="Onboard remaining DB platforms to PAM; enforce JIT elevation and session capture; remove standing access."),
    dict(issue_number="ISS-2026-009", issue_type="Regulatory", name="MFA not enforced for all remote access (VPN)",
         status="Open", risk_rating="Medium-High", owner="Network Security",
         identified_date="2026-03-30", target_date="2026-06-30",
         description="A legacy VPN group permits password-only authentication for ~40 contractors.",
         remediation_plan="Migrate contractors to SSO/MFA group; decommission legacy VPN profile."),
    dict(issue_number="ISS-2026-022", issue_type="Audit", name="Unpatched critical vulnerabilities on internet-facing servers",
         status="Validation", risk_rating="High", owner="Infrastructure Operations",
         identified_date="2026-05-02", target_date="2026-06-10",
         description="7 critical CVEs older than 30 days on DMZ web servers identified in vulnerability scan.",
         remediation_plan="Emergency patch cycle complete; awaiting rescan and validation evidence."),
    dict(issue_number="ISS-2025-118", issue_type="Business", name="Stale user accounts not deprovisioned within SLA",
         status="Open", risk_rating="Moderate", owner="IT Service Desk",
         identified_date="2025-12-11", target_date="2026-06-30",
         description="28 accounts of terminated employees remained active beyond the 24-hour deprovisioning SLA.",
         remediation_plan="Automate HR-to-IAM joiner/mover/leaver feed; weekly orphan-account reconciliation."),
    dict(issue_number="ISS-2026-003", issue_type="Audit", name="Encryption at rest not enabled on legacy customer database",
         status="Open", risk_rating="Medium-High", owner="Database Engineering",
         identified_date="2026-02-18", target_date="2026-09-30",
         description="A legacy customer-info datastore is not encrypted at rest (TDE), inconsistent with the crypto standard.",
         remediation_plan="Enable TDE during the Q3 maintenance window; validate key management via HSM."),
    dict(issue_number="ISS-2025-097", issue_type="External", name="Critical vendor lacks current SOC 2 report",
         status="Accepted", risk_rating="Moderate", owner="Vendor Management",
         identified_date="2025-11-05", target_date="2026-08-01",
         description="Payment processor's SOC 2 Type II lapsed; bridge letter obtained pending new report.",
         remediation_plan="Risk accepted with compensating monitoring; new report due Q3. Tracked to closure."),
    dict(issue_number="ISS-2026-018", issue_type="Audit", name="Backup restoration not tested in past 12 months",
         status="Open", risk_rating="Moderate", owner="Infrastructure Operations",
         identified_date="2026-04-29", target_date="2026-08-31",
         description="No evidence of a successful restore test for tier-1 systems within the last year.",
         remediation_plan="Schedule quarterly restore tests; document RPO/RTO results and retain evidence."),
    dict(issue_number="ISS-2026-025", issue_type="Regulatory", name="Logging & monitoring gaps in SIEM coverage",
         status="Open", risk_rating="Medium-High", owner="Security Operations",
         identified_date="2026-05-14", target_date="2026-07-31",
         description="Several critical systems (mainframe, two SaaS apps) are not forwarding logs to the SIEM.",
         remediation_plan="Onboard missing log sources; define use cases and alerting; validate coverage."),
    dict(issue_number="ISS-2025-130", issue_type="Business", name="Change management approvals bypassed for emergency changes",
         status="Closed", risk_rating="Moderate", owner="Change Management",
         identified_date="2025-12-20", target_date="2026-03-31",
         description="Emergency changes were implemented before CAB approval was recorded.",
         remediation_plan="Closed — retroactive approval workflow enforced in ITSM; CAB review of all emergency changes."),
    dict(issue_number="ISS-2026-030", issue_type="Audit", name="Segregation of duties conflict in wire transfer system",
         status="Open", risk_rating="High", owner="Payments Operations",
         identified_date="2026-05-26", target_date="2026-07-20",
         description="Two operators can both initiate and approve high-value wires, defeating dual control.",
         remediation_plan="Reconfigure roles to enforce maker/checker; add transaction-limit approval tiers."),
]

KRIS = [
    # Cybersecurity
    dict(kri_code="KRI-001", name="Critical vulnerabilities open > 30 days", category="Cybersecurity",
         owner="Security Operations", frequency="Weekly", current_value="7", threshold="0",
         status="Red", trend="Worsening", measurement_date="2026-06-05",
         description="Count of critical CVEs unremediated beyond the 30-day SLA."),
    dict(kri_code="KRI-002", name="Phishing simulation failure rate", category="Cybersecurity",
         owner="Security Awareness", frequency="Monthly", current_value="9.2%", threshold="≤ 5%",
         status="Amber", trend="Improving", measurement_date="2026-05-31",
         description="Percentage of staff who clicked in the monthly phishing simulation."),
    dict(kri_code="KRI-003", name="Mean time to patch — critical (days)", category="Cybersecurity",
         owner="Infrastructure Operations", frequency="Monthly", current_value="12", threshold="≤ 15",
         status="Green", trend="Stable", measurement_date="2026-05-31",
         description="Average days to remediate critical vulnerabilities."),
    dict(kri_code="KRI-004", name="Security incidents (Sev1/Sev2) per month", category="Cybersecurity",
         owner="Security Operations", frequency="Monthly", current_value="2", threshold="≤ 1",
         status="Amber", trend="Stable", measurement_date="2026-05-31",
         description="Number of high-severity security incidents declared in the month."),
    # Access Management
    dict(kri_code="KRI-010", name="Privileged accounts without MFA", category="Access Management",
         owner="Identity & Access Management", frequency="Weekly", current_value="3", threshold="0",
         status="Red", trend="Worsening", measurement_date="2026-06-05",
         description="Privileged accounts not enrolled in multi-factor authentication."),
    dict(kri_code="KRI-011", name="Dormant accounts > 90 days", category="Access Management",
         owner="Identity & Access Management", frequency="Monthly", current_value="28", threshold="≤ 10",
         status="Amber", trend="Improving", measurement_date="2026-05-31",
         description="Active accounts with no login in the last 90 days."),
    dict(kri_code="KRI-012", name="Access recertification completion", category="Access Management",
         owner="Identity & Access Management", frequency="Quarterly", current_value="96%", threshold="≥ 95%",
         status="Green", trend="Improving", measurement_date="2026-03-31",
         description="Percentage of access reviews completed on time in the quarter."),
    # Availability & Resilience
    dict(kri_code="KRI-020", name="Core banking platform uptime", category="Availability & Resilience",
         owner="Infrastructure Operations", frequency="Monthly", current_value="99.95%", threshold="≥ 99.9%",
         status="Green", trend="Stable", measurement_date="2026-05-31",
         description="Monthly availability of the core banking platform."),
    dict(kri_code="KRI-021", name="Unplanned online-banking outages / month", category="Availability & Resilience",
         owner="Digital Channels", frequency="Monthly", current_value="1", threshold="≤ 1",
         status="Green", trend="Stable", measurement_date="2026-05-31",
         description="Count of unplanned customer-facing outages in the month."),
    dict(kri_code="KRI-022", name="DR test RTO achievement (tier-1)", category="Availability & Resilience",
         owner="Business Continuity", frequency="Quarterly", current_value="RTO 6h vs 4h target", threshold="Meet RTO",
         status="Amber", trend="Stable", measurement_date="2026-03-31",
         description="Whether the latest DR exercise met the recovery time objective for tier-1 systems."),
    # Third-Party Risk
    dict(kri_code="KRI-030", name="Critical vendors with expired SOC 2", category="Third-Party Risk",
         owner="Vendor Management", frequency="Quarterly", current_value="2", threshold="0",
         status="Amber", trend="Stable", measurement_date="2026-03-31",
         description="Critical service providers without a current SOC 2 / assurance report."),
    dict(kri_code="KRI-031", name="Vendor risk assessments overdue", category="Third-Party Risk",
         owner="Vendor Management", frequency="Monthly", current_value="5", threshold="≤ 2",
         status="Amber", trend="Worsening", measurement_date="2026-05-31",
         description="Vendor due-diligence reassessments past their due date."),
    # Change Management
    dict(kri_code="KRI-040", name="Change failure rate", category="Change Management",
         owner="Change Management", frequency="Monthly", current_value="4.1%", threshold="≤ 5%",
         status="Green", trend="Stable", measurement_date="2026-05-31",
         description="Percentage of changes resulting in incidents or rollback."),
    dict(kri_code="KRI-041", name="Emergency changes (% of total)", category="Change Management",
         owner="Change Management", frequency="Monthly", current_value="11%", threshold="≤ 8%",
         status="Amber", trend="Worsening", measurement_date="2026-05-31",
         description="Share of changes implemented through the emergency change process."),
    # Data Protection
    dict(kri_code="KRI-050", name="Customer data encryption coverage", category="Data Protection",
         owner="Data Security", frequency="Quarterly", current_value="98%", threshold="100%",
         status="Amber", trend="Improving", measurement_date="2026-03-31",
         description="Percentage of customer-information datastores encrypted at rest."),
    dict(kri_code="KRI-051", name="DLP alerts unresolved > 7 days", category="Data Protection",
         owner="Data Security", frequency="Weekly", current_value="6", threshold="≤ 3",
         status="Amber", trend="Stable", measurement_date="2026-06-05",
         description="Data-loss-prevention alerts open beyond the 7-day triage target."),
]


def _seed(db, model, rows, key_field):
    existing = {getattr(r, key_field) for r in db.query(model).all()}
    added = 0
    for row in rows:
        if row[key_field] in existing:
            continue
        db.add(model(**row))
        added += 1
    return added


def main():
    db = SessionLocal()
    try:
        a = _seed(db, Audit, AUDITS, "audit_code")
        i = _seed(db, Issue, ISSUES, "issue_number")
        k = _seed(db, KRI, KRIS, "kri_code")
        db.commit()
        print(f"Seed complete — added {a} audits, {i} issues, {k} KRIs.")
        print(f"Totals now: {db.query(Audit).count()} audits, "
              f"{db.query(Issue).count()} issues, {db.query(KRI).count()} KRIs.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
