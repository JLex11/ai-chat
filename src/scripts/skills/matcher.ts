import type { Skill } from './types'
import { getActiveSkills } from './storage'

export interface MatchResult {
  skill: Skill
  confidence: number
  matchedTrigger: string
}

export function matchSkillForPrompt(
  prompt: string,
  availableSkills?: Skill[]
): MatchResult | null {
  const normalized = prompt.toLowerCase().trim()
  if (!normalized) return null

  // Only evaluate active (enabled) skills! Inactive skills are ignored.
  const activeSkills = availableSkills ?? getActiveSkills()
  if (activeSkills.length === 0) return null

  let bestMatch: MatchResult | null = null
  let maxScore = 0

  for (const skill of activeSkills) {
    let score = 0
    let matchedTrigger = ''

    // 1. Check direct triggers (exact phrase matching)
    if (skill.triggers && skill.triggers.length > 0) {
      for (const trigger of skill.triggers) {
        const triggerLower = trigger.toLowerCase()
        if (normalized.includes(triggerLower)) {
          // Weight longer, more specific triggers higher
          const currentWeight = 10 + triggerLower.length
          if (currentWeight > score) {
            score = currentWeight
            matchedTrigger = trigger
          }
        }
      }
    }

    // 2. Check skill name
    const nameLower = skill.name.toLowerCase()
    if (normalized.includes(nameLower)) {
      score += 8
      if (!matchedTrigger) matchedTrigger = skill.name
    }

    // 3. Check tags
    if (skill.tags && skill.tags.length > 0) {
      for (const tag of skill.tags) {
        const tagLower = tag.toLowerCase()
        if (normalized.includes(tagLower)) {
          score += 4
          if (!matchedTrigger) matchedTrigger = tag
        }
      }
    }

    // Threshold: requires at least a clear trigger, name, or strong tag match
    if (score >= 6 && score > maxScore) {
      maxScore = score
      bestMatch = {
        skill,
        confidence: Math.min(100, Math.round((score / 20) * 100)),
        matchedTrigger: matchedTrigger || skill.name,
      }
    }
  }

  return bestMatch
}
