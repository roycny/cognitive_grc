import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Info,
  Plus,
  Printer,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import Layout from '../components/Layout'
import { api } from '../api/client'
import type { Audit, Issue, KRI } from '../types'

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

interface RiskArea {
  area: string
  total: number
  red: number
  amber: number
  green: number
}

function deriveKriStats(kris: KRI[]) {
  const areaMap = new Map<string, RiskArea>()
  for (const k of kris) {
    const a = areaMap.get(k.category) ?? { area: k.category, total: 0, red: 0, amber: 0, green: 0 }
    a.total += 1
    if (k.status === 'Red') a.red += 1
    else if (k.status === 'Amber') a.amber += 1
    else a.green += 1
    areaMap.set(k.category, a)
  }
  // Worst-first: areas with breaches, then warnings, then by size.
  const byArea = [...areaMap.values()].sort(
    (x, y) => y.red - x.red || y.amber - x.amber || y.total - x.total,
  )
  return {
    total: kris.length,
    red: kris.filter(k => k.status === 'Red').length,
    amber: kris.filter(k => k.status === 'Amber').length,
    green: kris.filter(k => k.status === 'Green').length,
    breachedAreas: byArea.filter(a => a.red > 0).length,
    byArea,
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

const RAG_TONE: Record<'Red' | 'Amber' | 'Green', Tone> = { Red: 'red', Amber: 'amber', Green: 'green' }

function RagCount({ n, tone }: { n: number; tone: Tone }) {
  if (n <= 0) return null
  const t = TONES[tone]
  return (
    <Box
      component="span"
      sx={{ minWidth: 22, textAlign: 'center', px: 0.75, py: 0.25, borderRadius: 1, fontSize: 12, fontWeight: 700, bgcolor: t.bg, color: t.fg }}
    >
      {n}
    </Box>
  )
}

/** Risk posture organised by risk area (KRI category), worst RAG first. */
function RiskAreaPanel({ areas, loading, onClick }: { areas: RiskArea[]; loading: boolean; onClick: () => void }) {
  return (
    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, height: '100%' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          Risk Areas — RAG status
        </Typography>
        <Stack direction="row" spacing={1} sx={{ fontSize: 11, color: 'text.secondary' }}>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: TONES.red.fg }} /> Breach
          </Box>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: TONES.amber.fg }} /> Warning
          </Box>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: TONES.green.fg }} /> OK
          </Box>
        </Stack>
      </Stack>

      {loading ? (
        <Stack spacing={1}>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" height={36} />)}
        </Stack>
      ) : areas.length === 0 ? (
        <Typography variant="caption" color="text.secondary">No KRIs recorded yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {areas.map((a) => {
            const worst: 'Red' | 'Amber' | 'Green' = a.red > 0 ? 'Red' : a.amber > 0 ? 'Amber' : 'Green'
            const tone = TONES[RAG_TONE[worst]]
            return (
              <Stack
                key={a.area}
                direction="row"
                alignItems="center"
                spacing={1.5}
                onClick={onClick}
                sx={{
                  borderLeft: '3px solid', borderColor: tone.fg, pl: 1.5, pr: 1, py: 0.75, borderRadius: 1,
                  cursor: 'pointer', transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{a.area}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {a.total} indicator{a.total !== 1 ? 's' : ''}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <RagCount n={a.red} tone="red" />
                  <RagCount n={a.amber} tone="amber" />
                  <RagCount n={a.green} tone="green" />
                </Stack>
              </Stack>
            )
          })}
        </Stack>
      )}
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
  const [kriStats, setKriStats] = useState<ReturnType<typeof deriveKriStats>>({
    total: 0, red: 0, amber: 0, green: 0, breachedAreas: 0, byArea: [],
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [{ data: audits }, { data: issues }, { data: kris }] = await Promise.all([
          api.get<Audit[]>('/audits/'),
          api.get<Issue[]>('/issues/'),
          api.get<KRI[]>('/kris/'),
        ])
        setAuditStats(deriveAuditStats(audits))
        setIssueStats(deriveIssueStats(issues))
        setKriStats(deriveKriStats(kris))
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

  const KRI_STATS: Stat[] = [
    { title: 'KRIs Tracked',      value: kriStats.total,         subtext: 'Across all risk areas',     icon: Activity,      tone: 'blue'  },
    { title: 'Breached (Red)',    value: kriStats.red,           subtext: 'Outside risk appetite',     icon: AlertCircle,   tone: 'red',    alarm: kriStats.red > 0 },
    { title: 'Warning (Amber)',   value: kriStats.amber,         subtext: 'Approaching threshold',     icon: TriangleAlert, tone: 'amber' },
    { title: 'Within Appetite',   value: kriStats.green,         subtext: 'Green status',              icon: CheckCircle2,  tone: 'green' },
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

        {/* Key Risk Indicators — focused on risk areas */}
        <Box>
          <SectionHeader
            icon={ShieldAlert}
            title="Key Risk Indicators"
            subtitle={
              kriStats.breachedAreas > 0
                ? `${kriStats.breachedAreas} risk area${kriStats.breachedAreas !== 1 ? 's' : ''} breaching appetite — RAG posture by area.`
                : 'Risk posture by area, measured against risk appetite.'
            }
            onViewAll={() => navigate('/kris')}
          />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' } }}>
            <StatGrid stats={KRI_STATS} columns={2} loading={loading} />
            <RiskAreaPanel areas={kriStats.byArea} loading={loading} onClick={() => navigate('/kris')} />
          </Box>
        </Box>
      </Stack>
    </Layout>
  )
}
