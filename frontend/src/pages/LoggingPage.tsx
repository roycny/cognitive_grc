import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Download, Filter, RefreshCw, Search } from 'lucide-react'
import Layout from '../components/Layout'
import { useAuth } from '../auth/AuthContext'
import { exportAuditLogsCsv, fetchAuditLogs } from '../api/auditLogs'
import type { AuditLogEntry, AuditLogFilters } from '../api/auditLogs'

const ACTION_OPTIONS = [
  'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_CHANGE',
  'CREATE_USER', 'UPDATE_USER', 'DELETE_USER',
  'CREATE_AUDIT', 'UPDATE_AUDIT', 'DELETE_AUDIT',
  'CREATE_ISSUE', 'UPDATE_ISSUE', 'DELETE_ISSUE',
]

const ACTION_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default' | 'primary' | 'secondary'> = {
  LOGIN_SUCCESS: 'success',
  LOGIN_FAILURE: 'error',
  LOGOUT: 'default',
  PASSWORD_CHANGE: 'warning',
  CREATE_USER: 'secondary',
  UPDATE_USER: 'primary',
  DELETE_USER: 'error',
  CREATE_AUDIT: 'info',
  UPDATE_AUDIT: 'primary',
  DELETE_AUDIT: 'error',
  CREATE_ISSUE: 'info',
  UPDATE_ISSUE: 'primary',
  DELETE_ISSUE: 'error',
}

function AccessDenied() {
  return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        Access Denied
      </Typography>
      <Typography color="text.secondary">You do not have permission to view audit logs.</Typography>
    </Box>
  )
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

export default function LoggingPage() {
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'ADMIN'

  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [resourceTypeFilter, setResourceTypeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const buildFilters = useCallback(
    (withPaging: boolean): AuditLogFilters => {
      const f: AuditLogFilters = {}
      if (withPaging) {
        f.skip = page * rowsPerPage
        f.limit = rowsPerPage
      }
      if (search) f.search = search
      if (actionFilter) f.action = actionFilter
      if (resourceTypeFilter) f.resource_type = resourceTypeFilter
      if (startDate) f.start_date = new Date(startDate).toISOString()
      if (endDate) f.end_date = new Date(`${endDate}T23:59:59`).toISOString()
      return f
    },
    [page, rowsPerPage, search, actionFilter, resourceTypeFilter, startDate, endDate],
  )

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchAuditLogs(buildFilters(true))
      setLogs(result.items)
      setTotal(result.total)
    } catch (err) {
      console.error('Failed to fetch audit logs', err)
    } finally {
      setLoading(false)
    }
  }, [buildFilters])

  useEffect(() => {
    if (isAdmin) void loadLogs()
  }, [isAdmin, loadLogs])

  const handleExport = async () => {
    try {
      await exportAuditLogsCsv(buildFilters(false))
    } catch (err) {
      console.error('Failed to export audit logs', err)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setActionFilter('')
    setResourceTypeFilter('')
    setStartDate('')
    setEndDate('')
    setPage(0)
  }

  if (!isAdmin) {
    return (
      <Layout title="Logging">
        <AccessDenied />
      </Layout>
    )
  }

  return (
    <Layout title="Logging">
      <Stack spacing={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h4" sx={{ mb: 0.5 }}>
              Audit Log
            </Typography>
            <Typography color="text.secondary">Track user activity, data changes, and privileged actions.</Typography>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button variant="outlined" color="inherit" startIcon={<RefreshCw size={16} />} onClick={loadLogs} disabled={loading}>
              Refresh
            </Button>
            <Button
              variant="outlined"
              color={showFilters ? 'primary' : 'inherit'}
              startIcon={<Filter size={16} />}
              onClick={() => setShowFilters((s) => !s)}
            >
              Filters
            </Button>
            <Button variant="contained" startIcon={<Download size={16} />} onClick={handleExport}>
              Export CSV
            </Button>
          </Stack>
        </Stack>

        <Stack spacing={2}>
          <TextField
            placeholder="Search by username, action, or detail…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            }}
            sx={{ bgcolor: 'background.paper' }}
          />
          {showFilters && (
            <Stack
              direction="row"
              spacing={2}
              flexWrap="wrap"
              useFlexGap
              alignItems="flex-end"
              sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}
            >
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Action</InputLabel>
                <Select
                  value={actionFilter}
                  label="Action"
                  onChange={(e) => {
                    setActionFilter(e.target.value)
                    setPage(0)
                  }}
                >
                  <MenuItem value="">
                    <em>All</em>
                  </MenuItem>
                  {ACTION_OPTIONS.map((a) => (
                    <MenuItem key={a} value={a}>
                      {a.replace(/_/g, ' ')}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Resource Type"
                value={resourceTypeFilter}
                onChange={(e) => {
                  setResourceTypeFilter(e.target.value)
                  setPage(0)
                }}
                size="small"
                placeholder="e.g. Audit, Issue, User"
                sx={{ minWidth: 160 }}
              />
              <TextField
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPage(0)
                }}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150 }}
              />
              <TextField
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPage(0)
                }}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150 }}
              />
              <Button size="small" onClick={clearFilters}>
                Clear All
              </Button>
            </Stack>
          )}
        </Stack>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'background.default' }}>
              <TableRow>
                {['Timestamp', 'Username', 'Action', 'Resource', 'Detail', 'IP Address'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No audit log entries found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>{formatTimestamp(log.timestamp)}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{log.username}</TableCell>
                    <TableCell>
                      <Chip label={log.action.replace(/_/g, ' ')} size="small" variant="outlined" color={ACTION_COLORS[log.action] || 'default'} />
                    </TableCell>
                    <TableCell>
                      {log.resource_type && (
                        <Typography variant="body2" component="span">
                          {log.resource_type}
                          {log.resource_id && (
                            <Typography variant="body2" component="span" color="text.secondary">
                              {' '}
                              #{log.resource_id}
                            </Typography>
                          )}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" color="text.secondary">
                        {log.detail || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {log.ip_address || '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10))
              setPage(0)
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </TableContainer>
      </Stack>
    </Layout>
  )
}
