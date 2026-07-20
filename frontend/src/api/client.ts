import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'

/**
 * Single axios instance for the whole app.
 *
 * Security model:
 *  - `withCredentials: true` so the browser sends the httpOnly access/refresh
 *    cookies automatically. No token is ever read or written by JavaScript.
 *  - A response interceptor performs a transparent ("silent") refresh on 401 by
 *    calling /auth/refresh (which rotates the refresh token server-side) and
 *    then replays the original request exactly once.
 */
const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const api = axios.create({
  baseURL,
  withCredentials: true,
})

/**
 * Read a cookie value by name.  Used to extract the CSRF double-submit token
 * (set as a non-httpOnly cookie by the backend on login / refresh).
 */
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

/**
 * CSRF double-submit: attach the csrf_token cookie value as the X-CSRF-Token
 * header on every state-changing request (POST, PUT, PATCH, DELETE).
 */
api.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase()
  if (method && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrfToken = getCookie('csrf_token')
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken
    }
  }
  return config
})

/**
 * Absolute URL of the GLBA assessment report endpoint. Opened as a top-level
 * navigation (new tab), so the browser sends the httpOnly auth cookie
 * automatically — no token handling in JS.
 */
export const glbaReportUrl = (assessmentId: number): string =>
  `${baseURL.replace(/\/$/, '')}/glba/assessments/${assessmentId}/report`

export const projectRiskReportUrl = (assessmentId: number): string =>
  `${baseURL.replace(/\/$/, '')}/project-risk/assessments/${assessmentId}/report`

/** Fired when a refresh fails — the app uses this to drop back to /login. */
export const SESSION_EXPIRED_EVENT = 'auth:session-expired'

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

// Auth endpoints must never trigger the refresh-and-retry loop themselves.
const AUTH_PATHS = ['/auth/token', '/auth/refresh', '/auth/logout']
const isAuthEndpoint = (url?: string) => !!url && AUTH_PATHS.some((p) => url.includes(p))

let isRefreshing = false
let waiters: Array<(succeeded: boolean) => void> = []

const flushWaiters = (succeeded: boolean) => {
  waiters.forEach((resolve) => resolve(succeeded))
  waiters = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status

    if (status !== 401 || !original || original._retry || isAuthEndpoint(original.url)) {
      return Promise.reject(error)
    }

    original._retry = true

    // A refresh is already in flight — wait for it, then retry (or give up).
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        waiters.push((succeeded) => (succeeded ? resolve(api(original)) : reject(error)))
      })
    }

    isRefreshing = true
    try {
      await api.post('/auth/refresh', {})
      isRefreshing = false
      flushWaiters(true)
      return api(original)
    } catch (refreshError) {
      isRefreshing = false
      flushWaiters(false)
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      return Promise.reject(refreshError)
    }
  },
)
