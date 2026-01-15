import type { Preferences } from '../chat/types'
import { storage, STORAGE_KEYS } from './localStorage'
import { DEFAULT_MODEL, AVAILABLE_MODELS } from '../config/models'
import { DEFAULT_PROMPT_ID } from '../config/prompts'

const defaultPreferences: Preferences = {
  selectedModel: DEFAULT_MODEL,
  selectedPrompt: DEFAULT_PROMPT_ID,
}

export function loadPreferences(): Preferences {
  const saved = storage.get<Preferences>(STORAGE_KEYS.PREFERENCES)
  if (!saved) return defaultPreferences

  // Validate saved model exists in available models
  const modelExists = AVAILABLE_MODELS.some(m => m.id === saved.selectedModel)
  if (!modelExists) {
    saved.selectedModel = DEFAULT_MODEL
    storage.set(STORAGE_KEYS.PREFERENCES, saved)
  }

  return saved
}

export function savePreferences(prefs: Preferences): boolean {
  return storage.set(STORAGE_KEYS.PREFERENCES, prefs)
}

export function updatePreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K]
): boolean {
  const current = loadPreferences()
  return savePreferences({ ...current, [key]: value })
}

export function getSelectedModel(): string {
  return loadPreferences().selectedModel
}

export function setSelectedModel(modelId: string): boolean {
  return updatePreference('selectedModel', modelId)
}

export function getSelectedPrompt(): string {
  return loadPreferences().selectedPrompt
}

export function setSelectedPrompt(promptId: string): boolean {
  return updatePreference('selectedPrompt', promptId)
}
