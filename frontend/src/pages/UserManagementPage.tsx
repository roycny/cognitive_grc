import { useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import Layout from '../components/Layout'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { User, UserRole } from '../types'

const ROLES: UserRole[] = ['ADMIN', 'EDITOR', 'AUDITOR', 'VIEWER']

const ROLE_COLORS: Record<UserRole, 'primary' | 'secondary' | 'warning' | 'default'> = {
  ADMIN: 'primary',
  EDITOR: 'secondary',
  AUDITOR: 'warning',
  VIEWER: 'default',
}

const EMPTY_FORM = { username: '', email: '', password: '', role: 'VIEWER' as UserRole, is_active: true }

function AccessDenied() {
  return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        Access Denied
      </Typography>
      <Typography color="text.secondary">You do not have permission to view this page.</Typography>
    </Box>
  )
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'ADMIN'

  const [users, setUsers] = useState<User[]>([])
  const [open, setOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async () => {
    try {
      const { data } = await api.get<User[]>('/users/')
      setUsers(data)
    } catch (err) {
      console.error('Failed to fetch users', err)
    }
  }

  useEffect(() => {
    if (isAdmin) void fetchUsers()
  }, [isAdmin])

  const openCreate = () => {
    setEditMode(false)
    setError(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  const openEdit = (u: User) => {
    setEditMode(true)
    setSelectedId(u.id)
    setError(null)
    setForm({ username: u.username, email: u.email, password: '', role: u.role, is_active: u.is_active })
    setOpen(true)
  }

  const handleSave = async () => {
    setError(null)
    try {
      if (editMode && selectedId) {
        await api.put(`/users/${selectedId}`, { email: form.email, role: form.role, is_active: form.is_active })
      } else {
        await api.post('/users/', { username: form.username, email: form.email, password: form.password, role: form.role })
      }
      setOpen(false)
      await fetchUsers()
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      if (Array.isArray(detail)) setError(detail.map((d) => (d as { msg: string }).msg).join(' '))
      else if (typeof detail === 'string') setError(detail)
      else setError('Failed to save user. Ensure username/email are unique and valid.')
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    try {
      await api.delete(`/users/${deleteId}`)
      await fetchUsers()
    } catch (err) {
      console.error('Failed to delete user', err)
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <Layout title="User Management">
      {!isAdmin ? (
        <AccessDenied />
      ) : (
        <Stack spacing={3}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h4" sx={{ mb: 0.5 }}>
                User Management
              </Typography>
              <Typography color="text.secondary">Manage users, roles, and permissions.</Typography>
            </Box>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={openCreate}>
              Add User
            </Button>
          </Stack>

          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
            <Table>
              <TableHead sx={{ bgcolor: 'background.default' }}>
                <TableRow>
                  {['User', 'Email', 'Role', 'Status'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700 }}>
                      {h}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(53,56,205,0.10)', color: 'primary.main' }}>
                          <UserRound size={16} />
                        </Avatar>
                        <Typography sx={{ fontWeight: 600 }}>{u.username}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Chip label={u.role} size="small" variant="outlined" color={ROLE_COLORS[u.role]} />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={u.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          fontWeight: 600,
                          bgcolor: u.is_active ? 'rgba(14,147,132,0.12)' : 'rgba(217,45,32,0.10)',
                          color: u.is_active ? 'secondary.main' : 'error.main',
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="primary" onClick={() => openEdit(u)}>
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteId(u.id)} disabled={u.id === currentUser?.id}>
                        <Trash2 size={16} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editMode ? 'Edit User' : 'Add New User'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} fullWidth disabled={editMode} />
            <TextField label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} fullWidth />
            {!editMode && (
              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                fullWidth
                helperText="Min 8 characters, with uppercase, lowercase, and a number."
              />
            )}
            <TextField select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} fullWidth>
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {r}
                </MenuItem>
              ))}
            </TextField>
            {editMode && (
              <FormControlLabel
                control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
                label="Active"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete user?</DialogTitle>
        <DialogContent>This action cannot be undone.</DialogContent>
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
