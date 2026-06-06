import { api } from './client'

export interface AuditLogEntry {
  id: number
  timestamp: string
  username: string
  action: string
  resource_type: string | null
  resource_id: string | null
  detail: string | null
  ip_address: string | null
}

export interface AuditLogPage {
  items: AuditLogEntry[]
  total: number
  skip: number
  limit: number
}

export interface AuditLogFilters {
  search?: string
  action?: string
  username?: string
  resource_type?: string
  start_date?: string
  end_date?: string
  skip?: number
  limit?: number
}

function toParams(filters: AuditLogFilters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value))
    }
  })
  return params.toString()
}

export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogPage> {
  const { data } = await api.get<AuditLogPage>(`/audit-logs/?${toParams(filters)}`)
  return data
}

export async function exportAuditLogsCsv(filters: AuditLogFilters = {}): Promise<void> {
  const response = await api.get(`/audit-logs/export/csv?${toParams(filters)}`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  const date = new Date().toISOString().split('T')[0]
  link.setAttribute('download', `audit_logs_${date}.csv`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
