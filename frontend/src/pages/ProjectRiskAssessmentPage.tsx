import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import {
  ArrowLeft,
  FileDown,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import Layout from '../components/Layout'
import DebouncedTextField from '../components/DebouncedTextField'
import { api, projectRiskReportUrl } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { ProjectRisk, ProjectRiskAssessmentDetail } from '../types'
import { RatingPill, RATING_COLORS } from './ProjectRiskAssessmentsPage'
import { AI_MODEL_KEY } from './SettingsPage'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const CRAID_CATEGORIES = ['Change', 'Risk', 'Action', 'Issue', 'Decision/Dependency']
const STANDARD_CATEGORIES = [
  'Security',
  'Operational',
  'Compliance',
  'Financial',
  'Schedule',
  'Third-Party',
  'Data Privacy',
]

const scoreToRating = (score: number) => {
  if (score >= 16) return 'Critical'
  if (score >= 10) return 'High'
  if (score >= 5) return 'Medium'
  return 'Low'
}

const getExistingControlsLabel = (cat: string) => {
  if (cat === 'Change') return 'Current Status / Baseline'
  if (cat === 'Action') return 'Action Details / Scope'
  if (cat === 'Decision/Dependency') return 'Decision Details / Dependency Conditions'
  if (cat === 'Issue') return 'Existing Controls / Symptoms'
  return 'Existing Controls'
}

const getMitigationLabel = (cat: string) => {
  if (cat === 'Change') return 'Impact / Mitigation Plan'
  if (cat === 'Action') return 'Remediation / Action Plan'
  if (cat === 'Decision/Dependency') return 'Stakeholder Choices / Impact Management'
  if (cat === 'Issue') return 'Recommended Remediation'
  return 'Recommended Mitigation'
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return (
      <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'text.secondary' }}>
        <CircularProgress size={14} color="inherit" />
        <Typography variant="caption">Saving...</Typography>
      </Stack>
    )
  }
  if (state === 'saved') {
    return (
      <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
        All changes saved
      </Typography>
    )
  }
  if (state === 'error') {
    return (
      <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
        Error saving changes
      </Typography>
    )
  }
  return null
}

export default function ProjectRiskAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const readOnly = user?.role === 'VIEWER'

  const [assessment, setAssessment] = useState<ProjectRiskAssessmentDetail | null>(null)
  const [risks, setRisks] = useState<ProjectRisk[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  // AI Assessment panel state
  const [aiOpen, setAiOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [pastedText, setPastedText] = useState('')
  const [assessing, setAssessing] = useState(false)

  // CRAID active tab
  const [craidTab, setCraidTab] = useState(0)

  const inFlight = useRef(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await api.get<ProjectRiskAssessmentDetail>(`/project-risk/assessments/${id}`)
        setAssessment(data)
        setRisks(data.risks || [])
      } catch (err) {
        console.error('Failed to load project risk assessment', err)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id])

  const trackSave = useCallback(async (fn: () => Promise<unknown>) => {
    inFlight.current += 1
    setSaveState('saving')
    try {
      await fn()
      inFlight.current -= 1
      if (inFlight.current === 0) setSaveState('saved')
    } catch (err) {
      console.error('Save failed', err)
      inFlight.current = Math.max(0, inFlight.current - 1)
      setSaveState('error')
    }
  }, [])

  const saveAssessment = useCallback(
    async (updatedAssessment: ProjectRiskAssessmentDetail, updatedRisks: ProjectRisk[]) => {
      const payload = {
        project_name: updatedAssessment.project_name,
        description: updatedAssessment.description,
        assessor: updatedAssessment.assessor,
        period: updatedAssessment.period,
        status: updatedAssessment.status,
        executive_summary: updatedAssessment.executive_summary,
        report_format: updatedAssessment.report_format,
        risks: updatedRisks.map((r) => ({
          title: r.title,
          category: r.category,
          description: r.description,
          likelihood: r.likelihood,
          impact: r.impact,
          existing_controls: r.existing_controls,
          recommended_mitigation: r.recommended_mitigation,
          residual_likelihood: r.residual_likelihood,
          residual_impact: r.residual_impact,
          owner: r.owner,
          target_date: r.target_date,
          action_items: r.action_items || [],
          is_completed: r.is_completed,
        })),
      }
      await trackSave(() => api.put(`/project-risk/assessments/${id}`, payload))
    },
    [id, trackSave],
  )

  const patchHeader = useCallback(
    (fields: Partial<ProjectRiskAssessmentDetail>) => {
      if (!assessment) return
      const next = { ...assessment, ...fields }
      setAssessment(next)
      void saveAssessment(next, risks)
    },
    [assessment, risks, saveAssessment],
  )

  // Handle inline modification of a risk row
  const handleRiskChange = (index: number, fields: Partial<ProjectRisk>) => {
    if (!assessment) return
    const nextRisks = [...risks]
    const updated = { ...nextRisks[index], ...fields }

    // Recompute inherent / residual ratings if likelihood or impact change
    const isScoreable =
      assessment.report_format !== 'CRAID' ||
      updated.category === 'Risk' ||
      updated.category === 'Issue'

    if (isScoreable) {
      if (fields.likelihood !== undefined || fields.impact !== undefined) {
        const lk = updated.likelihood ?? 3
        const im = updated.impact ?? 3
        updated.likelihood = lk
        updated.impact = im
        updated.inherent_rating = scoreToRating(lk * im)
      }
      if (fields.residual_likelihood !== undefined || fields.residual_impact !== undefined) {
        const rlk = updated.residual_likelihood ?? updated.likelihood ?? 3
        const rim = updated.residual_impact ?? updated.impact ?? 3
        updated.residual_likelihood = rlk
        updated.residual_impact = rim
        updated.residual_rating = scoreToRating(rlk * rim)
      }
    } else {
      updated.likelihood = null
      updated.impact = null
      updated.inherent_rating = null
      updated.residual_likelihood = null
      updated.residual_impact = null
      updated.residual_rating = null
    }

    nextRisks[index] = updated
    setRisks(nextRisks)
    void saveAssessment(assessment, nextRisks)
  }

  const addRiskRow = (category: string) => {
    if (!assessment) return
    const newRow: ProjectRisk = {
      id: Date.now(), // temporary ID
      title: 'New Item',
      category: category,
      description: '',
      likelihood: category === 'Risk' || category === 'Issue' || assessment.report_format !== 'CRAID' ? 3 : null,
      impact: category === 'Risk' || category === 'Issue' || assessment.report_format !== 'CRAID' ? 3 : null,
      inherent_rating: category === 'Risk' || category === 'Issue' || assessment.report_format !== 'CRAID' ? 'Medium' : null,
      existing_controls: '',
      recommended_mitigation: '',
      residual_likelihood: category === 'Risk' || category === 'Issue' || assessment.report_format !== 'CRAID' ? 3 : null,
      residual_impact: category === 'Risk' || category === 'Issue' || assessment.report_format !== 'CRAID' ? 3 : null,
      residual_rating: category === 'Risk' || category === 'Issue' || assessment.report_format !== 'CRAID' ? 'Medium' : null,
      owner: '',
      target_date: '',
      action_items: [],
      is_completed: false,
    }
    const nextRisks = [...risks, newRow]
    setRisks(nextRisks)
    void saveAssessment(assessment, nextRisks)
  }

  const deleteRiskRow = (index: number) => {
    if (!assessment) return
    const nextRisks = risks.filter((_, i) => i !== index)
    setRisks(nextRisks)
    void saveAssessment(assessment, nextRisks)
  }

  // File Upload Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const runAIAssessment = async () => {
    if (!assessment) return
    setAssessing(true)
    try {
      const activeModel = localStorage.getItem(AI_MODEL_KEY) || 'gemini-3.5-flash'
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      formData.append('pasted_text', pastedText)
      formData.append('model_name', activeModel)
      formData.append('report_format', assessment.report_format || 'Standard')

      const { data } = await api.post<ProjectRiskAssessmentDetail>(
        `/project-risk/assessments/${assessment.id}/ai-assess`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      )
      setAssessment(data)
      setRisks(data.risks || [])
      setAiOpen(false)
      setFiles([])
      setPastedText('')
      setSaveState('saved')
    } catch (err) {
      console.error('AI assessment failed', err)
      setSaveState('error')
    } finally {
      setAssessing(false)
    }
  }

  // Filtered risks for CRAID Tabs
  const activeTabCategory = CRAID_CATEGORIES[craidTab]
  const filteredCraidRisks = useMemo(() => {
    return risks
      .map((r, originalIndex) => ({ r, originalIndex }))
      .filter((item) => item.r.category === activeTabCategory)
  }, [risks, activeTabCategory])

  if (loading) {
    return (
      <Layout title="Project Risk Assessment">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      </Layout>
    )
  }

  if (notFound || !assessment) {
    return (
      <Layout title="Project Risk Assessment">
        <Alert severity="error" sx={{ maxWidth: 600 }}>
          Assessment not found.{' '}
          <Button size="small" onClick={() => navigate('/assessments/project-risk')}>
            Back to assessments
          </Button>
        </Alert>
      </Layout>
    )
  }

  return (
    <Layout title="Project Risk Assessment">
      <Box sx={{ pb: 8 }}>
        {/* Top Navigation & Status */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Button
            startIcon={<ArrowLeft size={18} />}
            onClick={() => navigate('/assessments/project-risk')}
            color="inherit"
          >
            All assessments
          </Button>
          <Stack direction="row" alignItems="center" spacing={2.5}>
            <SaveIndicator state={saveState} />
            {!readOnly && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<Sparkles size={18} />}
                onClick={() => setAiOpen(true)}
              >
                AI Assess
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<FileDown size={18} />}
              onClick={() => window.open(projectRiskReportUrl(assessment.id), '_blank', 'noopener')}
            >
              Generate report
            </Button>
          </Stack>
        </Stack>

        {/* Header Information Card */}
        <Paper variant="outlined" sx={{ p: 3.5, borderRadius: 3, mb: 4 }}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(53, 56, 205, 0.08)',
                color: 'primary.main',
              }}
            >
              <Save size={24} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 750 }}>
                {assessment.project_name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Quantified project-level GRC tracking & assessment
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Chip
                label={assessment.report_format || 'Standard'}
                color="primary"
                variant="outlined"
                size="small"
                sx={{ fontWeight: 700 }}
              />
              <Chip
                label={`${risks.length} Items`}
                color="default"
                size="small"
                sx={{ fontWeight: 700 }}
              />
            </Stack>
          </Stack>

          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <DebouncedTextField
                label="Project name"
                value={assessment.project_name}
                onChange={(e) => patchHeader({ project_name: e.target.value })}
                fullWidth
                disabled={readOnly}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <DebouncedTextField
                label="Assessment period"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={assessment.period || ''}
                onChange={(e) => patchHeader({ period: e.target.value })}
                fullWidth
                disabled={readOnly}
              />
            </Grid>
            <Grid item xs={12} md={2.5}>
              <DebouncedTextField
                label="Lead assessor"
                value={assessment.assessor || ''}
                onChange={(e) => patchHeader({ assessor: e.target.value })}
                fullWidth
                disabled={readOnly}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel id="status-label">Status</InputLabel>
                <Select
                  labelId="status-label"
                  label="Status"
                  value={assessment.status}
                  onChange={(e: SelectChangeEvent) => patchHeader({ status: e.target.value })}
                  disabled={readOnly}
                >
                  <MenuItem value="Draft">Draft</MenuItem>
                  <MenuItem value="Assessed">Assessed</MenuItem>
                  <MenuItem value="Approved">Approved</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={1.5}>
              <FormControl fullWidth>
                <InputLabel id="format-label">Format</InputLabel>
                <Select
                  labelId="format-label"
                  label="Format"
                  value={assessment.report_format || 'Standard'}
                  onChange={(e: SelectChangeEvent) => {
                    patchHeader({ report_format: e.target.value })
                  }}
                  disabled={readOnly}
                >
                  <MenuItem value="Standard">Standard Matrix</MenuItem>
                  <MenuItem value="CRAID">CRAID Log</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <DebouncedTextField
                label="Project Scope / Description"
                value={assessment.description || ''}
                onChange={(e) => patchHeader({ description: e.target.value })}
                fullWidth
                multiline
                rows={2}
                disabled={readOnly}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Executive Summary & Scores */}
        <Grid container spacing={4} sx={{ mb: 4 }}>
          <Grid item xs={12} md={8}>
            <Card variant="outlined" sx={{ p: 3, borderRadius: 3, height: '100%' }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Executive Summary
              </Typography>
              <DebouncedTextField
                value={assessment.executive_summary || ''}
                onChange={(e) => patchHeader({ executive_summary: e.target.value })}
                fullWidth
                multiline
                rows={5}
                placeholder="Enter overall risk summary..."
                disabled={readOnly}
              />
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack spacing={2} sx={{ height: '100%', justifyContent: 'space-between' }}>
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  borderRadius: 3,
                  bgcolor:
                    RATING_COLORS[assessment.overall_inherent_rating || '']?.bg || 'action.hover',
                  borderColor:
                    RATING_COLORS[assessment.overall_inherent_rating || '']?.fg || 'divider',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  OVERALL INHERENT RISK RATING
                </Typography>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 800,
                    color: RATING_COLORS[assessment.overall_inherent_rating || '']?.fg || 'inherit',
                  }}
                >
                  {assessment.overall_inherent_rating || '—'}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  borderRadius: 3,
                  bgcolor:
                    RATING_COLORS[assessment.overall_residual_rating || '']?.bg || 'action.hover',
                  borderColor:
                    RATING_COLORS[assessment.overall_residual_rating || '']?.fg || 'divider',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  OVERALL RESIDUAL RISK RATING
                </Typography>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 800,
                    color: RATING_COLORS[assessment.overall_residual_rating || '']?.fg || 'inherit',
                  }}
                >
                  {assessment.overall_residual_rating || '—'}
                </Typography>
              </Paper>
            </Stack>
          </Grid>
        </Grid>

        {/* Assessment Log Sections */}
        {assessment.report_format === 'CRAID' ? (
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Tabs
              value={craidTab}
              onChange={(_, v) => setCraidTab(v)}
              indicatorColor="primary"
              textColor="primary"
              sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
            >
              {CRAID_CATEGORIES.map((cat) => {
                const count = risks.filter((r) => r.category === cat).length
                return (
                  <Tab
                    key={cat}
                    label={`${cat}s (${count})`}
                    sx={{ fontWeight: 700, fontSize: 13.5 }}
                  />
                )
              })}
            </Tabs>

            <Box sx={{ p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={750}>
                  {activeTabCategory} Log
                </Typography>
                {!readOnly && (
                  <Button
                    variant="outlined"
                    startIcon={<Plus size={16} />}
                    size="small"
                    onClick={() => addRiskRow(activeTabCategory)}
                  >
                    Add {activeTabCategory}
                  </Button>
                )}
              </Stack>

              {filteredCraidRisks.length === 0 ? (
                <Box sx={{ py: 6, color: 'text.secondary', textAlign: 'center' }}>
                  <Typography variant="body2">No {activeTabCategory}s identified yet.</Typography>
                </Box>
              ) : (
                <Stack spacing={3.5} divider={<Divider />}>
                  {filteredCraidRisks.map(({ r, originalIndex }) => {
                    const isScoreable = activeTabCategory === 'Risk' || activeTabCategory === 'Issue'
                    return (
                      <Grid container spacing={2.5} key={r.id}>
                        <Grid item xs={12} md={isScoreable ? 6 : 9}>
                          <Stack spacing={2}>
                            <TextField
                              label="Title"
                              value={r.title}
                              onChange={(e) => handleRiskChange(originalIndex, { title: e.target.value })}
                              fullWidth
                              size="small"
                              disabled={readOnly}
                              sx={{ '& .MuiInputBase-input': { fontWeight: 600 } }}
                            />
                            <TextField
                              label="Description"
                              value={r.description || ''}
                              onChange={(e) => handleRiskChange(originalIndex, { description: e.target.value })}
                              fullWidth
                              size="small"
                              multiline
                              rows={2}
                              disabled={readOnly}
                            />
                          </Stack>
                        </Grid>

                        {isScoreable && (
                          <Grid item xs={12} md={3}>
                            <Stack spacing={2}>
                              <Stack direction="row" spacing={1}>
                                <FormControl fullWidth size="small">
                                  <InputLabel>Likelihood</InputLabel>
                                  <Select
                                    value={String(r.likelihood ?? 3)}
                                    label="Likelihood"
                                    onChange={(e) =>
                                      handleRiskChange(originalIndex, { likelihood: Number(e.target.value) })
                                    }
                                    disabled={readOnly}
                                  >
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                                <FormControl fullWidth size="small">
                                  <InputLabel>Impact</InputLabel>
                                  <Select
                                    value={String(r.impact ?? 3)}
                                    label="Impact"
                                    onChange={(e) =>
                                      handleRiskChange(originalIndex, { impact: Number(e.target.value) })
                                    }
                                    disabled={readOnly}
                                  >
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </Stack>
                              <Stack direction="row" alignItems="center" justifyContent="space-between">
                                <Typography variant="caption" color="text.secondary">
                                  Inherent Rating:
                                </Typography>
                                <RatingPill value={r.inherent_rating} />
                              </Stack>
                            </Stack>
                          </Grid>
                        )}

                        <Grid item xs={12} md={3}>
                          <Stack spacing={2}>
                            <TextField
                              label="Owner"
                              value={r.owner || ''}
                              onChange={(e) => handleRiskChange(originalIndex, { owner: e.target.value })}
                              fullWidth
                              size="small"
                              disabled={readOnly}
                            />
                            <TextField
                              label="Target Date"
                              placeholder="e.g. YYYY-MM-DD"
                              value={r.target_date || ''}
                              onChange={(e) => handleRiskChange(originalIndex, { target_date: e.target.value })}
                              fullWidth
                              size="small"
                              disabled={readOnly}
                            />
                          </Stack>
                        </Grid>

                        <Grid item xs={12} md={6}>
                          <TextField
                            label={getExistingControlsLabel(activeTabCategory)}
                            value={r.existing_controls || ''}
                            onChange={(e) => handleRiskChange(originalIndex, { existing_controls: e.target.value })}
                            fullWidth
                            size="small"
                            multiline
                            rows={2}
                            disabled={readOnly}
                          />
                        </Grid>

                        <Grid item xs={12} md={isScoreable ? 3 : 5}>
                          <TextField
                            label={getMitigationLabel(activeTabCategory)}
                            value={r.recommended_mitigation || ''}
                            onChange={(e) => handleRiskChange(originalIndex, { recommended_mitigation: e.target.value })}
                            fullWidth
                            size="small"
                            multiline
                            rows={2}
                            disabled={readOnly}
                          />
                        </Grid>

                        {isScoreable && (
                          <Grid item xs={12} md={2}>
                            <Stack spacing={2}>
                              <Stack direction="row" spacing={1}>
                                <FormControl fullWidth size="small">
                                  <InputLabel>Res. Likelihood</InputLabel>
                                  <Select
                                    value={String(r.residual_likelihood ?? 3)}
                                    label="Res. Likelihood"
                                    onChange={(e) =>
                                      handleRiskChange(originalIndex, { residual_likelihood: Number(e.target.value) })
                                    }
                                    disabled={readOnly}
                                  >
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                                <FormControl fullWidth size="small">
                                  <InputLabel>Res. Impact</InputLabel>
                                  <Select
                                    value={String(r.residual_impact ?? 3)}
                                    label="Res. Impact"
                                    onChange={(e) =>
                                      handleRiskChange(originalIndex, { residual_impact: Number(e.target.value) })
                                    }
                                    disabled={readOnly}
                                  >
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </Stack>
                              <Stack direction="row" alignItems="center" justifyContent="space-between">
                                <Typography variant="caption" color="text.secondary">
                                  Residual Rating:
                                </Typography>
                                <RatingPill value={r.residual_rating} />
                              </Stack>
                            </Stack>
                          </Grid>
                        )}

                        <Grid item xs={12} md={1} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Checkbox
                              checked={r.is_completed}
                              onChange={(e) => handleRiskChange(originalIndex, { is_completed: e.target.checked })}
                              disabled={readOnly}
                            />
                            {!readOnly && (
                              <IconButton color="error" size="small" onClick={() => deleteRiskRow(originalIndex)}>
                                <Trash2 size={16} />
                              </IconButton>
                            )}
                          </Stack>
                        </Grid>
                      </Grid>
                    )
                  })}
                </Stack>
              )}
            </Box>
          </Paper>
        ) : (
          /* Standard Format View */
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight={750}>
                Risk Register Register
              </Typography>
              {!readOnly && (
                <Button
                  variant="outlined"
                  startIcon={<Plus size={16} />}
                  onClick={() => addRiskRow('Security')}
                >
                  Add Risk Item
                </Button>
              )}
            </Stack>

            {risks.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">No risks generated. Upload documents to assess.</Typography>
              </Box>
            ) : (
              <Stack spacing={3.5} divider={<Divider />}>
                {risks.map((r, originalIndex) => (
                  <Grid container spacing={2.5} key={r.id}>
                    <Grid item xs={12} md={4}>
                      <Stack spacing={2}>
                        <TextField
                          label="Title"
                          value={r.title}
                          onChange={(e) => handleRiskChange(originalIndex, { title: e.target.value })}
                          fullWidth
                          size="small"
                          disabled={readOnly}
                          sx={{ '& .MuiInputBase-input': { fontWeight: 600 } }}
                        />
                        <TextField
                          label="Description"
                          value={r.description || ''}
                          onChange={(e) => handleRiskChange(originalIndex, { description: e.target.value })}
                          fullWidth
                          size="small"
                          multiline
                          rows={2}
                          disabled={readOnly}
                        />
                      </Stack>
                    </Grid>

                    <Grid item xs={12} md={2}>
                      <Stack spacing={2}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Category</InputLabel>
                          <Select
                            value={r.category || 'Security'}
                            label="Category"
                            onChange={(e) => handleRiskChange(originalIndex, { category: e.target.value })}
                            disabled={readOnly}
                          >
                            {STANDARD_CATEGORIES.map((c) => (
                              <MenuItem key={c} value={c}>{c}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <TextField
                          label="Owner"
                          value={r.owner || ''}
                          onChange={(e) => handleRiskChange(originalIndex, { owner: e.target.value })}
                          fullWidth
                          size="small"
                          disabled={readOnly}
                        />
                      </Stack>
                    </Grid>

                    <Grid item xs={12} md={3}>
                      <Stack spacing={2}>
                        <Stack direction="row" spacing={1}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Likelihood</InputLabel>
                            <Select
                              value={String(r.likelihood ?? 3)}
                              label="Likelihood"
                              onChange={(e) =>
                                handleRiskChange(originalIndex, { likelihood: Number(e.target.value) })
                              }
                              disabled={readOnly}
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <FormControl fullWidth size="small">
                            <InputLabel>Impact</InputLabel>
                            <Select
                              value={String(r.impact ?? 3)}
                              label="Impact"
                              onChange={(e) =>
                                handleRiskChange(originalIndex, { impact: Number(e.target.value) })
                              }
                              disabled={readOnly}
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Stack>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="caption" color="text.secondary">
                            Inherent Rating:
                          </Typography>
                          <RatingPill value={r.inherent_rating} />
                        </Stack>
                      </Stack>
                    </Grid>

                    <Grid item xs={12} md={3}>
                      <Stack spacing={2}>
                        <Stack direction="row" spacing={1}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Res. Likelihood</InputLabel>
                            <Select
                              value={String(r.residual_likelihood ?? 3)}
                              label="Res. Likelihood"
                              onChange={(e) =>
                                handleRiskChange(originalIndex, { residual_likelihood: Number(e.target.value) })
                              }
                              disabled={readOnly}
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <FormControl fullWidth size="small">
                            <InputLabel>Res. Impact</InputLabel>
                            <Select
                              value={String(r.residual_impact ?? 3)}
                              label="Res. Impact"
                              onChange={(e) =>
                                handleRiskChange(originalIndex, { residual_impact: Number(e.target.value) })
                              }
                              disabled={readOnly}
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <MenuItem key={n} value={String(n)}>{n}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Stack>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="caption" color="text.secondary">
                            Residual Rating:
                          </Typography>
                          <RatingPill value={r.residual_rating} />
                        </Stack>
                      </Stack>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Existing Controls"
                        value={r.existing_controls || ''}
                        onChange={(e) => handleRiskChange(originalIndex, { existing_controls: e.target.value })}
                        fullWidth
                        size="small"
                        multiline
                        rows={2}
                        disabled={readOnly}
                      />
                    </Grid>

                    <Grid item xs={12} md={5}>
                      <TextField
                        label="Recommended Mitigation / Actions"
                        value={r.recommended_mitigation || ''}
                        onChange={(e) => handleRiskChange(originalIndex, { recommended_mitigation: e.target.value })}
                        fullWidth
                        size="small"
                        multiline
                        rows={2}
                        disabled={readOnly}
                      />
                    </Grid>

                    <Grid item xs={12} md={1} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Checkbox
                          checked={r.is_completed}
                          onChange={(e) => handleRiskChange(originalIndex, { is_completed: e.target.checked })}
                          disabled={readOnly}
                        />
                        {!readOnly && (
                          <IconButton color="error" size="small" onClick={() => deleteRiskRow(originalIndex)}>
                            <Trash2 size={16} />
                          </IconButton>
                        )}
                      </Stack>
                    </Grid>
                  </Grid>
                ))}
              </Stack>
            )}
          </Paper>
        )}
      </Box>

      {/* AI Assessment Dialog */}
      <Dialog open={aiOpen} onClose={() => setAiOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Sparkles size={22} color="#3538CD" />
          <span>AI-Assisted Project Assessment</span>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3.5} sx={{ mt: 1.5 }}>
            <Alert severity="info">
              Upload project documentation (requirements, scope docs, system designs, change descriptions, etc.)
              and let the AI identify constraints, risks, assumptions, issues, and dependencies.
            </Alert>

            {/* Document Upload Area */}
            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 4.5,
                textAlign: 'center',
                bgcolor: 'action.hover',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: 'primary.main' },
              }}
              component="label"
            >
              <input
                type="file"
                multiple
                accept=".pdf,.txt,.md"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Upload size={36} style={{ margin: '0 auto 12px', opacity: 0.7 }} />
              <Typography variant="body1" fontWeight={600} gutterBottom>
                Upload Project Documents
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Select PDF, TXT, or MD documents up to 5MB each.
              </Typography>
              {files.length > 0 && (
                <Box sx={{ mt: 2, textAlign: 'left', display: 'inline-block' }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Selected Files:
                  </Typography>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {files.map((f, i) => (
                      <li key={i}>
                        <Typography variant="caption">{f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB)</Typography>
                      </li>
                    ))}
                  </ul>
                </Box>
              )}
            </Box>

            <Divider>OR</Divider>

            <TextField
              label="Paste project description, scope, or logs manually"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              fullWidth
              multiline
              rows={4}
              placeholder="Paste text contents here..."
            />

            <FormControl fullWidth>
              <InputLabel id="ai-format-label">Output Format</InputLabel>
              <Select
                labelId="ai-format-label"
                label="Output Format"
                value={assessment.report_format || 'Standard'}
                onChange={(e: SelectChangeEvent) => {
                  patchHeader({ report_format: e.target.value })
                }}
              >
                <MenuItem value="Standard">Standard Matrix</MenuItem>
                <MenuItem value="CRAID">CRAID Log</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setAiOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={runAIAssessment}
            disabled={assessing || (!files.length && !pastedText.trim())}
            startIcon={
              assessing ? <CircularProgress size={16} color="inherit" /> : <Sparkles size={16} />
            }
          >
            {assessing ? 'Assessing...' : 'Run AI Assessment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
