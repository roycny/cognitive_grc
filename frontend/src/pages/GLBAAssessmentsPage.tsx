import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { GlbaAssessmentDetail, GlbaAssessmentSummary } from '../types'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  'In Progress': { bg: 'rgba(247,144,9,0.14)', fg: '#B54708' },
  Completed: { bg: 'rgba(14,147,132,0.12)', fg: '#0E9384' },
}

function StatusPill({ value }: { value: string }) {
  const c = STATUS_COLORS[value] ?? { bg: 'rgba(91,97,120,0.12)', fg: '#475467' }
  return (
    <Box
      component="span"
      sx={{ px: 1, py: 0.25, borderRadius: 1.5, fontSize: 12, fontWeight: 600, bgcolor: c.bg, color: c.fg }}
    >
      {value}
    </Box>
  )
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

const EMPTY_DRAFT = { entity: '', period: '', lead: '' }

export default function GLBAAssessmentsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isViewer = user?.role === 'VIEWER'

  const [assessments, setAssessments] = useState<GlbaAssessmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const fetchAssessments = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<GlbaAssessmentSummary[]>('/glba/assessments')
      setAssessments(data)
    } catch (err) {
      console.error('Failed to fetch GLBA assessments', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchAssessments()
  }, [])

  const handleCreate = async () => {
    setSaving(true)
    try {
      const { data } = await api.post<GlbaAssessmentDetail>('/glba/assessments', draft)
      setCreateOpen(false)
      setDraft(EMPTY_DRAFT)
      navigate(`/assessments/glba/${data.id}`)
    } catch (err) {
      console.error('Failed to create GLBA assessment', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    try {
      await api.delete(`/glba/assessments/${deleteId}`)
      setAssessments((list) => list.filter((a) => a.id !== deleteId))
    } catch (err) {
      console.error('Failed to delete GLBA assessment', err)
    } finally {
      setDeleteId(null)
    }
  }

  const summary = useMemo(() => {
    const total = assessments.length
    const completed = assessments.filter((a) => a.status === 'Completed').length
    const inProgress = total - completed
    return { total, completed, inProgress }
  }, [assessments])

  return (
    <Layout title="GLBA Assessments">
      <Box sx={{ maxWidth: 1100 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <ShieldCheck size={28} color="#3538CD" />
            <Box>
              <Typography variant="h4">GLBA Assessments</Typography>
              <Typography variant="body2" color="text.secondary">
                Information Security Program assessments against the Interagency Guidelines (GLBA §501(b)) and Regulation P.
              </Typography>
            </Box>
          </Stack>
          {!isViewer && (
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setCreateOpen(true)}>
              Start new assessment
            </Button>
          )}
        </Stack>

        {/* Summary cards */}
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total assessments', value: summary.total },
            { label: 'In progress', value: summary.inProgress },
            { label: 'Completed', value: summary.completed },
          ].map((card) => (
            <Paper key={card.label} variant="outlined" sx={{ p: 2.5, borderRadius: 3, flex: 1 }}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {card.value}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {card.label}
              </Typography>
            </Paper>
          ))}
        </Stack>

        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, color: 'text.secondary', bgcolor: 'background.default' } }}>
                  <TableCell>Institution / Entity</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell>Lead assessor</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>Progress</TableCell>
                  <TableCell>Effective</TableCell>
                  <TableCell>Deficient</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : assessments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          No assessments yet
                        </Typography>
                        <Typography variant="body2">
                          {isViewer ? 'No GLBA assessments have been started.' : 'Click “Start new assessment” to begin.'}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  assessments.map((a) => {
                    const pct = a.total_controls ? Math.round((a.results_recorded / a.total_controls) * 100) : 0
                    return (
                      <TableRow
                        key={a.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/assessments/glba/${a.id}`)}
                      >
                        <TableCell sx={{ fontWeight: 600 }}>{a.entity || 'Untitled assessment'}</TableCell>
                        <TableCell>{a.period || '—'}</TableCell>
                        <TableCell>{a.lead || '—'}</TableCell>
                        <TableCell>
                          <StatusPill value={a.status} />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              sx={{ flex: 1, height: 8, borderRadius: 4 }}
                            />
                            <Typography variant="caption" sx={{ minWidth: 52, color: 'text.secondary' }}>
                              {a.results_recorded}/{a.total_controls}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{a.effective_count}</TableCell>
                        <TableCell>{a.deficient_count}</TableCell>
                        <TableCell>{formatDate(a.created_at)}</TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          {!isViewer && (
                            <IconButton size="small" color="error" onClick={() => setDeleteId(a.id)}>
                              <Trash2 size={16} />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Start a new GLBA assessment</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Institution / legal entity"
              value={draft.entity}
              onChange={(e) => setDraft((d) => ({ ...d, entity: e.target.value }))}
              fullWidth
              autoFocus
            />
            <TextField
              label="Assessment period"
              placeholder="e.g. FY2026"
              value={draft.period}
              onChange={(e) => setDraft((d) => ({ ...d, period: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Lead assessor"
              value={draft.lead}
              onChange={(e) => setDraft((d) => ({ ...d, lead: e.target.value }))}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              27 controls across 6 domains will be created. You can fill them in and edit at any time — every field saves automatically.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create & open'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete this assessment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This permanently deletes the assessment and all 27 control responses. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
