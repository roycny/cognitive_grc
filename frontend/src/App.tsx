import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AuditsPage from './pages/AuditsPage'
import IssuesPage from './pages/IssuesPage'
import UserManagementPage from './pages/UserManagementPage'
import LoggingPage from './pages/LoggingPage'
import SettingsPage from './pages/SettingsPage'
import GLBAAssessmentsPage from './pages/GLBAAssessmentsPage'
import GLBAAssessmentPage from './pages/GLBAAssessmentPage'
import KRIsPage from './pages/KRIsPage'
import SCAAgent from './pages/SCAAgent'
import SIEMScriptAgent from './pages/SIEMScriptAgent'
import PolicyGapAgent from './pages/PolicyGapAgent'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audits"
        element={
          <ProtectedRoute>
            <AuditsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/issues"
        element={
          <ProtectedRoute>
            <IssuesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <UserManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/logging"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <LoggingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assessments/glba"
        element={
          <ProtectedRoute>
            <GLBAAssessmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assessments/glba/:id"
        element={
          <ProtectedRoute>
            <GLBAAssessmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kris"
        element={
          <ProtectedRoute>
            <KRIsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-tools/sca-agent"
        element={
          <ProtectedRoute>
            <SCAAgent />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-tools/siem-agent"
        element={
          <ProtectedRoute>
            <SIEMScriptAgent />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-tools/policy-gap"
        element={
          <ProtectedRoute>
            <PolicyGapAgent />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
