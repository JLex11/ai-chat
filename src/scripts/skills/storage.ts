import type { Skill, SkillMode } from './types'
import { SKILLS_CATALOG } from './catalog'
import { storage } from '../storage/localStorage'

const SKILLS_STORAGE_KEY = 'ai-chat-skills'
const SKILL_MODE_STORAGE_KEY = 'ai-chat-skill-mode'

export const DEFAULT_SKILL_MODE: SkillMode = 'auto'

// Pre-install a sensible selection of initial skills so the user can experience the feature immediately
export function getDefaultSkills(): Skill[] {
  const initialIds = ['grill-me', 'typescript-pro', 'tailwind-v4', 'debounce-expert']
  return SKILLS_CATALOG.filter(item => initialIds.includes(item.id)).map(item => ({
    id: item.id,
    name: item.name,
    description: item.description,
    systemPrompt: item.systemPrompt,
    tags: item.tags,
    author: item.author,
    repo: item.repo,
    icon: item.icon,
    source: 'builtin',
    installedAt: Date.now(),
    enabled: true, // Enabled by default, user can toggle to disabled
    triggers: item.triggers,
    stats: item.stats,
  }))
}

export function getInstalledSkills(): Skill[] {
  const stored = storage.get<Skill[]>(SKILLS_STORAGE_KEY)
  if (!stored || !Array.isArray(stored) || stored.length === 0) {
    const defaults = getDefaultSkills()
    storage.set(SKILLS_STORAGE_KEY, defaults)
    return defaults
  }
  return stored
}

export function saveInstalledSkills(skills: Skill[]): boolean {
  return storage.set(SKILLS_STORAGE_KEY, skills)
}

export function getSkillById(id: string): Skill | undefined {
  const skills = getInstalledSkills()
  return skills.find(s => s.id === id)
}

export function getActiveSkills(): Skill[] {
  return getInstalledSkills().filter(s => s.enabled)
}

export function toggleSkillEnabled(id: string): boolean {
  const skills = getInstalledSkills()
  const skill = skills.find(s => s.id === id)
  if (!skill) return false

  skill.enabled = !skill.enabled
  return saveInstalledSkills(skills)
}

export function setSkillEnabled(id: string, enabled: boolean): boolean {
  const skills = getInstalledSkills()
  const skill = skills.find(s => s.id === id)
  if (!skill) return false

  skill.enabled = enabled
  return saveInstalledSkills(skills)
}

export function saveSkill(skill: Skill): boolean {
  const skills = getInstalledSkills()
  const existingIndex = skills.findIndex(s => s.id === skill.id)
  if (existingIndex >= 0) {
    skills[existingIndex] = skill
  } else {
    skills.push(skill)
  }
  return saveInstalledSkills(skills)
}

export function deleteSkill(id: string): boolean {
  const skills = getInstalledSkills()
  const filtered = skills.filter(s => s.id !== id)
  const saved = saveInstalledSkills(filtered)

  // If the deleted skill was active in fixed mode, reset mode to auto
  const currentMode = getSkillMode()
  if (currentMode === id) {
    setSkillMode('auto')
  }

  return saved
}

export function isSkillInstalled(id: string): boolean {
  const skills = getInstalledSkills()
  return skills.some(s => s.id === id)
}

export function installFromCatalog(catalogId: string): Skill | null {
  const item = SKILLS_CATALOG.find(c => c.id === catalogId)
  if (!item) return null

  const newSkill: Skill = {
    id: item.id,
    name: item.name,
    description: item.description,
    systemPrompt: item.systemPrompt,
    tags: item.tags,
    author: item.author,
    repo: item.repo,
    icon: item.icon,
    source: 'marketplace',
    installedAt: Date.now(),
    enabled: true,
    triggers: item.triggers,
    stats: item.stats,
  }

  saveSkill(newSkill)
  return newSkill
}

export function getSkillMode(): SkillMode {
  const saved = storage.get<SkillMode>(SKILL_MODE_STORAGE_KEY)
  return saved || DEFAULT_SKILL_MODE
}

export function setSkillMode(mode: SkillMode): boolean {
  return storage.set(SKILL_MODE_STORAGE_KEY, mode)
}
