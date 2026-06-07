"""Canonical list of GLBA control IDs.

The full control template (titles, citations, objectives, procedures, required
evidence, scoring rules) lives on the frontend in ``src/data/glbaControls.ts``;
the backend only needs the ordered list of IDs so it can seed an empty response
row per control when an assessment is created. Keep these two in sync.
"""

# 27 controls across domains A–F. High-risk controls: C-01, C-03, C-06, C-07, C-10.
GLBA_CONTROL_IDS = [
    "A-01", "A-02", "A-03", "A-04",
    "B-01", "B-02", "B-03", "B-04",
    "C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07", "C-08", "C-09", "C-10",
    "D-01", "D-02", "D-03",
    "E-01", "E-02",
    "F-01", "F-02", "F-03", "F-04",
]
