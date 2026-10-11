/**
 * Resolves the Vercel OIDC Token from environment, request headers, or @vercel/oidc
 */
export async function getOidcToken(request?: Request): Promise<string | null> {
  // 1. Check environment variable (Astro import.meta.env or Node/Bun process.env)
  const envToken =
    (import.meta.env.VERCEL_OIDC_TOKEN as string | undefined) ||
    ((globalThis as any).process?.env?.VERCEL_OIDC_TOKEN as string | undefined)

  if (envToken) {
    return envToken
  }

  // 2. Check incoming request header
  if (request) {
    const headerToken = request.headers.get('x-vercel-oidc-token')
    if (headerToken) return headerToken
  }

  // 3. Try @vercel/oidc helper
  try {
    const { getVercelOidcToken } = await import('@vercel/oidc')
    const token = await getVercelOidcToken()
    if (token) return token
  } catch {
    // Ignored in environments where @vercel/oidc cannot connect
  }

  return null
}
