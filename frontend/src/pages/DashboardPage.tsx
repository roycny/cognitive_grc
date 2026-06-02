import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Container,
  Divider,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  BrainCircuit,
  ClipboardCheck,
  FileSearch,
  FileText,
  LogOut,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import type { UserRole } from '../types'

interface Tool {
  title: string
  description: string
  icon: LucideIcon
}

const GRC_TOOLS: Tool[] = [
  { title: 'Audit Tracker', description: 'Plan, schedule, and track audits from fieldwork to sign-off.', icon: ClipboardCheck },
  { title: 'Issue Tracker', description: 'Capture findings and remediate issues with owners and due dates.', icon: TriangleAlert },
  { title: 'Assessment Module', description: 'Run control and risk assessments against your frameworks.', icon: ShieldCheck },
  { title: 'Risk Register', description: 'Maintain a living inventory of risks, scores, and treatments.', icon: ShieldAlert },
  { title: 'Policy Center', description: 'Author, version, and attest policies across the organization.', icon: ScrollText },
]

const AI_TOOLS: Tool[] = [
  { title: 'AI Risk Analyzer', description: 'Summarize exposure and surface emerging risks from your data.', icon: Sparkles },
  { title: 'Control Recommender', description: 'Suggest controls and mappings for gaps in your frameworks.', icon: Bot },
  { title: 'Document Summarizer', description: 'Turn lengthy evidence and reports into concise briefs.', icon: FileText },
  { title: 'Evidence Finder', description: 'Semantic search across audits, issues, and assessments.', icon: FileSearch },
]

const ROLE_COLORS: Record<UserRole, 'primary' | 'secondary' | 'warning' | 'default'> = {
  ADMIN: 'primary',
  EDITOR: 'secondary',
  AUDITOR: 'warning',
  VIEWER: 'default',
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea disabled sx={{ height: '100%', alignItems: 'stretch' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'primary.light',
                color: 'common.white',
              }}
            >
              <Icon size={22} />
            </Box>
            <Chip label="Coming soon" size="small" variant="outlined" />
          </Stack>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {tool.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {tool.description}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

function ToolGrid({ tools }: { tools: Tool[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2.5,
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
      }}
    >
      {tools.map((tool) => (
        <ToolCard key={tool.title} tool={tool} />
      ))}
    </Box>
  )
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  const role = user?.role ?? 'VIEWER'
  const initial = user?.username?.[0]?.toUpperCase() ?? '?'

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        color="inherit"
        sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Toolbar>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexGrow: 1 }}>
            <BrainCircuit size={24} color="#3538CD" />
            <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
              Cognitive&nbsp;GRC
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ display: { xs: 'none', sm: 'flex' } }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
                {initial}
              </Avatar>
              <Box sx={{ lineHeight: 1.1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {user?.username}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email}
                </Typography>
              </Box>
              <Chip label={role} size="small" color={ROLE_COLORS[role]} sx={{ fontWeight: 600 }} />
            </Stack>
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleLogout}
              disabled={loggingOut}
              startIcon={<LogOut size={16} />}
            >
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          Welcome back, {user?.username}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Your AI-driven GRC workspace. Modules below are placeholders — ready to be built.
        </Typography>

        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <ShieldCheck size={20} color="#3538CD" />
          <Typography variant="h6">GRC Tools</Typography>
        </Stack>
        <ToolGrid tools={GRC_TOOLS} />

        <Divider sx={{ my: 5 }} />

        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <Sparkles size={20} color="#0E9384" />
          <Typography variant="h6">AI Tools</Typography>
        </Stack>
        <ToolGrid tools={AI_TOOLS} />
      </Container>
    </Box>
  )
}
