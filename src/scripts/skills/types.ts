export interface Skill {
  id: string
  name: string
  description: string
  systemPrompt: string
  tags: string[]
  author?: string
  repo?: string
  icon?: string
  version?: string
  source: 'builtin' | 'marketplace' | 'custom'
  installedAt: number
  enabled: boolean
  triggers?: string[]
  stats?: {
    installs?: string
    activity?: string
  }
}

export type SkillMode = 'auto' | 'none' | string // 'auto' | 'none' | skillId

export interface SkillCatalogItem {
  id: string
  name: string
  description: string
  systemPrompt: string
  tags: string[]
  author: string
  repo: string
  icon: string
  triggers: string[]
  stats: {
    installs: string
    activity: string
  }
}
