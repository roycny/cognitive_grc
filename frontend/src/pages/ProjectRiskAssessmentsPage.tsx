import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import type { SelectChangeEvent } from '@mui/material'
import { Plus, ShieldAlert, Trash2, Upload, Sparkles } from 'lucide-react'
import Layout from '../components/Layout'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AI_MODEL_KEY } from './SettingsPage'

export interface ProjectRiskSummary {
  id: number
  project_name: string
  assessor?: string | null
  period?: string | null
  status: string
  overall_inherent_rating?: string | null
  overall_residual_rating?: string | null
  risk_count: number
  open_actions: number
  created_at?: string | null
  updated_at?: string | null
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: 'rgba(91,97,120,0.12)', fg: '#475467' },
  Assessed: { bg: 'rgba(247,144,9,0.14)', fg: '#B54708' },
  Approved: { bg: 'rgba(14,147,132,0.12)', fg: '#0E9384' },
}

export const RATING_COLORS: Record<string, { bg: string; fg: string }> = {
  Critical: { bg: 'rgba(198,40,40,0.12)', fg: '#C62828' },
  High: { bg: 'rgba(230,81,0,0.12)', fg: '#E65100' },
  Medium: { bg: 'rgba(249,168,37,0.16)', fg: '#B7791F' },
  Low: { bg: 'rgba(46,125,50,0.12)', fg: '#2E7D32' },
}

export function RatingPill({ value }: { value?: string | null }) {
  if (!value) return <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>
  const c = RATING_COLORS[value] ?? { bg: 'rgba(91,97,120,0.12)', fg: '#475467' }
  return (
    <Box
      component="span"
      sx={{ px: 1, py: 0.25, borderRadius: 1.5, fontSize: 12, fontWeight: 700, bgcolor: c.bg, color: c.fg }}
    >
      {value}
    </Box>
  )
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

const getTodayDateString = () => {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const getEmptyDraft = () => ({
  project_name: '',
  period: getTodayDateString(),
  assessor: '',
  description: '',
})

export default function ProjectRiskAssessmentsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isViewer = user?.role === 'VIEWER'

  const [rows, setRows] = useState<ProjectRiskSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState(getEmptyDraft)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  // Document upload state on creation
  const [files, setFiles] = useState<File[]>([])
  const [reportFormat, setReportFormat] = useState('Standard')

  const fetchRows = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<ProjectRiskSummary[]>('/project-risk/assessments')
      setRows(data)
    } catch (err) {
      console.error('Failed to fetch project risk assessments', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchRows()
  }, [])

  const handleCreate = async () => {
    if (!draft.project_name.trim()) return
    setSaving(true)
    try {
      const { data } = await api.post<{ id: number }>('/project-risk/assessments', {
        ...draft,
        report_format: reportFormat,
      })

      if (files.length > 0) {
        const activeModel = localStorage.getItem(AI_MODEL_KEY) || 'gemini-3.5-flash'
        const formData = new FormData()
        files.forEach((f) => formData.append('files', f))
        formData.append('model_name', activeModel)
        formData.append('report_format', reportFormat)

        await api.post(`/project-risk/assessments/${data.id}/ai-assess`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      setCreateOpen(false)
      setDraft(getEmptyDraft())
      setFiles([])
      setReportFormat('Standard')
      navigate(`/assessments/project-risk/${data.id}`)
    } catch (err) {
      console.error('Failed to create project risk assessment', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    try {
      await api.delete(`/project-risk/assessments/${deleteId}`)
      setRows((list) => list.filter((a) => a.id !== deleteId))
    } catch (err) {
      console.error('Failed to delete project risk assessment', err)
    } finally {
      setDeleteId(null)
    }
  }

  const summary = useMemo(() => {
    const total = rows.length
    const highOrCritical = rows.filter(
      (a) => a.overall_residual_rating === 'High' || a.overall_residual_rating === 'Critical',
    ).length
    const openActions = rows.reduce((sum, a) => sum + (a.open_actions || 0), 0)
    return { total, highOrCritical, openActions }
  }, [rows])

  return (
    <Layout title="Project Risk Assessments">
      <Box sx={{ maxWidth: 1200 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <ShieldAlert size={28} color="#3538CD" />
            <Box>
              <Typography variant="h4">Project Risk Assessments</Typography>
              <Typography variant="body2" color="text.secondary">
                AI-assisted, quantified project risk — score risks on a 5×5 matrix, track residual risk and remediation.
              </Typography>
            </Box>
          </Stack>
          {!isViewer && (
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setCreateOpen(true)}>
              New assessment
            </Button>
          )}
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total assessments', value: summary.total },
            { label: 'High / Critical residual', value: summary.highOrCritical },
            { label: 'Open actions', value: summary.openActions },
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
                  <TableCell>Project</TableCell>
                  <TableCell>Assessor</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Inherent</TableCell>
                  <TableCell>Residual</TableCell>
                  <TableCell align="center">Risks</TableCell>
                  <TableCell align="center">Open actions</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          No assessments yet
                        </Typography>
                        <Typography variant="body2">
                          {isViewer ? 'No project risk assessments have been created.' : 'Click “New assessment” to begin.'}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((a) => (
                    <TableRow
                      key={a.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/assessments/project-risk/${a.id}`)}
                    >
                      <TableCell sx={{ fontWeight: 600 }}>{a.project_name || 'Untitled project'}</TableCell>
                      <TableCell>{a.assessor || '—'}</TableCell>
                      <TableCell>{a.period || '—'}</TableCell>
                      <TableCell>
                        <StatusPill value={a.status} />
                      </TableCell>
                      <TableCell>
                        <RatingPill value={a.overall_inherent_rating} />
                      </TableCell>
                      <TableCell>
                        <RatingPill value={a.overall_residual_rating} />
                      </TableCell>
                      <TableCell align="center">{a.risk_count}</TableCell>
                      <TableCell align="center">{a.open_actions}</TableCell>
                      <TableCell>{formatDate(a.updated_at)}</TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        {!isViewer && (
                          <IconButton size="small" color="error" onClick={() => setDeleteId(a.id)}>
                            <Trash2 size={16} />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New project risk assessment</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Project name"
              value={draft.project_name}
              onChange={(e) => setDraft((d) => ({ ...d, project_name: e.target.value }))}
              fullWidth
              autoFocus
              required
            />
            <TextField
              label="Assessment period"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={draft.period}
              onChange={(e) => setDraft((d) => ({ ...d, period: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Lead assessor"
              value={draft.assessor}
              onChange={(e) => setDraft((d) => ({ ...d, assessor: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Project description / scope (optional)"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" fontWeight={700}>
              AI Assessment (Optional)
            </Typography>
            <Box
              sx={{
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 2,
                textAlign: 'center',
                bgcolor: 'action.hover',
                cursor: 'pointer',
              }}
              component="label"
            >
              <input
                type="file"
                multiple
                accept=".pdf,.txt,.md"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) setFiles(Array.from(e.target.files))
                }}
              />
              <Upload size={24} style={{ margin: '0 auto 8px', opacity: 0.7 }} />
              <Typography variant="caption" display="block" fontWeight={600}>
                Upload project documentation (PDF, TXT, MD)
              </Typography>
              {files.length > 0 && (
                <Typography variant="caption" color="primary" sx={{ mt: 1, display: 'block', fontWeight: 700 }}>
                  {files.length} file(s) selected
                </Typography>
              )}
            </Box>

            <FormControl fullWidth size="small">
              <InputLabel id="format-label">Assessment Format</InputLabel>
              <Select
                labelId="format-label"
                label="Assessment Format"
                value={reportFormat}
                onChange={(e: SelectChangeEvent) => setReportFormat(e.target.value)}
              >
                <MenuItem value="Standard">Standard Risk Matrix</MenuItem>
                <MenuItem value="CRAID">CRAID Log</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => {
            setCreateOpen(false)
            setFiles([])
          }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving || !draft.project_name.trim()}
            startIcon={files.length > 0 ? <Sparkles size={16} /> : undefined}
          >
            {saving ? 'Creating & Assessing…' : files.length > 0 ? 'Create & Assess' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete this assessment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This permanently deletes the assessment and all its risks. This cannot be undone.
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
