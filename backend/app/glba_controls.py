"""Canonical list of GLBA control IDs.

The full control template (titles, citations, objectives, procedures, required
evidence, scoring rules) lives in ``app.glba_template`` (a backend mirror of the
frontend's ``src/data/glbaControls.ts``).  This module derives the ordered list
of IDs from that template so the seeding logic and the template can never drift.

High-risk controls: C-01, C-03, C-06, C-07, C-10.
"""

from app.glba_template import GLBA_CONTROLS

# 27 controls across domains A–F, in template (and report) order.
GLBA_CONTROL_IDS = [c.id for c in GLBA_CONTROLS]
