const WORKSPACE_ENVIRONMENTS = Object.freeze({
  production: [
    ['maths', 'https://toanthaythanh.com', 'https://api.toanthaythanh.com'],
    ['english', 'https://tienganhcothuy.com', 'https://api.tienganhcothuy.com'],
  ],
  development: [
    ['maths', 'http://localhost:5173', 'http://localhost:8787'],
    ['english', 'http://localhost:5174', 'http://localhost:8788'],
  ],
  test: [
    ['maths', 'http://maths.test', 'http://maths-api.test'],
    ['english', 'http://english.test', 'http://english-api.test'],
  ],
})

function createSite([id, frontendOrigin, apiOrigin]) {
  return Object.freeze({
    id,
    frontend_origin: frontendOrigin,
    api_origin: apiOrigin,
    google_redirect_uri: `${frontendOrigin}/auth/google/callback`,
  })
}

export function workspaceEnvironment(env = import.meta.env) {
  if (env?.APP_ENV) return env.APP_ENV
  if (env?.MODE === 'test') return 'test'
  return env?.PROD ? 'production' : 'development'
}

export function getWorkspaceSites(env = import.meta.env) {
  return Object.freeze((WORKSPACE_ENVIRONMENTS[workspaceEnvironment(env)] ?? []).map(createSite))
}

export function getWorkspaceSiteForOrigin(origin = window.location.origin, env = import.meta.env) {
  const sites = getWorkspaceSites(env)
  return sites.find((candidate) => candidate.frontend_origin === origin) ?? null
}

export function requireWorkspaceSite(origin = window.location.origin, env = import.meta.env) {
  const site = getWorkspaceSiteForOrigin(origin, env)
  if (!site) {
    throw new Error('SmartClass is not configured for this website.')
  }
  return site
}

export function isAllowedTeacherDestination(destination, env = import.meta.env) {
  if (!destination?.workspace_id || !destination?.url) return false
  const site = getWorkspaceSites(env).find((candidate) => candidate.id === destination.workspace_id)
  return site?.frontend_origin === destination.url
}
