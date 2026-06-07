export type UserRole = 'ADMIN' | 'EDITOR' | 'AUDITOR' | 'VIEWER'

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
  is_active: boolean
}

export interface Audit {
  id: number
  audit_code?: string
  audit_type: string
  title: string
  start_date?: string
  end_date?: string
  status: string
  requests_total: number
  requests_open: number
  walkthroughs: number
  total_findings: number
  open_findings: number
  past_due: number
  key_risks?: string
  auditor_concerns?: string
}

export interface Issue {
  id: number
  issue_number?: string
  issue_type: string
  name: string
  status: string
  risk_rating: string
  owner?: string
  identified_date?: string
  target_date?: string
  description?: string
  remediation_plan?: string
}

export interface KRI {
  id: number
  kri_code?: string
  name: string
  category: string
  owner?: string
  frequency: string
  current_value?: string
  threshold?: string
  status: string
  trend?: string
  measurement_date?: string
  description?: string
}

export interface GlbaControlResponse {
  id: number
  control_id: string
  owner_desc?: string | null
  owner_evidence?: string | null
  owner_sign?: string | null
  test_methods?: string[] | null
  result?: string | null
  maturity?: string | null
  assessor_notes?: string | null
  assessor_sign?: string | null
}

export interface GlbaAssessmentSummary {
  id: number
  entity?: string | null
  period?: string | null
  lead?: string | null
  status: string
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  total_controls: number
  results_recorded: number
  effective_count: number
  deficient_count: number
}

export interface GlbaAssessmentDetail {
  id: number
  entity?: string | null
  period?: string | null
  lead?: string | null
  status: string
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  responses: GlbaControlResponse[]
}
