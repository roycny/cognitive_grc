import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  BrainCircuit,
  ClipboardCheck,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

// Convenience for first-run: the default admin seeded by create_initial_user.py.
const DEMO_USERNAME = 'admin'
const DEMO_PASSWORD = 'Admin@12345'

const HIGHLIGHTS = [
  { icon: ShieldCheck, title: 'Enterprise-grade security', text: 'httpOnly sessions, rotating tokens, full audit trail.' },
  { icon: Sparkles, title: 'AI-driven insights', text: 'Surface risks and recommendations automatically.' },
  { icon: ClipboardCheck, title: 'Unified GRC workflows', text: 'Audits, issues, and assessments in one place.' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()

  const [username, setUsername] = useState(DEMO_USERNAME)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fillDemo = () => {
    setUsername(DEMO_USERNAME)
    setPassword(DEMO_PASSWORD)
  }

  // Already authenticated → straight to the dashboard.
  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail
        setError(typeof detail === 'string' ? detail : 'Invalid username or password.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      {/* Brand / value panel (hidden on small screens) */}
      <Box
        sx={{
          flex: 1.1,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          color: 'common.white',
          background: 'linear-gradient(150deg, #252794 0%, #3538CD 45%, #4F46E5 100%)',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <BrainCircuit size={28} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Cognitive&nbsp;GRC
          </Typography>
        </Stack>

        <Box sx={{ maxWidth: 460 }}>
          <Typography variant="h4" sx={{ mb: 2 }}>
            AI-driven Governance, Risk &amp; Compliance
          </Typography>
          <Typography sx={{ opacity: 0.85, mb: 5 }}>
            Centralize audits, issues, and assessments — augmented by AI to help your team
            move faster with confidence.
          </Typography>

          <Stack spacing={2.5}>
            {HIGHLIGHTS.map((h) => (
              <Stack key={h.title} direction="row" spacing={2} alignItems="flex-start">
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(255,255,255,0.14)',
                    flexShrink: 0,
                  }}
                >
                  <h.icon size={20} />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>{h.title}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    {h.text}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          © {new Date().getFullYear()} Cognitive GRC. All rights reserved.
        </Typography>
      </Box>

      {/* Login form panel */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 6 },
          bgcolor: 'background.default',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 420,
            p: { xs: 3, sm: 4.5 },
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          {/* Compact brand for small screens */}
          <Stack
            direction="row"
            spacing={1.25}
            alignItems="center"
            sx={{ mb: 3, display: { xs: 'flex', md: 'none' } }}
          >
            <BrainCircuit size={24} color="#3538CD" />
            <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
              Cognitive&nbsp;GRC
            </Typography>
          </Stack>

          <Typography variant="h5" sx={{ mb: 0.5 }}>
            Welcome back
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in to your GRC workspace.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.25}>
              <TextField
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                fullWidth
                required
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <UserIcon size={18} />
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                fullWidth
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock size={18} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={submitting || !username || !password}
                startIcon={
                  submitting ? <CircularProgress size={18} color="inherit" /> : <LogIn size={18} />
                }
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </Stack>
          </Box>

          <Alert
            icon={<ShieldCheck size={18} />}
            severity="info"
            sx={{ mt: 3, alignItems: 'center' }}
          >
            <Typography variant="body2">
              Default admin — username <strong>{DEMO_USERNAME}</strong>.{' '}
              <Link component="button" type="button" onClick={fillDemo} underline="hover">
                Use demo credentials
              </Link>
            </Typography>
          </Alert>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 2.5, textAlign: 'center' }}
          >
            Secured with httpOnly session cookies. Your credentials are never stored in the browser.
          </Typography>
        </Paper>
      </Box>
    </Box>
  )
}
