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
  if (path === '/teacher') {
    return role === 'teacher'
  }

  if (path === '/student') {
    return role === 'student'
  }

  return true
}
