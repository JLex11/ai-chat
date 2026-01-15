import { CreateWebWorkerMLCEngine, type WebWorkerMLCEngine } from '@mlc-ai/web-llm'
import type { InitProgressCallback, Message } from './types'
import { getSelectedModel, getSelectedPrompt } from '../storage/preferences'
import { getPromptById } from '../config/prompts'

let engine: WebWorkerMLCEngine | null = null
let currentModelId: string | null = null

export function getEngine(): WebWorkerMLCEngine | null {
  return engine
}

export function isEngineReady(): boolean {
  return engine !== null
}

export function getCurrentModelId(): string | null {
  return currentModelId
}

export async function initEngine(
  modelId: string,
  onProgress: InitProgressCallback
): Promise<WebWorkerMLCEngine> {
  const worker = new Worker(new URL('../worker.ts', import.meta.url), {
    type: 'module',
  })

  engine = await CreateWebWorkerMLCEngine(worker, modelId, {
    initProgressCallback: onProgress,
  })

  currentModelId = modelId
  return engine
}

export async function switchModel(
  newModelId: string,
  onProgress: InitProgressCallback
): Promise<WebWorkerMLCEngine> {
  if (engine) {
    await engine.unload()
    engine = null
  }

  return initEngine(newModelId, onProgress)
}

export function getSystemMessage(): Message | null {
  const promptId = getSelectedPrompt()
  const promptConfig = getPromptById(promptId)

  if (!promptConfig) return null

  return {
    id: 'system',
    role: 'system',
    content: promptConfig.prompt,
    timestamp: Date.now(),
  }
}

export async function sendMessage(
  messages: Message[],
  onChunk: (text: string) => void
): Promise<string> {
  if (!engine) {
    throw new Error('Engine not initialized')
  }

  const systemMessage = getSystemMessage()
  const allMessages = systemMessage
    ? [{ role: systemMessage.role, content: systemMessage.content }, ...messages.map(m => ({ role: m.role, content: m.content }))]
    : messages.map(m => ({ role: m.role, content: m.content }))

  const response = await engine.chat.completions.create({
    messages: allMessages as { role: 'user' | 'assistant' | 'system'; content: string }[],
    stream: true,
  })

  let fullText = ''

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content ?? ''
    fullText += content
    onChunk(fullText)
  }

  return fullText
}

export async function initChat(onProgress: InitProgressCallback): Promise<void> {
  const modelId = getSelectedModel()
  await initEngine(modelId, onProgress)
}
