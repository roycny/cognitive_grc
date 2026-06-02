export type UserRole = 'ADMIN' | 'EDITOR' | 'AUDITOR' | 'VIEWER'

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
  is_active: boolean
}
