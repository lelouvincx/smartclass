export function getDefaultPathForRole(role) {
  if (role === 'teacher') {
    return '/teacher'
  }

  if (role === 'student') {
    return '/student'
  }

  return '/'
}

export function canAccessRolePath(role, path) {
  if (path.startsWith('/teacher')) {
    return role === 'teacher'
  }

  if (path.startsWith('/student')) {
    return role === 'student'
  }

  return true
}
