import type { Conversation, Message } from '../chat/types'
import { storage, STORAGE_KEYS } from './localStorage'

const MAX_CONVERSATIONS = 50

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

export function generateMessageId(): string {
  return 'msg_' + generateId()
}

export function createConversation(modelUsed: string): Conversation {
  return {
    id: generateId(),
    title: 'Nueva conversación',
    messages: [],
    modelUsed,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function loadConversations(): Conversation[] {
  return storage.get<Conversation[]>(STORAGE_KEYS.CONVERSATIONS) ?? []
}

export function saveConversations(conversations: Conversation[]): boolean {
  const pruned = conversations
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)
  return storage.set(STORAGE_KEYS.CONVERSATIONS, pruned)
}

export function getConversation(id: string): Conversation | undefined {
  return loadConversations().find(c => c.id === id)
}

export function saveConversation(conversation: Conversation): boolean {
  const conversations = loadConversations()
  const index = conversations.findIndex(c => c.id === conversation.id)

  if (index >= 0) {
    conversations[index] = conversation
  } else {
    conversations.unshift(conversation)
  }

  return saveConversations(conversations)
}

export function deleteConversation(id: string): boolean {
  const conversations = loadConversations().filter(c => c.id !== id)
  return saveConversations(conversations)
}

export function updateConversationTitle(conversation: Conversation): Conversation {
  if (conversation.messages.length > 0 && conversation.title === 'Nueva conversación') {
    const firstUserMessage = conversation.messages.find(m => m.role === 'user')
    if (firstUserMessage) {
      const title = firstUserMessage.content.slice(0, 50)
      conversation.title = title.length < firstUserMessage.content.length ? title + '...' : title
    }
  }
  return conversation
}

export function addMessageToConversation(
  conversation: Conversation,
  role: 'user' | 'assistant',
  content: string
): Message {
  const message: Message = {
    id: generateMessageId(),
    role,
    content,
    timestamp: Date.now(),
  }

  conversation.messages.push(message)
  conversation.updatedAt = Date.now()

  return message
}

export function getCurrentConversationId(): string | null {
  return storage.get<string>(STORAGE_KEYS.CURRENT_CONVERSATION)
}

export function setCurrentConversationId(id: string | null): boolean {
  if (id === null) {
    storage.remove(STORAGE_KEYS.CURRENT_CONVERSATION)
    return true
  }
  return storage.set(STORAGE_KEYS.CURRENT_CONVERSATION, id)
}

export interface ConversationGroup {
  label: string
  conversations: Conversation[]
}

export function groupConversationsByPeriod(conversations: Conversation[]): ConversationGroup[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const sevenDaysStart = todayStart - 6 * 86400000
  const thirtyDaysStart = todayStart - 29 * 86400000

  const groups: Record<string, Conversation[]> = {
    Hoy: [],
    Ayer: [],
    'Últimos 7 días': [],
    'Últimos 30 días': [],
    Anteriores: [],
  }

  for (const conv of conversations) {
    const time = conv.updatedAt || conv.createdAt
    if (time >= todayStart) {
      groups.Hoy.push(conv)
    } else if (time >= yesterdayStart) {
      groups.Ayer.push(conv)
    } else if (time >= sevenDaysStart) {
      groups['Últimos 7 días'].push(conv)
    } else if (time >= thirtyDaysStart) {
      groups['Últimos 30 días'].push(conv)
    } else {
      groups.Anteriores.push(conv)
    }
  }

  return Object.entries(groups)
    .filter(([_, list]) => list.length > 0)
    .map(([label, list]) => ({ label, conversations: list }))
}
