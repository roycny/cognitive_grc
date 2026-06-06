import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
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
import { Plus, Search, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import DebouncedTextField from '../components/DebouncedTextField'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { Audit } from '../types'

const AUDIT_TYPES = ['Internal', 'External', 'Regulatory'] as const
const STATUSES = ['Planning', 'Scheduled', 'Fieldwork', 'Reporting', 'Remediation', 'Completed', 'Cancelled'] as const

type Status = (typeof STATUSES)[number]

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  Internal: { bg: 'rgba(53,56,205,0.10)', fg: '#3538CD' },
  External: { bg: 'rgba(124,58,237,0.12)', fg: '#6D28D9' },
  Regulatory: { bg: 'rgba(91,97,120,0.14)', fg: '#475467' },
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Planning: { bg: 'rgba(91,97,120,0.12)', fg: '#475467' },
  Scheduled: { bg: 'rgba(53,56,205,0.10)', fg: '#3538CD' },
  Fieldwork: { bg: 'rgba(247,144,9,0.14)', fg: '#B54708' },
  Reporting: { bg: 'rgba(99,102,241,0.14)', fg: '#4338CA' },
  Remediation: { bg: 'rgba(217,45,32,0.10)', fg: '#D92D20' },
  Completed: { bg: 'rgba(14,147,132,0.12)', fg: '#0E9384' },
  Cancelled: { bg: 'rgba(91,97,120,0.10)', fg: '#667085' },
}

const EMPTY_AUDIT = {
  audit_code: '',
  title: '',
  audit_type: 'Internal',
  start_date: '',
  end_date: '',
  status: 'Planning',
  auditor_concerns: '',
}

const cellSx = { p: 1, borderBottom: 'none' }
const inputSx = { fontSize: '0.875rem' }

function ColoredPill({ value, palette }: { value: string; palette: Record<string, { bg: string; fg: string }> }) {
  const c = palette[value] ?? { bg: 'rgba(91,97,120,0.12)', fg: '#475467' }
  return (
    <Box
      component="span"
      sx={{ px: 1, py: 0.25, borderRadius: 1.5, fontSize: 12, fontWeight: 600, bgcolor: c.bg, color: c.fg }}
    >
      {value}
    </Box>
  )
}

export default function AuditsPage() {
  const { user } = useAuth()
  const isViewer = user?.role === 'VIEWER'

  const [audits, setAudits] = useState<Audit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [draft, setDraft] = useState(EMPTY_AUDIT)
  const [saving, setSaving] = useState(false)

  const fetchAudits = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<Audit[]>('/audits/')
      setAudits(data)
    } catch (err) {
      console.error('Failed to fetch audits', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchAudits()
  }, [])

  const handleUpdate = async (id: number, field: keyof Audit, value: string | number) => {
    const prev = audits.find((a) => a.id === id)
    if (!prev) return
    const next = { ...prev, [field]: value }
    setAudits((list) => list.map((a) => (a.id === id ? next : a)))
    try {
      await api.put(`/audits/${id}`, { [field]: value })
    } catch (err) {
      console.error('Failed to update audit', err)
      setAudits((list) => list.map((a) => (a.id === id ? prev : a)))
    }
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      await api.post('/audits/', draft)
      setCreateOpen(false)
      setDraft(EMPTY_AUDIT)
      await fetchAudits()
    } catch (err) {
      console.error('Failed to create audit', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    try {
      await api.delete(`/audits/${deleteId}`)
      setAudits((list) => list.filter((a) => a.id !== deleteId))
    } catch (err) {
      console.error('Failed to delete audit', err)
    } finally {
      setDeleteId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return audits.filter((a) =>
      [a.title, a.audit_code, a.audit_type, a.status].some((f) => f?.toLowerCase().includes(q)),
    )
  }, [audits, search])

  const numberCols: { label: string; field: keyof Audit }[] = [
    { label: 'Req Total', field: 'requests_total' },
    { label: 'Req Open', field: 'requests_open' },
    { label: 'Walkth.', field: 'walkthroughs' },
    { label: 'Findings', field: 'total_findings' },
    { label: 'Open', field: 'open_findings' },
    { label: 'Past Due', field: 'past_due' },
  ]

  const renderRow = (audit: Audit) => (
    <Fragment key={audit.id}>
      <TableRow hover>
        <TableCell sx={{ ...cellSx, minWidth: 110 }}>
          <DebouncedTextField
            variant="standard"
            InputProps={{ disableUnderline: true, style: inputSx }}
            value={audit.audit_code ?? ''}
            onChange={(e) => handleUpdate(audit.id, 'audit_code', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        <TableCell sx={cellSx}>
          <Select
            variant="standard"
            disableUnderline
            value={audit.audit_type}
            onChange={(e) => handleUpdate(audit.id, 'audit_type', e.target.value)}
            disabled={isViewer}
            renderValue={(v) => <ColoredPill value={v} palette={TYPE_COLORS} />}
          >
            {AUDIT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </Select>
        </TableCell>
        <TableCell sx={{ ...cellSx, width: '24%' }}>
          <DebouncedTextField
            fullWidth
            multiline
            variant="standard"
            InputProps={{ disableUnderline: true, style: { ...inputSx, fontWeight: 500 } }}
            value={audit.title}
            onChange={(e) => handleUpdate(audit.id, 'title', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        <TableCell sx={cellSx}>
          <Select
            variant="standard"
            disableUnderline
            value={audit.status}
            onChange={(e) => handleUpdate(audit.id, 'status', e.target.value)}
            disabled={isViewer}
            renderValue={(v) => <ColoredPill value={v} palette={STATUS_COLORS} />}
          >
            {STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </TableCell>
        <TableCell sx={cellSx}>
          <TextField
            type="date"
            variant="standard"
            InputProps={{ disableUnderline: true, style: inputSx }}
            value={audit.start_date ?? ''}
            onChange={(e) => handleUpdate(audit.id, 'start_date', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        <TableCell sx={cellSx}>
          <TextField
            type="date"
            variant="standard"
            InputProps={{ disableUnderline: true, style: inputSx }}
            value={audit.end_date ?? ''}
            onChange={(e) => handleUpdate(audit.id, 'end_date', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        {numberCols.map((col) => (
          <TableCell key={col.field} align="center" sx={cellSx}>
            <TextField
              type="number"
              variant="standard"
              InputProps={{ disableUnderline: true, style: inputSx }}
              inputProps={{ style: { textAlign: 'center' } }}
              value={audit[col.field] as number}
              onChange={(e) => handleUpdate(audit.id, col.field, parseInt(e.target.value) || 0)}
              sx={{ width: 44 }}
              disabled={isViewer}
            />
          </TableCell>
        ))}
        <TableCell align="center" sx={cellSx}>
          {!isViewer && (
            <IconButton size="small" color="error" onClick={() => setDeleteId(audit.id)}>
              <Trash2 size={16} />
            </IconButton>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={13} sx={{ py: 1, px: 3, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 70, mt: 0.75 }}>
              Concerns
            </Typography>
            <DebouncedTextField
              fullWidth
              multiline
              placeholder="Auditor concerns…"
              variant="standard"
              InputProps={{ disableUnderline: true, style: { fontSize: '0.875rem', color: '#5B6178' } }}
              value={audit.auditor_concerns ?? ''}
              onChange={(e) => handleUpdate(audit.id, 'auditor_concerns', e.target.value)}
              disabled={isViewer}
            />
          </Stack>
        </TableCell>
      </TableRow>
    </Fragment>
  )

  const grouped = STATUSES.map((status) => ({
    status,
    rows: filtered.filter((a) => a.status === status),
  })).filter((g) => g.rows.length > 0)

  const uncategorized = filtered.filter((a) => !STATUSES.includes(a.status as Status))

  return (
    <Layout title="Audit & Exam">
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" sx={{ mb: 0.5 }}>
              Audit & Exam Registry
            </Typography>
            <Typography color="text.secondary">{audits.length} engagements tracked</Typography>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small"
              placeholder="Search audits…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 240, bgcolor: 'background.paper' }}
            />
            {!isViewer && (
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                New Audit
              </Button>
            )}
          </Stack>
        </Stack>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'background.default' }}>
              <TableRow>
                {['ID', 'Scope', 'Title', 'Status', 'Start', 'End'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700 }}>
                    {h}
                  </TableCell>
                ))}
                {numberCols.map((c) => (
                  <TableCell key={c.label} align="center" sx={{ fontWeight: 700 }}>
                    {c.label}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 700 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 13 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton animation="wave" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No audits yet. {!isViewer && 'Click “New Audit” to add your first engagement.'}
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                grouped.map((group) => (
                  <Fragment key={group.status}>
                    <TableRow sx={{ bgcolor: 'rgba(53,56,205,0.04)' }}>
                      <TableCell colSpan={13} sx={{ py: 0.75, fontWeight: 700, color: 'primary.dark' }}>
                        {group.status} ({group.rows.length})
                      </TableCell>
                    </TableRow>
                    {group.rows.map(renderRow)}
                  </Fragment>
                ))}

              {!loading && uncategorized.length > 0 && (
                <Fragment>
                  <TableRow sx={{ bgcolor: 'rgba(217,45,32,0.06)' }}>
                    <TableCell colSpan={13} sx={{ py: 0.75, fontWeight: 700, color: 'error.main' }}>
                      Uncategorized ({uncategorized.length})
                    </TableCell>
                  </TableRow>
                  {uncategorized.map(renderRow)}
                </Fragment>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>New Audit Engagement</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Audit ID" value={draft.audit_code} onChange={(e) => setDraft({ ...draft, audit_code: e.target.value })} fullWidth autoFocus />
            <TextField label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} fullWidth />
            <TextField select label="Type" value={draft.audit_type} onChange={(e) => setDraft({ ...draft, audit_type: e.target.value })} fullWidth>
              {AUDIT_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Start Date" type="date" InputLabelProps={{ shrink: true }} value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} fullWidth />
            <TextField label="End Date" type="date" InputLabelProps={{ shrink: true }} value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} fullWidth />
            <TextField select label="Status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} fullWidth>
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !draft.title.trim()} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete audit?</DialogTitle>
        <DialogContent>
          <DialogContentText>This action cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
