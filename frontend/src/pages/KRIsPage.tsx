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
import { Plus, Search, Trash2, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import Layout from '../components/Layout'
import DebouncedTextField from '../components/DebouncedTextField'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { KRI } from '../types'

const CATEGORIES = [
  'Cybersecurity',
  'Access Management',
  'Availability & Resilience',
  'Third-Party Risk',
  'Change Management',
  'Data Protection',
] as const
const STATUSES = ['Green', 'Amber', 'Red'] as const
const TRENDS = ['Improving', 'Stable', 'Worsening'] as const
const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly'] as const

type Category = (typeof CATEGORIES)[number]

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Green: { bg: 'rgba(14,147,132,0.14)', fg: '#0E7367' },
  Amber: { bg: 'rgba(247,144,9,0.16)', fg: '#93370D' },
  Red: { bg: 'rgba(217,45,32,0.16)', fg: '#912018' },
}

const cellSx = { p: 1, borderBottom: 'none' }
const inputSx = { fontSize: '0.875rem' }

function StatusPill({ value }: { value: string }) {
  const c = STATUS_COLORS[value] ?? { bg: 'rgba(91,97,120,0.12)', fg: '#475467' }
  return (
    <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 1.5, fontSize: 12, fontWeight: 600, bgcolor: c.bg, color: c.fg }}>
      {value}
    </Box>
  )
}

function TrendIcon({ value }: { value?: string }) {
  if (value === 'Improving') return <TrendingDown size={15} color="#0E7367" />
  if (value === 'Worsening') return <TrendingUp size={15} color="#912018" />
  return <Minus size={15} color="#667085" />
}

const EMPTY_KRI = {
  kri_code: '',
  name: '',
  category: 'Cybersecurity',
  owner: '',
  frequency: 'Monthly',
  current_value: '',
  threshold: '',
  status: 'Green',
  trend: 'Stable',
  measurement_date: '',
  description: '',
}

export default function KRIsPage() {
  const { user } = useAuth()
  const isViewer = user?.role === 'VIEWER'

  const [kris, setKris] = useState<KRI[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [draft, setDraft] = useState(EMPTY_KRI)
  const [saving, setSaving] = useState(false)

  const fetchKris = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<KRI[]>('/kris/')
      setKris(data)
    } catch (err) {
      console.error('Failed to fetch KRIs', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchKris()
  }, [])

  const handleUpdate = async (id: number, field: keyof KRI, value: string) => {
    const prev = kris.find((k) => k.id === id)
    if (!prev) return
    const next = { ...prev, [field]: value }
    setKris((list) => list.map((k) => (k.id === id ? next : k)))
    try {
      await api.put(`/kris/${id}`, { [field]: value })
    } catch (err) {
      console.error('Failed to update KRI', err)
      setKris((list) => list.map((k) => (k.id === id ? prev : k)))
    }
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      await api.post('/kris/', draft)
      setCreateOpen(false)
      setDraft(EMPTY_KRI)
      await fetchKris()
    } catch (err) {
      console.error('Failed to create KRI', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    try {
      await api.delete(`/kris/${deleteId}`)
      setKris((list) => list.filter((k) => k.id !== deleteId))
    } catch (err) {
      console.error('Failed to delete KRI', err)
    } finally {
      setDeleteId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return kris.filter((k) =>
      [k.kri_code, k.name, k.category, k.owner, k.status, k.description].some((f) => f?.toLowerCase().includes(q)),
    )
  }, [kris, search])

  const breaches = kris.filter((k) => k.status === 'Red').length
  const warnings = kris.filter((k) => k.status === 'Amber').length

  const renderRow = (kri: KRI) => (
    <TableRow hover key={kri.id}>
      <TableCell sx={cellSx}>
        <DebouncedTextField
          variant="standard"
          InputProps={{ disableUnderline: true, style: inputSx }}
          value={kri.kri_code ?? ''}
          onChange={(e) => handleUpdate(kri.id, 'kri_code', e.target.value)}
          disabled={isViewer}
        />
      </TableCell>
      <TableCell sx={{ ...cellSx, width: '26%' }}>
        <DebouncedTextField
          fullWidth
          multiline
          variant="standard"
          InputProps={{ disableUnderline: true, style: { ...inputSx, fontWeight: 500 } }}
          value={kri.name}
          onChange={(e) => handleUpdate(kri.id, 'name', e.target.value)}
          disabled={isViewer}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <DebouncedTextField
          variant="standard"
          InputProps={{ disableUnderline: true, style: inputSx }}
          value={kri.owner ?? ''}
          onChange={(e) => handleUpdate(kri.id, 'owner', e.target.value)}
          disabled={isViewer}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <DebouncedTextField
          variant="standard"
          InputProps={{ disableUnderline: true, style: { ...inputSx, fontWeight: 600 } }}
          value={kri.current_value ?? ''}
          onChange={(e) => handleUpdate(kri.id, 'current_value', e.target.value)}
          disabled={isViewer}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <DebouncedTextField
          variant="standard"
          InputProps={{ disableUnderline: true, style: inputSx }}
          value={kri.threshold ?? ''}
          onChange={(e) => handleUpdate(kri.id, 'threshold', e.target.value)}
          disabled={isViewer}
        />
      </TableCell>
      <TableCell sx={cellSx}>
        <Select
          variant="standard"
          disableUnderline
          value={kri.status}
          onChange={(e) => handleUpdate(kri.id, 'status', e.target.value)}
          disabled={isViewer}
          renderValue={(v) => <StatusPill value={v} />}
        >
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
      <TableCell sx={cellSx}>
        <Select
          variant="standard"
          disableUnderline
          value={kri.trend ?? 'Stable'}
          onChange={(e) => handleUpdate(kri.id, 'trend', e.target.value)}
          disabled={isViewer}
          renderValue={(v) => (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <TrendIcon value={v} />
              <span style={{ fontSize: 13 }}>{v}</span>
            </Stack>
          )}
        >
          {TRENDS.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
      <TableCell sx={cellSx}>
        <Select
          variant="standard"
          disableUnderline
          value={kri.frequency}
          onChange={(e) => handleUpdate(kri.id, 'frequency', e.target.value)}
          style={inputSx}
          disabled={isViewer}
        >
          {FREQUENCIES.map((f) => (
            <MenuItem key={f} value={f}>
              {f}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
      <TableCell sx={cellSx}>
        <TextField
          type="date"
          variant="standard"
          InputProps={{ disableUnderline: true, style: inputSx }}
          value={kri.measurement_date ?? ''}
          onChange={(e) => handleUpdate(kri.id, 'measurement_date', e.target.value)}
          disabled={isViewer}
        />
      </TableCell>
      <TableCell align="center" sx={cellSx}>
        {!isViewer && (
          <IconButton size="small" color="error" onClick={() => setDeleteId(kri.id)}>
            <Trash2 size={16} />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  )

  const grouped = CATEGORIES.map((category) => ({
    category,
    rows: filtered.filter((k) => k.category === category),
  })).filter((g) => g.rows.length > 0)

  const uncategorized = filtered.filter((k) => !CATEGORIES.includes(k.category as Category))

  const headers = ['KRI', 'Indicator', 'Owner', 'Current', 'Appetite', 'Status', 'Trend', 'Freq', 'As of', 'Actions']

  return (
    <Layout title="KRI Tracker">
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" sx={{ mb: 0.5 }}>
              KRI Tracker
            </Typography>
            <Typography color="text.secondary">
              {kris.length} indicators tracked · <span style={{ color: '#912018', fontWeight: 600 }}>{breaches} breached</span> ·{' '}
              <span style={{ color: '#93370D', fontWeight: 600 }}>{warnings} warning</span>
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small"
              placeholder="Search KRIs…"
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
                New KRI
              </Button>
            )}
          </Stack>
        </Stack>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'background.default' }}>
              <TableRow>
                {headers.map((h, idx) => (
                  <TableCell key={h} align={idx === headers.length - 1 ? 'center' : 'left'} sx={{ fontWeight: 700 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: headers.length }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton animation="wave" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={headers.length} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No KRIs yet. {!isViewer && 'Click “New KRI” to add your first one.'}
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                grouped.map((group) => (
                  <Fragment key={group.category}>
                    <TableRow sx={{ bgcolor: 'rgba(53,56,205,0.04)' }}>
                      <TableCell colSpan={headers.length} sx={{ py: 0.75, fontWeight: 700, color: 'primary.dark' }}>
                        {group.category} ({group.rows.length})
                      </TableCell>
                    </TableRow>
                    {group.rows.map(renderRow)}
                  </Fragment>
                ))}

              {!loading && uncategorized.length > 0 && (
                <Fragment>
                  <TableRow sx={{ bgcolor: 'rgba(217,45,32,0.06)' }}>
                    <TableCell colSpan={headers.length} sx={{ py: 0.75, fontWeight: 700, color: 'error.main' }}>
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
        <DialogTitle sx={{ fontWeight: 700 }}>New KRI</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="KRI Code" value={draft.kri_code} onChange={(e) => setDraft({ ...draft, kri_code: e.target.value })} fullWidth autoFocus />
            <TextField label="Indicator name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} fullWidth />
            <TextField select label="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} fullWidth>
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Owner" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} fullWidth />
            <Stack direction="row" spacing={2}>
              <TextField label="Current value" value={draft.current_value} onChange={(e) => setDraft({ ...draft, current_value: e.target.value })} fullWidth />
              <TextField label="Risk appetite / threshold" value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField select label="Status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} fullWidth>
                {STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Trend" value={draft.trend} onChange={(e) => setDraft({ ...draft, trend: e.target.value })} fullWidth>
                {TRENDS.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField select label="Frequency" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })} fullWidth>
                {FREQUENCIES.map((f) => (
                  <MenuItem key={f} value={f}>
                    {f}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Measurement date" type="date" InputLabelProps={{ shrink: true }} value={draft.measurement_date} onChange={(e) => setDraft({ ...draft, measurement_date: e.target.value })} fullWidth />
            </Stack>
            <TextField label="Description" multiline rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !draft.name.trim()} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete KRI?</DialogTitle>
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
