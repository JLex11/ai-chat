export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
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
  selectedPrompt: string
}

export interface ModelConfig {
  id: string
  name: string
  description: string
  size: string
  speed: 'fast' | 'medium' | 'slow'
  recommended: boolean
}

export interface SystemPromptConfig {
  id: string
  name: string
  prompt: string
}

export interface ChatState {
  isLoading: boolean
  isGenerating: boolean
  modelStatus: string
  currentConversationId: string | null
}

export type InitProgressCallback = (info: { text: string; progress: number }) => void
