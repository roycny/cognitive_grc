# Audit Dispute Agent — Sample Test Cases

Use these to test both "Audit Request" and "Audit Observation" modes.
Copy-paste the **Content** into the agent's text area, set the **Type** and **Title** as indicated.

---

## TEST CASE 1 — Audit Request: Privileged Access Management

**Type:** Audit Request / Information Request
**Title:** Privileged Access Review — Q2 2026

**Content:**

```
Subject: Information Request — Privileged Access Management (PAM)

Request ID: IR-2026-0047
Audit: OCC Cybersecurity Targeted Review — 2026
Examiner: OCC Supervisory Office

Please provide the following information and supporting documentation related to the bank's
privileged access management practices:

1. A current inventory of all privileged accounts (administrative, service, emergency/break-glass)
   across all in-scope systems, including Active Directory, cloud platforms (AWS, Azure),
   database servers, and network infrastructure devices.

2. Evidence of periodic recertification of privileged access rights, including:
   - Frequency of recertification cycles
   - Most recent recertification completion date
   - Percentage of accounts reviewed vs. total privileged accounts
   - Documentation of any access removed or modified as a result

3. Privileged session monitoring and recording capabilities:
   - Tools used for session monitoring (e.g., CyberArk PSM, BeyondTrust)
   - Percentage of privileged sessions recorded
   - Retention period for session recordings
   - Evidence of review of high-risk session recordings

4. Password/credential management for privileged accounts:
   - Password rotation policy and frequency
   - Use of password vaulting solutions
   - Evidence that default and shared credentials have been eliminated

5. Multi-factor authentication enforcement for all privileged access, including:
   - Remote access
   - Cloud console access
   - Access to critical on-premise systems

6. Segregation of duties controls preventing users from having conflicting privileged roles.

7. Procedures for emergency/break-glass access, including post-use review and re-securing.

Response due date: July 15, 2026
```

---

## TEST CASE 2 — Audit Observation: Patch Management Deficiency

**Type:** Audit Observation / Finding
**Title:** Delayed Critical Patch Deployment

**Content:**

```
AUDIT OBSERVATION

Observation ID: OBS-2026-012
Severity: High
Audit: Annual IT General Controls Examination
Date Identified: June 10, 2026

CONDITION:
During our review of the bank's patch management program, we identified that 23% of
critical and high-severity patches (CVSS >= 7.0) were not applied within the bank's
stated 30-day SLA during the period January 2026 through May 2026. Specifically:

- 47 out of 204 critical/high patches exceeded the 30-day remediation window
- Average time to remediate exceeded the SLA by 18 days (average 48 days)
- 12 systems running Windows Server 2019 had patches outstanding for over 90 days
- Three internet-facing web application servers had unpatched Apache Struts
  vulnerabilities (CVE-2025-XXXX) for 67 days

CRITERIA:
- Bank's Information Security Policy v4.2, Section 7.3: "Critical and high-severity
  patches shall be applied within 30 calendar days of vendor release."
- OCC Heightened Standards (12 CFR Part 30, Appendix D): Banks must maintain effective
  processes to identify, measure, monitor, and control cyber risk.
- FFIEC IT Examination Handbook — Information Security: Institutions should establish
  effective patch management processes.

ROOT CAUSE:
Management cited insufficient Change Advisory Board (CAB) capacity and extended testing
cycles as primary causes for delays.

RISK:
Unpatched systems increase the bank's attack surface and could allow threat actors to
exploit known vulnerabilities, potentially leading to unauthorized access, data
exfiltration, or service disruption. The presence of unpatched internet-facing servers
materially elevates this risk.

RECOMMENDATION:
Management should enhance the patch management program to ensure timely deployment of
critical and high-severity patches within the established SLA. Consider implementing
automated patch deployment for standard OS patches and establishing an expedited CAB
review process for critical security patches.
```

---

## TEST CASE 3 — Audit Request: Third-Party Risk Management

**Type:** Audit Request / Information Request
**Title:** Third-Party / Vendor Risk Management Program Review

**Content:**

```
Subject: Examination Request — Third-Party Risk Management

Request ID: IR-2026-0063
Scope: Enterprise Third-Party Risk Management Program

As part of the ongoing supervisory review, please provide the following documentation
and evidence related to the bank's third-party risk management program:

1. Current third-party risk management policy and procedures, including:
   - Risk tiering methodology (how vendors are classified as critical, high, medium, low)
   - Due diligence requirements by risk tier
   - Ongoing monitoring frequency by risk tier

2. Complete inventory of critical and high-risk third-party relationships, including:
   - Vendor name, service provided, risk tier
   - Contract expiration dates
   - Whether the vendor has access to customer data or bank systems
   - Subcontractor/fourth-party dependencies

3. For the top 10 critical vendors by risk score, provide:
   - Most recent due diligence assessment (SOC 2 Type II, ISO 27001, or equivalent)
   - Business continuity / disaster recovery test results
   - Cyber risk assessment or security questionnaire results
   - Evidence of contract provisions for audit rights, data protection, incident
     notification, and termination

4. Concentration risk analysis:
   - Vendors providing services to multiple business lines
   - Single points of failure
   - Geographic concentration risks

5. Incident history:
   - Any vendor-related security incidents or data breaches in the past 24 months
   - Notification timelines and remediation actions taken

6. Board/committee reporting:
   - Sample board reports on third-party risk (last two quarters)
   - Evidence of senior management oversight and escalation procedures

Response due date: August 1, 2026
```

---

## TEST CASE 4 — Audit Observation: Insufficient Logging & Monitoring

**Type:** Audit Observation / Finding
**Title:** Gaps in Security Event Logging and Monitoring

**Content:**

```
AUDIT OBSERVATION

Observation ID: OBS-2026-019
Severity: High
Audit: Cybersecurity Assessment — Targeted Review
Date Identified: June 18, 2026

CONDITION:
The examination identified deficiencies in the bank's security event logging and
monitoring program:

a) Log Coverage Gaps:
   - 14 of 38 (37%) production database servers do not forward logs to the centralized
     SIEM platform (IBM QRadar)
   - Cloud workloads in AWS us-east-1 (approximately 45 EC2 instances) are not
     integrated with the SIEM; CloudTrail logs are retained in S3 but not actively
     monitored
   - VPN authentication logs are retained locally on the Cisco ASA appliances with
     only 30-day retention, below the bank's 12-month policy

b) Alert Tuning and Response:
   - The SOC team reported a 78% false positive rate on privilege escalation alerts,
     leading analysts to routinely dismiss these alerts without full investigation
   - No documented alert tuning process or regular review cadence exists
   - Mean time to acknowledge (MTTA) for high-severity alerts averaged 4.2 hours
     versus the 30-minute SLA

c) Log Integrity:
   - No log integrity verification (hashing/signing) is implemented
   - Centralized log storage lacks write-once / immutable storage controls

CRITERIA:
- NIST SP 800-53 AU-2, AU-3, AU-6, AU-9, AU-12: Audit event logging, review,
  analysis, protection, and generation requirements
- OCC Cybersecurity Supervision Work Program: Incident identification requires
  comprehensive logging and monitoring across all critical assets
- Bank's Logging & Monitoring Standard v2.1, Section 4: "All production systems
  processing, storing, or transmitting customer data shall forward security-relevant
  events to the enterprise SIEM within 24 hours of deployment."

RISK:
Incomplete logging and delayed alert response materially impair the bank's ability to
detect cyber intrusions, insider threats, and unauthorized access in a timely manner.
The inability to detect threats increases dwell time and potential impact of a security
incident.

RECOMMENDATION:
Expand SIEM log source coverage to 100% of production systems, implement a formal
alert tuning program, and deploy log integrity controls.
```

---

## TEST CASE 5 — Audit Observation: Data Loss Prevention Gaps

**Type:** Audit Observation / Finding
**Title:** DLP Program Maturity Deficiency

**Content:**

```
AUDIT OBSERVATION

Observation ID: OBS-2026-024
Severity: Medium
Audit: Information Security Program Assessment
Date Identified: June 22, 2026

CONDITION:
The bank's Data Loss Prevention (DLP) program does not provide adequate coverage
for all exfiltration vectors:

1. Email DLP policies are configured only for exact-match patterns (SSN, account
   numbers) but do not address unstructured sensitive data, document classification
   labels, or bulk data transfers exceeding normal baselines.

2. Endpoint DLP controls are not deployed on developer workstations (approximately
   85 endpoints) or the remote contractor fleet (approximately 40 endpoints),
   representing 22% of the total managed endpoint population.

3. Cloud DLP:
   - No DLP inspection is applied to data uploaded to sanctioned cloud storage
     (OneDrive for Business, SharePoint Online)
   - The bank has no CASB or equivalent cloud access security broker deployed
   - Shadow IT discovery scans have not been conducted in over 18 months

4. USB/removable media controls rely solely on Group Policy restrictions, which
   do not apply to macOS devices used by the design and marketing teams (12 devices).

CRITERIA:
- GLBA Safeguards Rule (16 CFR Part 314): Requires safeguards to protect customer
  information, including controls over data exfiltration
- Bank's Data Classification & Handling Policy v3.0
- NIST CSF PR.DS-01, PR.DS-02: Data-at-rest and data-in-transit protection

RISK:
Gaps in DLP coverage increase the risk of unauthorized data exfiltration through
unmonitored channels. While no data loss events have been confirmed, the lack of
visibility means potential incidents may go undetected.

RECOMMENDATION:
Implement a comprehensive DLP strategy that covers all exfiltration vectors including
email, endpoint, cloud, and removable media across all device platforms.
```

---

## TEST CASE 6 — Audit Request: Incident Response Program

**Type:** Audit Request / Information Request
**Title:** Incident Response Capability Assessment

**Content:**

```
Subject: Documentation Request — Incident Response Program

Request ID: IR-2026-0071
Audit: OCC Cybersecurity Supervision Review

Please provide the following documentation to support our review of the bank's
cyber incident response capabilities:

1. Current Incident Response Plan (IRP), including:
   - Incident classification and severity matrix
   - Escalation procedures and timelines
   - Communication protocols (internal, regulatory, law enforcement, customers)
   - Roles and responsibilities (RACI matrix)

2. Incident response team structure and staffing:
   - Organization chart for the CSIRT / incident response team
   - On-call rotation schedules
   - Use of any external incident response retainers (e.g., CrowdStrike, Mandiant)
   - Evidence of annual training or certification for IR team members

3. Tabletop exercises and simulations conducted in the past 12 months:
   - Exercise scenarios, participants, and dates
   - After-action reports with identified gaps
   - Evidence that remediation actions from exercises were tracked to completion

4. Actual incident history for the past 24 months:
   - Total number of incidents by severity
   - Mean time to detect (MTTD), contain (MTTC), and recover (MTTR)
   - Any incidents requiring regulatory notification (SAR, OCC, state regulators)
   - Lessons learned documentation

5. Forensic readiness:
   - Digital forensics tools and capabilities (in-house vs. retained)
   - Evidence preservation and chain-of-custody procedures
   - Integration with legal hold processes

6. Regulatory reporting procedures:
   - Process for determining if an incident meets OCC/FDIC notification thresholds
     (36-hour notification requirement under the Computer-Security Incident
     Notification Rule)
   - Template or checklist used for regulatory notifications

Response due date: July 30, 2026
```

---

## TEST CASE 7 — Audit Observation: BCP/DR Testing Deficiency

**Type:** Audit Observation / Finding
**Title:** Incomplete Business Continuity / Disaster Recovery Testing

**Content:**

```
AUDIT OBSERVATION

Observation ID: OBS-2026-031
Severity: Medium
Audit: Business Continuity Examination
Date Identified: June 25, 2026

CONDITION:
The bank's most recent disaster recovery (DR) test, conducted in March 2026,
revealed the following deficiencies:

1. Recovery Time Objective (RTO) was not met for 3 of 8 critical applications:
   - Core Banking Platform: RTO target 4 hours, actual recovery 7.5 hours
   - Online Banking Portal: RTO target 2 hours, actual recovery 4 hours
   - Wire Transfer System: RTO target 1 hour, actual recovery 2.5 hours

2. The DR test did not include:
   - Failover of the enterprise Active Directory environment
   - Recovery of the cybersecurity toolset (SIEM, EDR, vulnerability scanner)
   - End-to-end testing of the customer notification process

3. Recovery Point Objective (RPO) validation:
   - Database replication lag for the core banking platform was measured at
     47 minutes during the test, exceeding the 15-minute RPO
   - No validation was performed for cloud-hosted data stores

4. The DR site (secondary data center) has not been tested for simultaneous
   failover of all critical applications; tests were conducted sequentially,
   which does not reflect a real disaster scenario.

5. BCP/DR test results were reported to the Technology Committee but not
   escalated to the Board Risk Committee as required by policy.

CRITERIA:
- OCC Heightened Standards: Banks must maintain effective processes for
  business continuity and resilience
- FFIEC Business Continuity Handbook: Institutions should conduct enterprise-wide
  BCP testing that validates recovery capabilities
- Bank's Business Continuity Policy v5.0: Annual DR tests must validate RTO/RPO
  for all Tier 1 applications and results must be reported to the Board

RISK:
Failure to meet established RTO/RPO targets during controlled testing indicates
the bank may be unable to recover critical services within acceptable timeframes
during an actual disruption, potentially impacting customers and regulatory
obligations.

RECOMMENDATION:
Enhance the DR testing program to include simultaneous failover, validate all
critical application RTOs and RPOs, include cybersecurity infrastructure in scope,
and ensure results are reported to the Board Risk Committee.
```

---

## TEST CASE 8 — Audit Request: Identity & Access Management Controls

**Type:** Audit Request / Information Request
**Title:** Identity & Access Management Deep Dive

**Content:**

```
Subject: Examination Request — Identity & Access Management

Request ID: IR-2026-0085

The examination team requires the following information regarding the bank's
identity and access management (IAM) controls:

1. Authentication standards:
   - Current password policy settings (complexity, length, expiration, history)
   - MFA enrollment rates by user population (employees, contractors, vendors)
   - MFA methods supported and any exceptions granted
   - Adaptive/risk-based authentication capabilities

2. User lifecycle management:
   - Provisioning process for new hires (average time from request to access granted)
   - De-provisioning process for terminations (average time from HR notification to
     access revocation)
   - Evidence of timely de-provisioning for the last 10 involuntary terminations
   - Process for managing access changes during internal transfers

3. Access reviews:
   - Schedule and scope of periodic access reviews (user access recertification)
   - Completion rates for the most recent cycle
   - Sample of access review evidence showing manager sign-off
   - Process for handling exceptions and overdue reviews

4. Service account management:
   - Inventory of service accounts with last-used date
   - Ownership assignment for each service account
   - Password rotation evidence
   - Any service accounts with interactive logon capability

5. Role-Based Access Control (RBAC):
   - Current role model documentation
   - Number of roles vs. number of users (role explosion analysis)
   - Process for creating, modifying, and retiring roles
   - Evidence of periodic role mining or optimization

Response due date: July 22, 2026
```

---

## Expected Behavior by Test Case

| # | Type | Expected Risk | Key Frameworks | Notes |
|---|------|--------------|----------------|-------|
| 1 | Request | High | OCC CSW (Cybersecurity Controls), NIST CSF PR.AA | PAM is a critical control area; expect detailed evidence list |
| 2 | Observation | Medium* | OCC CSW (Cybersecurity Controls), NIST CSF PR.PS | *Agent should argue compensating controls lower the risk |
| 3 | Request | High | OCC CSW (External Dependency), NIST CSF GV.SC | Heavy third-party focus; expect concentration risk guidance |
| 4 | Observation | Medium* | OCC CSW (Incident Identification), NIST CSF DE.CM, DE.AE | *Agent should cite compensating monitoring controls |
| 5 | Observation | Low-Medium* | NIST CSF PR.DS, OCC CSW (Cybersecurity Controls) | *Agent should note no confirmed data loss events |
| 6 | Request | High | OCC CSW (Incident Response), NIST CSF RS.MA, RS.AN | Comprehensive IR program review; expect forensic readiness items |
| 7 | Observation | Medium* | OCC CSW (Business Continuity), NIST CSF RC.RP | *Agent should note sequential test limitation vs. real scenario |
| 8 | Request | High | OCC CSW (Cybersecurity Controls), NIST CSF PR.AA | IAM deep dive; expect lifecycle and RBAC guidance |

*For observations, the agent should attempt to justify a lower residual risk than the auditor's assessed severity.
