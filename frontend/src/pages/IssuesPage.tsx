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
import type { Issue } from '../types'

const ISSUE_TYPES = ['Business', 'Audit', 'Regulatory', 'External'] as const
const RISK_RATINGS = ['High', 'Medium-High', 'Moderate', 'Medium-Low', 'Low'] as const
const STATUSES = ['Open', 'Validation', 'Accepted', 'Closed'] as const

type IssueType = (typeof ISSUE_TYPES)[number]

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Open: { bg: 'rgba(217,45,32,0.10)', fg: '#D92D20' },
  Validation: { bg: 'rgba(53,56,205,0.10)', fg: '#3538CD' },
  Accepted: { bg: 'rgba(91,97,120,0.12)', fg: '#475467' },
  Closed: { bg: 'rgba(14,147,132,0.12)', fg: '#0E9384' },
}

const RISK_COLORS: Record<string, { bg: string; fg: string }> = {
  High: { bg: 'rgba(217,45,32,0.16)', fg: '#912018' },
  'Medium-High': { bg: 'rgba(239,104,32,0.16)', fg: '#9C2A10' },
  Moderate: { bg: 'rgba(247,144,9,0.16)', fg: '#93370D' },
  'Medium-Low': { bg: 'rgba(14,147,132,0.14)', fg: '#0E7367' },
  Low: { bg: 'rgba(14,147,132,0.18)', fg: '#095C53' },
}

const EMPTY_ISSUE = {
  issue_number: '',
  issue_type: 'Business',
  name: '',
  status: 'Open',
  risk_rating: 'Moderate',
  owner: '',
  identified_date: '',
  target_date: '',
  description: '',
  remediation_plan: '',
}

const cellSx = { p: 1, borderBottom: 'none' }
const inputSx = { fontSize: '0.875rem' }

function ColoredPill({ value, palette }: { value: string; palette: Record<string, { bg: string; fg: string }> }) {
  const c = palette[value] ?? { bg: 'rgba(91,97,120,0.12)', fg: '#475467' }
  return (
    <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 1.5, fontSize: 12, fontWeight: 600, bgcolor: c.bg, color: c.fg }}>
      {value}
    </Box>
  )
}

export default function IssuesPage() {
  const { user } = useAuth()
  const isViewer = user?.role === 'VIEWER'

  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [draft, setDraft] = useState(EMPTY_ISSUE)
  const [saving, setSaving] = useState(false)

  const fetchIssues = async () => {
    setLoading(true)
    try {
      const { data } = await api.get<Issue[]>('/issues/')
      setIssues(data)
    } catch (err) {
      console.error('Failed to fetch issues', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchIssues()
  }, [])

  const handleUpdate = async (id: number, field: keyof Issue, value: string) => {
    const prev = issues.find((i) => i.id === id)
    if (!prev) return
    const next = { ...prev, [field]: value }
    setIssues((list) => list.map((i) => (i.id === id ? next : i)))
    try {
      await api.put(`/issues/${id}`, { [field]: value })
    } catch (err) {
      console.error('Failed to update issue', err)
      setIssues((list) => list.map((i) => (i.id === id ? prev : i)))
    }
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      await api.post('/issues/', draft)
      setCreateOpen(false)
      setDraft(EMPTY_ISSUE)
      await fetchIssues()
    } catch (err) {
      console.error('Failed to create issue', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    try {
      await api.delete(`/issues/${deleteId}`)
      setIssues((list) => list.filter((i) => i.id !== deleteId))
    } catch (err) {
      console.error('Failed to delete issue', err)
    } finally {
      setDeleteId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return issues.filter((i) =>
      [i.issue_number, i.name, i.description, i.risk_rating, i.status, i.owner].some((f) => f?.toLowerCase().includes(q)),
    )
  }, [issues, search])

  const renderRow = (issue: Issue) => (
    <Fragment key={issue.id}>
      <TableRow hover>
        <TableCell sx={cellSx}>
          <DebouncedTextField
            variant="standard"
            InputProps={{ disableUnderline: true, style: inputSx }}
            value={issue.issue_number ?? ''}
            onChange={(e) => handleUpdate(issue.id, 'issue_number', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        <TableCell sx={cellSx}>
          <Select
            variant="standard"
            disableUnderline
            value={issue.issue_type}
            onChange={(e) => handleUpdate(issue.id, 'issue_type', e.target.value)}
            style={inputSx}
            disabled={isViewer}
          >
            {ISSUE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </Select>
        </TableCell>
        <TableCell sx={{ ...cellSx, width: '28%' }}>
          <DebouncedTextField
            fullWidth
            multiline
            variant="standard"
            InputProps={{ disableUnderline: true, style: { ...inputSx, fontWeight: 500 } }}
            value={issue.name}
            onChange={(e) => handleUpdate(issue.id, 'name', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        <TableCell sx={cellSx}>
          <Select
            variant="standard"
            disableUnderline
            value={issue.status}
            onChange={(e) => handleUpdate(issue.id, 'status', e.target.value)}
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
          <Select
            variant="standard"
            disableUnderline
            value={issue.risk_rating}
            onChange={(e) => handleUpdate(issue.id, 'risk_rating', e.target.value)}
            disabled={isViewer}
            renderValue={(v) => <ColoredPill value={v} palette={RISK_COLORS} />}
          >
            {RISK_RATINGS.map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </Select>
        </TableCell>
        <TableCell sx={cellSx}>
          <DebouncedTextField
            variant="standard"
            InputProps={{ disableUnderline: true, style: inputSx }}
            value={issue.owner ?? ''}
            onChange={(e) => handleUpdate(issue.id, 'owner', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        <TableCell sx={cellSx}>
          <TextField
            type="date"
            variant="standard"
            InputProps={{ disableUnderline: true, style: inputSx }}
            value={issue.identified_date ?? ''}
            onChange={(e) => handleUpdate(issue.id, 'identified_date', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        <TableCell sx={cellSx}>
          <TextField
            type="date"
            variant="standard"
            InputProps={{ disableUnderline: true, style: inputSx }}
            value={issue.target_date ?? ''}
            onChange={(e) => handleUpdate(issue.id, 'target_date', e.target.value)}
            disabled={isViewer}
          />
        </TableCell>
        <TableCell align="center" sx={cellSx}>
          {!isViewer && (
            <IconButton size="small" color="error" onClick={() => setDeleteId(issue.id)}>
              <Trash2 size={16} />
            </IconButton>
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={9} sx={{ py: 1, px: 3, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
          <Stack spacing={0.5}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 80, mt: 0.75 }}>
                Description
              </Typography>
              <DebouncedTextField
                fullWidth
                multiline
                placeholder="Issue description…"
                variant="standard"
                InputProps={{ disableUnderline: true, style: { fontSize: '0.875rem', color: '#5B6178' } }}
                value={issue.description ?? ''}
                onChange={(e) => handleUpdate(issue.id, 'description', e.target.value)}
                disabled={isViewer}
              />
            </Stack>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 80, mt: 0.75 }}>
                Remediation
              </Typography>
              <DebouncedTextField
                fullWidth
                multiline
                placeholder="Remediation plan…"
                variant="standard"
                InputProps={{ disableUnderline: true, style: { fontSize: '0.875rem', color: '#5B6178' } }}
                value={issue.remediation_plan ?? ''}
                onChange={(e) => handleUpdate(issue.id, 'remediation_plan', e.target.value)}
                disabled={isViewer}
              />
            </Stack>
          </Stack>
        </TableCell>
      </TableRow>
    </Fragment>
  )

  const grouped = ISSUE_TYPES.map((type) => ({
    type,
    rows: filtered.filter((i) => i.issue_type === type),
  })).filter((g) => g.rows.length > 0)

  const uncategorized = filtered.filter((i) => !ISSUE_TYPES.includes(i.issue_type as IssueType))

  return (
    <Layout title="Issue Tracker">
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" sx={{ mb: 0.5 }}>
              Issue Tracker
            </Typography>
            <Typography color="text.secondary">{issues.length} issues tracked</Typography>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small"
              placeholder="Search issues…"
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
                New Issue
              </Button>
            )}
          </Stack>
        </Stack>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'background.default' }}>
              <TableRow>
                {['Issue No', 'Type', 'Issue Name', 'Status', 'Risk Rating', 'Owner', 'Reported', 'Target', 'Actions'].map((h, idx) => (
                  <TableCell key={h} align={idx === 8 ? 'center' : 'left'} sx={{ fontWeight: 700 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton animation="wave" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No issues yet. {!isViewer && 'Click “New Issue” to add your first one.'}
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                grouped.map((group) => (
                  <Fragment key={group.type}>
                    <TableRow sx={{ bgcolor: 'rgba(53,56,205,0.04)' }}>
                      <TableCell colSpan={9} sx={{ py: 0.75, fontWeight: 700, color: 'primary.dark' }}>
                        {group.type} ({group.rows.length})
                      </TableCell>
                    </TableRow>
                    {group.rows.map(renderRow)}
                  </Fragment>
                ))}

              {!loading && uncategorized.length > 0 && (
                <Fragment>
                  <TableRow sx={{ bgcolor: 'rgba(217,45,32,0.06)' }}>
                    <TableCell colSpan={9} sx={{ py: 0.75, fontWeight: 700, color: 'error.main' }}>
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
        <DialogTitle sx={{ fontWeight: 700 }}>New Issue</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Issue Number" value={draft.issue_number} onChange={(e) => setDraft({ ...draft, issue_number: e.target.value })} fullWidth autoFocus />
            <TextField select label="Type" value={draft.issue_type} onChange={(e) => setDraft({ ...draft, issue_type: e.target.value })} fullWidth>
              {ISSUE_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Issue Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} fullWidth />
            <TextField select label="Status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} fullWidth>
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Risk Rating" value={draft.risk_rating} onChange={(e) => setDraft({ ...draft, risk_rating: e.target.value })} fullWidth>
              {RISK_RATINGS.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Owner" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} fullWidth />
            <TextField label="Reported Date" type="date" InputLabelProps={{ shrink: true }} value={draft.identified_date} onChange={(e) => setDraft({ ...draft, identified_date: e.target.value })} fullWidth />
            <TextField label="Target Date" type="date" InputLabelProps={{ shrink: true }} value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} fullWidth />
            <TextField label="Description" multiline rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} fullWidth />
            <TextField label="Remediation Plan" multiline rows={3} value={draft.remediation_plan} onChange={(e) => setDraft({ ...draft, remediation_plan: e.target.value })} fullWidth />
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
        <DialogTitle>Delete issue?</DialogTitle>
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
