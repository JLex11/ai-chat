import type { Skill } from './types'
import { saveSkill } from './storage'

export interface ParsedSkillData {
  name: string
  description: string
  systemPrompt: string
  tags: string[]
  author?: string
  repo?: string
  triggers?: string[]
}

/**
 * Parses a markdown document (with optional YAML frontmatter) into skill data
 */
export function parseSkillMarkdown(content: string, fallbackName = 'Custom Skill'): ParsedSkillData {
  let name = fallbackName
  let description = ''
  let tags: string[] = []
  let triggers: string[] = []
  let body = content

  // Check for YAML frontmatter between --- and ---
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    body = frontmatterMatch[2].trim()

    // Parse simple YAML fields without heavy external libraries
    const lines = frontmatter.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('name:')) {
        name = trimmed.replace('name:', '').trim().replace(/^["']|["']$/g, '')
      } else if (trimmed.startsWith('description:')) {
        description = trimmed.replace('description:', '').trim().replace(/^["']|["']$/g, '')
      } else if (trimmed.startsWith('tags:')) {
        const rawTags = trimmed.replace('tags:', '').trim()
        if (rawTags.startsWith('[') && rawTags.endsWith(']')) {
          tags = rawTags
            .slice(1, -1)
            .split(',')
            .map(t => t.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean)
        }
      } else if (trimmed.startsWith('triggers:')) {
        const rawTriggers = trimmed.replace('triggers:', '').trim()
        if (rawTriggers.startsWith('[') && rawTriggers.endsWith(']')) {
          triggers = rawTriggers
            .slice(1, -1)
            .split(',')
            .map(t => t.trim().replace(/^["']|["']$/g, ''))
            .filter(Boolean)
        }
      }
    }
  }

  // If no name extracted, attempt first heading: # Name
  if (name === fallbackName) {
    const headingMatch = body.match(/^#\s+(.+)$/m)
    if (headingMatch) {
      name = headingMatch[1].trim()
    }
  }

  // If no description extracted, attempt first non-heading paragraph
  if (!description) {
    const paragraphMatch = body.match(/^(?!#)(.+)$/m)
    if (paragraphMatch) {
      description = paragraphMatch[1].slice(0, 140).trim()
    } else {
      description = `Skill personalizada: ${name}`
    }
  }

  if (tags.length === 0) {
    tags = ['Custom', 'Agent']
  }

  if (triggers.length === 0) {
    triggers = [name.toLowerCase()]
  }

  return {
    name,
    description,
    systemPrompt: body,
    tags,
    triggers,
  }
}

/**
 * Imports a skill from GitHub shorthand (owner/repo or owner/repo/path) or raw URL
 */
export async function importSkillFromGitHub(sourceInput: string): Promise<Skill> {
  const input = sourceInput.trim()
  if (!input) {
    throw new Error('Por favor ingresa un repositorio o URL válida.')
  }

  let candidates: string[] = []
  let repoName = ''
  let authorName = ''

  if (input.startsWith('http://') || input.startsWith('https://')) {
    // If it is a full URL
    if (input.includes('raw.githubusercontent.com')) {
      candidates.push(input)
    } else if (input.includes('github.com')) {
      // Convert github.com/owner/repo/blob/main/SKILL.md -> raw.githubusercontent.com/...
      const rawUrl = input
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/')
      candidates.push(rawUrl)
      if (!rawUrl.endsWith('.md')) {
        candidates.push(`${rawUrl.replace(/\/$/, '')}/main/SKILL.md`)
        candidates.push(`${rawUrl.replace(/\/$/, '')}/master/SKILL.md`)
      }
    } else {
      candidates.push(input)
    }
  } else {
    // Shorthand format: owner/repo or owner/repo/skill-subpath
    const parts = input.split('/').map(p => p.trim()).filter(Boolean)
    if (parts.length < 2) {
      throw new Error('Formato inválido. Usa "owner/repo" o "owner/repo/nombre-skill"')
    }

    const [owner, repo, ...subpath] = parts
    authorName = owner
    repoName = `${owner}/${repo}`

    if (subpath.length > 0) {
      const pathJoined = subpath.join('/')
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/${pathJoined}/SKILL.md`)
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/master/${pathJoined}/SKILL.md`)
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/${pathJoined}.md`)
    } else {
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`)
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`)
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/skills/SKILL.md`)
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/master/skills/SKILL.md`)
    }
  }

  let content = ''
  let successfulUrl = ''

  for (const url of candidates) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        content = await res.text()
        successfulUrl = url
        break
      }
    } catch {
      // Continue to next candidate
    }
  }

  if (!content) {
    throw new Error(`No se pudo encontrar el archivo SKILL.md en ${input}. Verifica que el repositorio sea público y contenga SKILL.md`)
  }

  const fallbackTitle = repoName || input.split('/').pop() || 'Skill'
  const parsed = parseSkillMarkdown(content, fallbackTitle)

  const newSkill: Skill = {
    id: `github_${input.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}`,
    name: parsed.name,
    description: parsed.description,
    systemPrompt: parsed.systemPrompt,
    tags: parsed.tags,
    author: authorName || 'GitHub Community',
    repo: repoName || successfulUrl,
    icon: '📦',
    source: 'marketplace',
    installedAt: Date.now(),
    enabled: true,
    triggers: parsed.triggers,
    stats: {
      installs: 'Imported',
      activity: 'Custom Import',
    },
  }

  saveSkill(newSkill)
  return newSkill
}
