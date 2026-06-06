import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Badge, Box, Chip, Stack, Tooltip, Typography } from '@mui/material'
import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  ChevronDown,
  ClipboardCheck,
  History,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import type { UserRole } from '../types'

interface NavItem {
  text: string
  icon: LucideIcon
  /** Route this item navigates to. Items without a path are placeholders. */
  path?: string
  /** Has sub-modules — shows a chevron. */
  expandable?: boolean
}

interface NavSection {
  label?: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ text: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' }],
  },
  {
    label: 'Modules',
    items: [
      { text: 'Audit & Exam', icon: ClipboardCheck, path: '/audits' },
      { text: 'Issue Tracker', icon: TriangleAlert, path: '/issues' },
      { text: 'Risk Assessment', icon: ShieldAlert, expandable: true },
      { text: 'KRI Metrics', icon: ShieldCheck },
      { text: 'AI Tools', icon: Sparkles, expandable: true },
    ],
  },
  {
    label: 'System',
    items: [
      { text: 'User Management', icon: Users, path: '/users' },
      { text: 'Logging', icon: History, path: '/logging' },
      { text: 'Settings', icon: Settings, path: '/settings' },
    ],
  },
]

const ROLE_COLORS: Record<UserRole, 'primary' | 'secondary' | 'warning' | 'default'> = {
  ADMIN: 'primary',
  EDITOR: 'secondary',
  AUDITOR: 'warning',
  VIEWER: 'default',
}

const SIDEBAR_WIDTH = 264

function SidebarItem({
  item,
  active,
  onClick,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        width: '100%',
        border: 0,
        cursor: 'pointer',
        bgcolor: active ? 'rgba(53, 56, 205, 0.08)' : 'transparent',
        color: active ? 'primary.main' : 'text.secondary',
        borderRight: active ? '3px solid' : '3px solid transparent',
        borderColor: active ? 'primary.main' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2.5,
        py: 1.25,
        font: 'inherit',
        fontWeight: 600,
        fontSize: 14,
        textAlign: 'left',
        transition: 'background-color 0.15s, color 0.15s',
        '&:hover': { bgcolor: active ? 'rgba(53, 56, 205, 0.08)' : 'action.hover', color: active ? 'primary.main' : 'text.primary' },
      }}
    >
      <Icon size={18} />
      <Box component="span" sx={{ flexGrow: 1 }}>
        {item.text}
      </Box>
      {item.expandable && <ChevronDown size={16} style={{ opacity: 0.7 }} />}
    </Box>
  )
}

export default function Layout({
  children,
  title = 'Main Dashboard',
}: {
  children: ReactNode
  title?: string
}) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const role = user?.role ?? 'VIEWER'
  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '?'

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar */}
      <Box
        component="aside"
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
        }}
      >
        {/* Brand */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{ height: 68, px: 2.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #6366F1 0%, #3538CD 100%)',
              color: 'common.white',
            }}
          >
            <ShieldCheck size={18} />
          </Box>
          <Typography variant="h6" color="primary" sx={{ fontWeight: 800 }}>
            Cognitive&nbsp;GRC
          </Typography>
        </Stack>

        {/* Nav */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto', py: 1.5 }}>
          {NAV_SECTIONS.map((section, i) => (
            <Box key={section.label ?? i} sx={{ mb: 1 }}>
              {section.label && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    px: 2.5,
                    pt: 1.5,
                    pb: 0.5,
                    color: 'text.secondary',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontSize: 11,
                  }}
                >
                  {section.label}
                </Typography>
              )}
              {section.items.map((item) => (
                <SidebarItem
                  key={item.text}
                  item={item}
                  active={!!item.path && location.pathname === item.path}
                  onClick={() => {
                    if (item.path) navigate(item.path)
                  }}
                />
              ))}
            </Box>
          ))}
        </Box>

        {/* Logout */}
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Box
            component="button"
            onClick={handleLogout}
            sx={{
              width: '100%',
              border: 0,
              cursor: 'pointer',
              bgcolor: 'transparent',
              color: 'error.main',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.5,
              py: 1.25,
              borderRadius: 2,
              font: 'inherit',
              fontWeight: 600,
              fontSize: 14,
              '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.06)' },
            }}
          >
            <LogOut size={18} />
            <span>Logout</span>
          </Box>
        </Box>
      </Box>

      {/* Main column */}
      <Box sx={{ flexGrow: 1, ml: `${SIDEBAR_WIDTH}px`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <Stack
          component="header"
          direction="row"
          alignItems="center"
          sx={{
            height: 68,
            px: 3,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            position: 'sticky',
            top: 0,
            zIndex: 9,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexGrow: 1 }}>
            <LayoutDashboard size={20} color="#3538CD" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={2}>
            <Chip
              icon={<ShieldCheck size={14} />}
              label="Synced"
              size="small"
              sx={{
                bgcolor: 'rgba(14, 147, 132, 0.12)',
                color: 'secondary.main',
                fontWeight: 600,
                '& .MuiChip-icon': { color: 'secondary.main' },
              }}
            />
            <Tooltip title="Sync">
              <Box component="span" sx={{ color: 'text.secondary', display: 'flex', cursor: 'pointer' }}>
                <RefreshCw size={18} />
              </Box>
            </Tooltip>
            <Tooltip title="Notifications">
              <Badge color="error" variant="dot" overlap="circular">
                <Box component="span" sx={{ color: 'text.secondary', display: 'flex', cursor: 'pointer' }}>
                  <Bell size={18} />
                </Box>
              </Badge>
            </Tooltip>
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Typography variant="body2" sx={{ fontWeight: 600, display: { xs: 'none', sm: 'block' } }}>
                {user?.username}
              </Typography>
              <Tooltip title={role}>
                <Avatar sx={{ width: 34, height: 34, bgcolor: `${ROLE_COLORS[role]}.main`, fontSize: 14 }}>
                  {initials}
                </Avatar>
              </Tooltip>
            </Stack>
          </Stack>
        </Stack>

        {/* Page content */}
        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2.5, md: 4 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
