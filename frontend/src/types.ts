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
