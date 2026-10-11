import type { APIRoute } from 'astro'
import { getOidcToken } from './token'

export const prerender = false

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')?.trim()

  if (!id) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'missing_id',
        message: 'Se requiere el parámetro id (ej: vercel-labs/skills/find-skills)',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  const token = await getOidcToken(request)

  // 1. Try official skills.sh API if token is available
  if (token) {
    try {
      const targetUrl = `https://skills.sh/api/v1/skills/${encodeURI(id)}`
      const res = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (res.ok) {
        const json = await res.json()
        const files: Array<{ path: string; contents: string }> = json.files || []
        const skillFile = files.find(f => f.path.toLowerCase().endsWith('skill.md')) || files[0]

        if (skillFile && skillFile.contents) {
          return new Response(
            JSON.stringify({
              success: true,
              live: true,
              source: json.source,
              slug: json.slug,
              installs: json.installs,
              skillMarkdown: skillFile.contents,
              files,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }
    } catch {
      // Continue to fallback
    }
  }

  // 2. Fallback to GitHub Raw endpoint
  try {
    const parts = id.split('/').map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const owner = parts[0]
      const repo = parts[1]
      const subpath = parts.slice(2).join('/')

      const candidates: string[] = []
      if (subpath) {
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/${subpath}/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${subpath}/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/master/${subpath}/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${subpath}/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/.claude/skills/${subpath}/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/.github/skills/${subpath}/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/${subpath}.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/master/${subpath}.md`)
      } else {
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/skills/SKILL.md`)
        candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/master/skills/SKILL.md`)
      }

      for (const rawUrl of candidates) {
        try {
          const ghRes = await fetch(rawUrl)
          if (ghRes.ok) {
            const content = await ghRes.text()
            return new Response(
              JSON.stringify({
                success: true,
                live: false,
                source: `${owner}/${repo}`,
                slug: subpath || repo,
                skillMarkdown: content,
                rawUrl,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          }
        } catch {}
      }
    }
  } catch {}

  return new Response(
    JSON.stringify({
      success: false,
      error: 'not_found',
      message: `No se pudo obtener el archivo SKILL.md para "${id}".`,
    }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
