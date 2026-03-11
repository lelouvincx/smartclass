import React from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth-context'
import { canAccessRolePath, getDefaultPathForRole } from './lib/navigation'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import StudentDashboardPage from './pages/StudentDashboardPage'
import TeacherCreateExercisePage from './pages/TeacherCreateExercisePage'
import TeacherDashboardPage from './pages/TeacherDashboardPage'
import TeacherExercisesPage from './pages/TeacherExercisesPage'

function PublicOnlyRoute({ children }) {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return <p className="p-6">Loading...</p>
  }

  if (user) {
    return <Navigate to={getDefaultPathForRole(user.role)} replace />
  }

  return children
}

function ProtectedRoleRoute({ children }) {
  const location = useLocation()
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return <p className="p-6">Loading...</p>
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  if (!canAccessRolePath(user.role, location.pathname)) {
    return <Navigate to={getDefaultPathForRole(user.role)} replace />
  }

  return children
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/teacher"
        element={
          <ProtectedRoleRoute>
            <TeacherDashboardPage />
          </ProtectedRoleRoute>
        }
      />
      <Route
        path="/teacher/exercises"
        element={
          <ProtectedRoleRoute>
            <TeacherExercisesPage />
          </ProtectedRoleRoute>
        }
      />
      <Route
        path="/teacher/exercises/new"
        element={
          <ProtectedRoleRoute>
            <TeacherCreateExercisePage />
          </ProtectedRoleRoute>
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoleRoute>
            <StudentDashboardPage />
          </ProtectedRoleRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function AppRouter() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
