import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, SESSION_EXPIRED_EVENT } from '../api/client'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  initializing: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  const fetchMe = useCallback(async () => {
    const { data } = await api.get<User>('/users/me')
    setUser(data)
  }, [])

  // On first load, ask the server who we are. The cookie (if any) is sent
  // automatically; the interceptor will silently refresh once if needed.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        await fetchMe()
      } catch {
        if (active) setUser(null)
      } finally {
        if (active) setInitializing(false)
      }
    })()
    return () => {
      active = false
    }
  }, [fetchMe])

  // If a refresh ultimately fails anywhere in the app, clear the session.
  useEffect(() => {
    const handler = () => setUser(null)
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [])

  const login = useCallback(
    async (username: string, password: string) => {
      // /auth/token expects an OAuth2 form body; the server sets httpOnly cookies.
      const body = new URLSearchParams()
      body.append('username', username)
      body.append('password', password)
      await api.post('/auth/token', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      await fetchMe()
    },
    [fetchMe],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {})
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, initializing, login, logout }),
    [user, initializing, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
