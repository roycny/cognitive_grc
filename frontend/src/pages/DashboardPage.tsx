import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material'
import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Info,
  Plus,
  Printer,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import Layout from '../components/Layout'
import { api } from '../api/client'
import type { Audit, Issue } from '../types'

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'orange'

const TONES: Record<Tone, { fg: string; bg: string }> = {
  blue:   { fg: '#3538CD', bg: 'rgba(53, 56, 205, 0.10)' },
  green:  { fg: '#0E9384', bg: 'rgba(14, 147, 132, 0.12)' },
  amber:  { fg: '#B54708', bg: 'rgba(247, 144, 9, 0.14)' },
  red:    { fg: '#D92D20', bg: 'rgba(217, 45, 32, 0.10)' },
  orange: { fg: '#C4320A', bg: 'rgba(239, 104, 32, 0.12)' },
}

// ---------------------------------------------------------------------------
// Stat derivation helpers
// ---------------------------------------------------------------------------
const ACTIVE_STATUSES = new Set(['Planning', 'Scheduled', 'Fieldwork', 'Reporting', 'Remediation'])
const CLOSED_STATUSES  = new Set(['Completed', 'Cancelled'])

function twelveMonthsAgo(): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d
}

function inLast12M(dateStr?: string): boolean {
  if (!dateStr) return true          // no date → include (don't silently drop)
  return new Date(dateStr) >= twelveMonthsAgo()
}

function isPastDue(dateStr?: string): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function deriveAuditStats(audits: Audit[]) {
  return {
    active:       audits.filter(a => ACTIVE_STATUSES.has(a.status)).length,
    closed12M:    audits.filter(a => CLOSED_STATUSES.has(a.status) && inLast12M(a.end_date)).length,
    openFindings: audits.reduce((sum, a) => sum + (a.open_findings ?? 0), 0),
    pastDue:      audits.reduce((sum, a) => sum + (a.past_due ?? 0), 0),
  }
}

function deriveIssueStats(issues: Issue[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return {
    total12M:    issues.filter(i => inLast12M(i.identified_date)).length,
    open:        issues.filter(i => i.status === 'Open').length,
    highRiskOpen: issues.filter(i => i.status === 'Open' && i.risk_rating === 'High').length,
    pastDue:     issues.filter(i => i.status === 'Open' && isPastDue(i.target_date)).length,
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
interface Stat {
  title: string
  value: number
  subtext: string
  icon: LucideIcon
  tone: Tone
  alarm?: boolean
}

function StatCard({ stat, loading }: { stat: Stat; loading: boolean }) {
  const Icon = stat.icon
  const tone = TONES[stat.tone]
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        p: 2.5,
        height: '100%',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        '&:hover': { boxShadow: '0 4px 16px rgba(15,19,36,0.06)', borderColor: 'rgba(53,56,205,0.3)' },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {stat.title}
        </Typography>
        <Box
          sx={{
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: tone.bg, color: tone.fg, flexShrink: 0,
          }}
        >
          <Icon size={16} />
        </Box>
      </Stack>
      {loading ? (
        <Skeleton variant="text" width={60} height={48} />
      ) : (
        <Typography sx={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, color: stat.alarm ? 'error.main' : 'text.primary' }}>
          {stat.value}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {stat.subtext}
      </Typography>
    </Box>
  )
}

function SectionHeader({
  icon: Icon, title, subtitle, onViewAll,
}: {
  icon: LucideIcon; title: string; subtitle: string; onViewAll?: () => void
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Icon size={20} color="#3538CD" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
        </Stack>
        {onViewAll && (
          <Button size="small" sx={{ minWidth: 0, p: 0 }} onClick={onViewAll}>
            View All
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>
    </Box>
  )
}

function StatGrid({ stats, columns = 2, loading }: { stats: Stat[]; columns?: number; loading: boolean }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: `repeat(${columns}, 1fr)` } }}>
      {stats.map((stat) => <StatCard key={stat.title} stat={stat} loading={loading} />)}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const navigate = useNavigate()

  const [loading, setLoading]   = useState(true)
  const [auditStats, setAuditStats] = useState({ active: 0, closed12M: 0, openFindings: 0, pastDue: 0 })
  const [issueStats, setIssueStats] = useState({ total12M: 0, open: 0, highRiskOpen: 0, pastDue: 0 })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [{ data: audits }, { data: issues }] = await Promise.all([
          api.get<Audit[]>('/audits/'),
          api.get<Issue[]>('/issues/'),
        ])
        setAuditStats(deriveAuditStats(audits))
        setIssueStats(deriveIssueStats(issues))
      } catch (err) {
        console.error('Dashboard fetch failed', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const AUDIT_STATS: Stat[] = [
    { title: 'Active Engagements',  value: auditStats.active,       subtext: 'Planning, Fieldwork & Reporting', icon: Clock,        tone: 'blue'  },
    { title: 'Closed Cycles (12M)', value: auditStats.closed12M,    subtext: 'Completed & Cancelled',           icon: CheckCircle2, tone: 'green' },
    { title: 'Open Findings',       value: auditStats.openFindings,  subtext: 'Total across all audits',         icon: TriangleAlert, tone: 'amber' },
    { title: 'Past Due Findings',   value: auditStats.pastDue,       subtext: 'Action required',                 icon: AlertCircle,  tone: 'red'   },
  ]

  const ISSUE_STATS: Stat[] = [
    { title: 'Total Issues (12M)', value: issueStats.total12M,     subtext: 'All tracked issues',   icon: Info,          tone: 'blue'   },
    { title: 'Open Issues',        value: issueStats.open,         subtext: 'Requiring attention',  icon: TriangleAlert, tone: 'amber'  },
    { title: 'High Risk - Open',   value: issueStats.highRiskOpen, subtext: 'High rating issues',   icon: AlertCircle,   tone: 'red',   alarm: issueStats.highRiskOpen > 0 },
    { title: 'Past Due',           value: issueStats.pastDue,      subtext: 'Missed target date',   icon: Clock,         tone: 'orange', alarm: issueStats.pastDue > 0 },
  ]

  return (
    <Layout title="Main Dashboard">
      <Stack spacing={4}>
        {/* Page heading */}
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" sx={{ mb: 0.5 }}>Platform Overview</Typography>
            <Typography color="text.secondary">High-level summary of all Governance, Risk, and Compliance modules.</Typography>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button variant="outlined" color="inherit" startIcon={<Plus size={16} />}>New Item</Button>
            <Button variant="contained" startIcon={<Printer size={16} />}>Export Report</Button>
          </Stack>
        </Stack>

        {/* AI Insights banner */}
        <Box sx={{ borderRadius: 3, p: 2.5, border: '1px solid', borderColor: 'rgba(99,102,241,0.25)', background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(14,147,132,0.06) 100%)' }}>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper', color: 'primary.main', flexShrink: 0, boxShadow: '0 1px 4px rgba(15,19,36,0.08)' }}>
              <Sparkles size={20} />
            </Box>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>AI Insights &amp; Actionable Intelligence</Typography>
                <Chip label="BETA" size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(53,56,205,0.12)', color: 'primary.main' }} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Cognitive engine has identified 3 potential risk overlaps across active engagements and flagged anomalies in recent audit findings.
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" color="primary" startIcon={<ClipboardCheck size={14} />} onClick={() => navigate('/audits')}>
                  Review Audit Findings
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Box>

        {/* Audit & Issue side-by-side */}
        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
          <Box>
            <SectionHeader icon={ClipboardCheck} title="Audit & Exam" subtitle="Unified view of Internal, External, and Regulatory engagements." onViewAll={() => navigate('/audits')} />
            <StatGrid stats={AUDIT_STATS} loading={loading} />
          </Box>
          <Box>
            <SectionHeader icon={TriangleAlert} title="Issue Tracking" subtitle="Overview of all tracked issues and their status." onViewAll={() => navigate('/issues')} />
            <StatGrid stats={ISSUE_STATS} loading={loading} />
          </Box>
        </Box>
      </Stack>
    </Layout>
  )
}
