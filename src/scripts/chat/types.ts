import type { ToolCall } from '../tools/types'

export interface ReasoningStep {
  step: 'planning' | 'tools' | 'draft' | 'validation' | 'refinement'
  title: string
  content: string
  durationMs?: number
  toolCalls?: ToolCall[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  skillUsed?: {
    id: string
    name: string
    icon?: string
  }
  reasoningSteps?: ReasoningStep[]
  toolCalls?: ToolCall[]
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  modelUsed: string
  createdAt: number
  updatedAt: number
}

export interface Preferences {
  selectedModel: string
  theme?: 'light' | 'dark'
  refinementMode?: boolean
}

export interface ModelConfig {
  id: string
  name: string
  description: string
  size: string
  speed: 'fast' | 'medium' | 'slow'
  recommended: boolean
}

export interface ChatState {
  isLoading: boolean
  isGenerating: boolean
  modelStatus: string
  currentConversationId: string | null
}

export type InitProgressCallback = (info: { text: string; progress: number }) => void
