import type { APIRoute } from 'astro'
import { getOidcToken } from './token'

export const prerender = false

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim()
  const limit = url.searchParams.get('limit') || '30'

  if (!q || q.length < 2) {
    return new Response(
      JSON.stringify({
        success: true,
        data: [],
        skills: [],
        message: 'La consulta de búsqueda debe tener al menos 2 caracteres',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  const token = await getOidcToken(request)

  // 1. If Vercel OIDC token is present, try official /api/v1/skills/search
  if (token) {
    try {
      const targetUrl = `https://skills.sh/api/v1/skills/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`
      const res = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (res.ok) {
        const data = await res.json()
        const rawList = data.data || data.skills || []
        const skills = rawList.map((s: any) => ({
          id: s.id || `${s.source}/${s.skillId || s.name}`,
          name: s.name,
          source: s.source,
          installs: s.installs,
          description: s.description || `Skill de ${s.source}`,
          tags: s.tags || ['skills.sh'],
          icon: '⚡',
        }))

        return new Response(
          JSON.stringify({
            success: true,
            live: true,
            mode: 'oidc',
            query: q,
            count: skills.length,
            skills,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    } catch {
      // Continue to public search
    }
  }

  // 2. Direct local development search via skills.sh public search API (no auth needed!)
  try {
    const publicUrl = `https://skills.sh/api/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`
    const res = await fetch(publicUrl)

    if (res.ok) {
      const data = await res.json()
      const rawList = data.skills || data.data || []
      const skills = rawList.map((s: any) => ({
        id: s.id || `${s.source}/${s.skillId || s.name}`,
        name: s.name,
        source: s.source,
        installs: s.installs,
        description: s.description || `Skill de ${s.source}`,
        tags: s.tags || ['skills.sh'],
        icon: '⚡',
      }))

      return new Response(
        JSON.stringify({
          success: true,
          live: true,
          mode: 'public_search_api',
          query: q,
          count: skills.length,
          skills,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        live: false,
        error: 'search_failed',
        message: err?.message || 'Error al buscar en skills.sh',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  return new Response(
    JSON.stringify({
      success: false,
      live: false,
      error: 'search_failed',
      message: 'No se encontraron resultados en skills.sh',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
