import type { APIRoute } from 'astro'
import { getOidcToken } from './token'

export const prerender = false

/**
 * Extracts real-time leaderboard data directly from skills.sh without needing authentication
 */
async function fetchSkillsRsc(view: string, perPage: number, page: number) {
  try {
    const res = await fetch(`https://skills.sh/?view=${encodeURIComponent(view)}`, {
      headers: { RSC: '1' },
    })
    if (!res.ok) return null
    const text = await res.text()
    const idx = text.indexOf('"initialSkills":[')
    if (idx === -1) return null

    const start = idx + '"initialSkills":'.length
    let depth = 0
    let end = start
    for (let i = start; i < text.length; i++) {
      if (text[i] === '[') depth++
      else if (text[i] === ']') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }

    const rawSkills = JSON.parse(text.slice(start, end))
    const offset = page * perPage
    const paginated = rawSkills.slice(offset, offset + perPage)

    return {
      total: rawSkills.length,
      skills: paginated.map((s: any) => ({
        id: `${s.source}/${s.skillId || s.name}`,
        name: s.name,
        source: s.source,
        installs: s.installs,
        description: s.description || `Skill oficial de ${s.source}`,
        tags: s.tags || [s.isOfficial ? 'Oficial' : 'Community'],
        icon: s.isOfficial ? '🛡️' : '⚡',
      })),
    }
  } catch (e) {
    console.warn('Failed to parse RSC skills in local dev:', e)
    return null
  }
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url)
  const view = url.searchParams.get('view') || 'trending'
  const page = parseInt(url.searchParams.get('page') || '0', 10)
  const perPage = parseInt(url.searchParams.get('per_page') || '30', 10)

  const token = await getOidcToken(request)

  // 1. If Vercel OIDC token is present, consume official /api/v1/skills
  if (token) {
    try {
      const targetUrl = `https://skills.sh/api/v1/skills?view=${encodeURIComponent(view)}&page=${encodeURIComponent(page)}&per_page=${encodeURIComponent(perPage)}`
      const res = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (res.ok) {
        const data = await res.json()
        const rawItems = data.data || data.skills || []
        const skills = rawItems.map((s: any) => ({
          id: s.id || `${s.source}/${s.name}`,
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
            view,
            count: skills.length,
            skills,
            pagination: data.pagination,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    } catch {
      // Fallback to direct public extraction
    }
  }

  // 2. Direct local development consumption without needing Vercel OIDC token
  const rscData = await fetchSkillsRsc(view, perPage, page)
  if (rscData) {
    return new Response(
      JSON.stringify({
        success: true,
        live: true,
        mode: 'public_live',
        view,
        count: rscData.skills.length,
        total: rscData.total,
        skills: rscData.skills,
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
      error: 'fetch_failed',
      message: 'No se pudo obtener el ranking de skills.sh',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
