import React from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { canAccessRolePath, getDefaultPathForRole } from '@/lib/navigation'
import { StudentLayout } from '@/components/student-layout'
import { TeacherLayout } from '@/components/teacher-layout'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import StudentDashboardPage from '@/pages/StudentDashboardPage'
import StudentExercisesPage from '@/pages/StudentExercisesPage'
import StudentTakeExercisePage from '@/pages/StudentTakeExercisePage'
import StudentSubmissionsPage from '@/pages/StudentSubmissionsPage'
import TeacherCreateExercisePage from '@/pages/TeacherCreateExercisePage'
import TeacherDashboardPage from '@/pages/TeacherDashboardPage'
import TeacherExercisesPage from '@/pages/TeacherExercisesPage'
import TeacherViewExercisePage from '@/pages/TeacherViewExercisePage'

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

      {/* Teacher routes with shared layout */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoleRoute>
            <TeacherLayout />
          </ProtectedRoleRoute>
        }
      >
        <Route index element={<TeacherDashboardPage />} />
        <Route path="exercises" element={<TeacherExercisesPage />} />
        <Route path="exercises/new" element={<TeacherCreateExercisePage />} />
        <Route path="exercises/:id" element={<TeacherViewExercisePage />} />
      </Route>

      {/* Student routes with shared layout */}
      <Route
        path="/student"
        element={
          <ProtectedRoleRoute>
            <StudentLayout />
          </ProtectedRoleRoute>
        }
      >
        <Route index element={<StudentDashboardPage />} />
        <Route path="exercises" element={<StudentExercisesPage />} />
        <Route path="exercises/:id" element={<StudentTakeExercisePage />} />
        <Route path="submissions" element={<StudentSubmissionsPage />} />
      </Route>

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
