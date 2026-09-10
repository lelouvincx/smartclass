export function getAuthPermissions({ user, membership } = {}) {
  const enabled = Boolean(user && user.disabled_at == null)
  const isPlatformAdmin = enabled && user.platform_role === 'platform_admin'
  const canManage = enabled && (isPlatformAdmin
    || (membership?.role === 'teacher' && membership?.status === 'active'))
  const isActiveStudent = enabled && membership?.role === 'student' && membership?.status === 'active'
  const defaultPath = canManage ? '/teacher' : isActiveStudent ? '/student' : user ? '/join' : '/'
  return { canManage, isActiveStudent, isPlatformAdmin, defaultPath }
}

export function getDefaultPathForAuth(auth) {
  return getAuthPermissions(auth).defaultPath
}

export function canAccessAuthPath(auth, path) {
  const { canManage, isActiveStudent } = getAuthPermissions(auth)
  if (path.startsWith('/teacher')) {
    return canManage
  }

  if (path.startsWith('/student')) {
    return isActiveStudent
  }

  return true
}
