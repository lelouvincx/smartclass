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

export function getWorkspaceSites(env = {}) {
  const environment = env.APP_ENV === undefined ? 'development' : env.APP_ENV
  const sites = Object.hasOwn(WORKSPACE_ENVIRONMENTS, environment)
    ? WORKSPACE_ENVIRONMENTS[environment]
    : []

  return Object.freeze(sites.map(createSite))
}
