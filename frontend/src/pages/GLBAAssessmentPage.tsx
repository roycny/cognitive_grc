import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import { ArrowLeft, Check, CircleAlert, FileText, ShieldCheck } from 'lucide-react'
import Layout from '../components/Layout'
import DebouncedTextField from '../components/DebouncedTextField'
import { api, glbaReportUrl } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  GLBA_CONTROLS,
  GLBA_DOMAINS,
  MATURITY_OPTIONS,
  RESULT_OPTIONS,
  TEST_METHODS,
  type GlbaControl,
} from '../data/glbaControls'
import type { GlbaAssessmentDetail, GlbaControlResponse } from '../types'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** A rating of Effective requires Inspection; high-risk controls also require Reperformance. */
function scoringWarning(control: GlbaControl, resp: GlbaControlResponse | undefined): string | null {
  if (!resp || resp.result !== 'Effective') return null
  const methods = resp.test_methods ?? []
  const msgs: string[] = []
  if (!methods.includes('Inspection')) msgs.push('Cannot rate Effective without Inspection recorded.')
  if (control.highRisk && !methods.includes('Reperformance'))
    msgs.push('High-risk control also requires Reperformance.')
  return msgs.length ? msgs.join(' ') : null
}

export default function GLBAAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const readOnly = user?.role === 'VIEWER'

  const [assessment, setAssessment] = useState<GlbaAssessmentDetail | null>(null)
  const [responses, setResponses] = useState<Record<string, GlbaControlResponse>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  // Number of saves currently in flight — keeps the indicator accurate when
  // several fields are patched in quick succession.
  const inFlight = useRef(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await api.get<GlbaAssessmentDetail>(`/glba/assessments/${id}`)
        setAssessment(data)
        const map: Record<string, GlbaControlResponse> = {}
        for (const r of data.responses) map[r.control_id] = r
        setResponses(map)
      } catch (err) {
        console.error('Failed to load GLBA assessment', err)
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
      console.error('Autosave failed', err)
      inFlight.current = Math.max(0, inFlight.current - 1)
      setSaveState('error')
    }
  }, [])

  // ---- Header (entity / period / lead / status) ----
  const patchHeader = useCallback(
    (fields: Partial<GlbaAssessmentDetail>) => {
      setAssessment((prev) => (prev ? { ...prev, ...fields } : prev))
      void trackSave(() => api.put(`/glba/assessments/${id}`, fields))
    },
    [id, trackSave],
  )

  // ---- Per-control responses ----
  const patchResponse = useCallback(
    (controlId: string, fields: Partial<GlbaControlResponse>) => {
      setResponses((prev) => ({ ...prev, [controlId]: { ...prev[controlId], ...fields } }))
      void trackSave(() => api.patch(`/glba/assessments/${id}/responses/${controlId}`, fields))
    },
    [id, trackSave],
  )

  const toggleMethod = (controlId: string, method: string) => {
    const current = responses[controlId]?.test_methods ?? []
    const next = current.includes(method) ? current.filter((m) => m !== method) : [...current, method]
    patchResponse(controlId, { test_methods: next })
  }

  const recorded = useMemo(
    () => Object.values(responses).filter((r) => r.result).length,
    [responses],
  )

  if (loading) {
    return (
      <Layout title="GLBA Assessment">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      </Layout>
    )
  }

  if (notFound || !assessment) {
    return (
      <Layout title="GLBA Assessment">
        <Alert severity="error" sx={{ maxWidth: 600 }}>
          Assessment not found.{' '}
          <Button size="small" onClick={() => navigate('/assessments/glba')}>
            Back to assessments
          </Button>
        </Alert>
      </Layout>
    )
  }

  const total = GLBA_CONTROLS.length

  return (
    <Layout title="GLBA Assessment">
      <Box sx={{ maxWidth: 1040, pb: 8 }}>
        {/* Top bar */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Button startIcon={<ArrowLeft size={18} />} onClick={() => navigate('/assessments/glba')} color="inherit">
            All assessments
          </Button>
          <Stack direction="row" alignItems="center" spacing={2}>
            <SaveIndicator state={saveState} />
            <Button
              variant="outlined"
              startIcon={<FileText size={18} />}
              onClick={() => window.open(glbaReportUrl(assessment.id), '_blank', 'noopener')}
            >
              Generate report
            </Button>
          </Stack>
        </Stack>

        {/* Header card */}
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
            <ShieldCheck size={26} color="#3538CD" />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5">GLBA Information Security Program Assessment</Typography>
              <Typography variant="caption" color="text.secondary">
                12 CFR Part 30, Appendix B · Regulation P (12 CFR Part 1016) · GLBA §501(b)
              </Typography>
            </Box>
            <Chip
              label={`${recorded} / ${total} results recorded`}
              size="small"
              sx={{ fontWeight: 600 }}
              color={recorded === total ? 'success' : 'default'}
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <DebouncedTextField
              label="Institution / legal entity"
              value={assessment.entity ?? ''}
              onChange={(e) => patchHeader({ entity: e.target.value })}
              fullWidth
              disabled={readOnly}
            />
            <DebouncedTextField
              label="Assessment period"
              value={assessment.period ?? ''}
              onChange={(e) => patchHeader({ period: e.target.value })}
              fullWidth
              disabled={readOnly}
            />
            <DebouncedTextField
              label="Lead assessor"
              value={assessment.lead ?? ''}
              onChange={(e) => patchHeader({ lead: e.target.value })}
              fullWidth
              disabled={readOnly}
            />
            <FormControl sx={{ minWidth: 180 }}>
              <InputLabel id="status-label">Status</InputLabel>
              <Select
                labelId="status-label"
                label="Status"
                value={assessment.status}
                onChange={(e: SelectChangeEvent) => patchHeader({ status: e.target.value })}
                disabled={readOnly}
              >
                <MenuItem value="In Progress">In Progress</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        {/* Domains & controls */}
        {GLBA_DOMAINS.map((domain) => {
          const controls = GLBA_CONTROLS.filter((c) => c.domain === domain.id)
          return (
            <Box key={domain.id} sx={{ mb: 4 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    bgcolor: 'primary.main',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {domain.id}
                </Box>
                <Typography variant="h6">{domain.title}</Typography>
              </Stack>

              {controls.map((control) => (
                <ControlCard
                  key={control.id}
                  control={control}
                  resp={responses[control.id]}
                  readOnly={readOnly}
                  onText={(field, value) => patchResponse(control.id, { [field]: value })}
                  onSelect={(field, value) => patchResponse(control.id, { [field]: value })}
                  onToggleMethod={(method) => toggleMethod(control.id, method)}
                />
              ))}
            </Box>
          )
        })}
      </Box>
    </Layout>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving')
    return (
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: 'text.secondary' }}>
        <CircularProgress size={14} />
        <Typography variant="caption">Saving…</Typography>
      </Stack>
    )
  if (state === 'saved')
    return (
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'success.main' }}>
        <Check size={15} />
        <Typography variant="caption">All changes saved</Typography>
      </Stack>
    )
  if (state === 'error')
    return (
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'error.main' }}>
        <CircleAlert size={15} />
        <Typography variant="caption">Save failed — retry your last edit</Typography>
      </Stack>
    )
  return null
}

function ControlCard({
  control,
  resp,
  readOnly,
  onText,
  onSelect,
  onToggleMethod,
}: {
  control: GlbaControl
  resp: GlbaControlResponse | undefined
  readOnly: boolean
  onText: (field: keyof GlbaControlResponse, value: string) => void
  onSelect: (field: keyof GlbaControlResponse, value: string) => void
  onToggleMethod: (method: string) => void
}) {
  const methods = resp?.test_methods ?? []
  const warning = scoringWarning(control, resp)

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 2 }}>
      {/* Control header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', letterSpacing: '0.06em' }}>
          {control.id}
        </Typography>
        {control.highRisk && <Chip label="HIGH RISK" size="small" color="error" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />}
      </Stack>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {control.title}
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1.5 }}>
        {[control.citation, control.csf, control.nist, control.frequency].filter(Boolean).map((m) => (
          <Chip key={m} label={m} size="small" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
        ))}
      </Stack>
      <Typography variant="body2" sx={{ mb: 0.5 }}>
        <strong>Objective.</strong> {control.objective}
      </Typography>
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        <strong>Test procedure.</strong> {control.procedure}
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {/* Owner zone */}
        <Box sx={{ flex: 1, bgcolor: 'rgba(74,90,48,0.06)', border: '1px solid', borderColor: 'rgba(74,90,48,0.25)', borderRadius: 2, p: 2 }}>
          <Typography variant="overline" sx={{ color: '#4a5a30', fontWeight: 700 }}>
            Control Owner — self-report
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <DebouncedTextField
              label="Is this control implemented? Describe how."
              value={resp?.owner_desc ?? ''}
              onChange={(e) => onText('owner_desc', e.target.value)}
              multiline
              minRows={3}
              fullWidth
              disabled={readOnly}
            />
            <DebouncedTextField
              label="Evidence available (location / system / owner)"
              value={resp?.owner_evidence ?? ''}
              onChange={(e) => onText('owner_evidence', e.target.value)}
              multiline
              minRows={2}
              fullWidth
              disabled={readOnly}
            />
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Required evidence:
              </Typography>
              <Box component="ul" sx={{ m: 0.5, pl: 2.5, color: 'text.secondary' }}>
                {control.evidence.map((e) => (
                  <li key={e}>
                    <Typography variant="caption">{e}</Typography>
                  </li>
                ))}
              </Box>
            </Box>
            <DebouncedTextField
              label="Owner name & date"
              placeholder="Name — YYYY-MM-DD"
              value={resp?.owner_sign ?? ''}
              onChange={(e) => onText('owner_sign', e.target.value)}
              fullWidth
              disabled={readOnly}
            />
          </Stack>
        </Box>

        {/* Assessor zone */}
        <Box sx={{ flex: 1, bgcolor: 'rgba(58,78,96,0.06)', border: '1px solid', borderColor: 'rgba(58,78,96,0.25)', borderRadius: 2, p: 2 }}>
          <Typography variant="overline" sx={{ color: '#3a4e60', fontWeight: 700 }}>
            Assessor — testing & conclusion
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Test method(s) performed
              </Typography>
              <Stack direction="row" flexWrap="wrap">
                {TEST_METHODS.map((method) => (
                  <FormControlLabel
                    key={method}
                    control={
                      <Checkbox
                        size="small"
                        checked={methods.includes(method)}
                        onChange={() => onToggleMethod(method)}
                        disabled={readOnly}
                      />
                    }
                    label={<Typography variant="caption">{method}</Typography>}
                  />
                ))}
              </Stack>
            </Box>
            <Stack direction="row" spacing={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel id={`result-${control.id}`}>Result</InputLabel>
                <Select
                  labelId={`result-${control.id}`}
                  label="Result"
                  value={resp?.result ?? ''}
                  onChange={(e: SelectChangeEvent) => onSelect('result', e.target.value)}
                  disabled={readOnly}
                >
                  <MenuItem value="">
                    <em>— select —</em>
                  </MenuItem>
                  {RESULT_OPTIONS.map((r) => (
                    <MenuItem key={r} value={r}>
                      {r}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel id={`maturity-${control.id}`}>Maturity tier</InputLabel>
                <Select
                  labelId={`maturity-${control.id}`}
                  label="Maturity tier"
                  value={resp?.maturity ?? ''}
                  onChange={(e: SelectChangeEvent) => onSelect('maturity', e.target.value)}
                  disabled={readOnly}
                >
                  <MenuItem value="">
                    <em>— n/a —</em>
                  </MenuItem>
                  {MATURITY_OPTIONS.map((m) => (
                    <MenuItem key={m} value={m}>
                      {m}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Scoring rule: {control.scoring}
            </Typography>
            {warning && (
              <Alert severity="warning" sx={{ py: 0, fontSize: 12 }}>
                {warning}
              </Alert>
            )}
            <DebouncedTextField
              label="Assessor notes / exceptions / sampling rationale"
              value={resp?.assessor_notes ?? ''}
              onChange={(e) => onText('assessor_notes', e.target.value)}
              multiline
              minRows={3}
              fullWidth
              disabled={readOnly}
            />
            <DebouncedTextField
              label="Assessor name & date"
              placeholder="Name — YYYY-MM-DD"
              value={resp?.assessor_sign ?? ''}
              onChange={(e) => onText('assessor_sign', e.target.value)}
              fullWidth
              disabled={readOnly}
            />
          </Stack>
        </Box>
      </Stack>
    </Paper>
  )
}
