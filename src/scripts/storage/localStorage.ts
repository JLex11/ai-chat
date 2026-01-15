const STORAGE_KEYS = {
  PREFERENCES: 'ai-chat-preferences',
  CONVERSATIONS: 'ai-chat-conversations',
  CURRENT_CONVERSATION: 'ai-chat-current-conversation',
} as const

class LocalStorageManager {
  private isAvailable: boolean

  constructor() {
    this.isAvailable = this.checkAvailability()
  }

  private checkAvailability(): boolean {
    try {
      const test = '__storage_test__'
      localStorage.setItem(test, test)
      localStorage.removeItem(test)
      return true
    } catch {
      return false
    }
  }

  get<T>(key: string): T | null {
    if (!this.isAvailable) return null
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : null
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): boolean {
    if (!this.isAvailable) return false
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (e) {
      console.error('Storage quota exceeded', e)
      return false
    }
  }

  remove(key: string): void {
    if (this.isAvailable) {
      localStorage.removeItem(key)
    }
  }

  isStorageAvailable(): boolean {
    return this.isAvailable
  }
}

export const storage = new LocalStorageManager()
export { STORAGE_KEYS }
