import {
  CreateWebWorkerMLCEngine,
  hasModelInCache,
  type ChatOptions,
  type WebWorkerMLCEngine,
} from '@mlc-ai/web-llm'
import type { InitProgressCallback, Message } from './types'
import { getSelectedModel } from '../storage/preferences'
import { getSystemPrompt } from '../config/prompts'
import type { Skill } from '../skills/types'

let engine: WebWorkerMLCEngine | null = null
let worker: Worker | null = null
let currentModelId: string | null = null

// Optimización de VRAM: límite de contexto razonable para WebGPU
export const DEFAULT_CHAT_OPTS: ChatOptions = {
  context_window_size: 4096,
}

export function getEngine(): WebWorkerMLCEngine | null {
  return engine
}

export function isEngineReady(): boolean {
  return engine !== null
}

export function getCurrentModelId(): string | null {
  return currentModelId
}

export async function checkIfModelIsCached(modelId: string): Promise<boolean> {
  try {
    return await hasModelInCache(modelId)
  } catch {
    return false
  }
}

export async function initEngine(
  modelId: string,
  onProgress: InitProgressCallback
): Promise<WebWorkerMLCEngine> {
  if (engine && worker) {
    return switchModel(modelId, onProgress)
  }

  worker = new Worker(new URL('../worker.ts', import.meta.url), {
    type: 'module',
  })

  engine = await CreateWebWorkerMLCEngine(
    worker,
    modelId,
    {
      initProgressCallback: onProgress,
    },
    DEFAULT_CHAT_OPTS
  )

  currentModelId = modelId
  return engine
}

export async function switchModel(
  newModelId: string,
  onProgress: InitProgressCallback
): Promise<WebWorkerMLCEngine> {
  if (engine) {
    engine.setInitProgressCallback(onProgress)
    await engine.reload(newModelId, DEFAULT_CHAT_OPTS)
    currentModelId = newModelId
    return engine
  }

  return initEngine(newModelId, onProgress)
}

export async function unloadEngine(): Promise<void> {
  if (engine) {
    await engine.unload()
    engine = null
  }
  if (worker) {
    worker.terminate()
    worker = null
  }
  currentModelId = null
}

export function getSystemMessage(activeSkill?: Skill | null): Message {
  return {
    id: 'system',
    role: 'system',
    content: getSystemPrompt(activeSkill),
    timestamp: Date.now(),
  }
}

export async function sendMessage(
  messages: Message[],
  onChunk: (text: string) => void,
  activeSkill?: Skill | null
): Promise<string> {
  if (!engine) {
    throw new Error('Engine not initialized')
  }

  const systemMessage = getSystemMessage(activeSkill)
  const allMessages = systemMessage
    ? [
        { role: systemMessage.role, content: systemMessage.content },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ]
    : messages.map(m => ({ role: m.role, content: m.content }))

  const response = await engine.chat.completions.create({
    messages: allMessages as { role: 'user' | 'assistant' | 'system'; content: string }[],
    stream: true,
    temperature: 0.7,
    top_p: 0.9,
    repetition_penalty: 1.05,
    max_tokens: 1500,
  })

  let fullText = ''

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content ?? ''
    fullText += content
    onChunk(fullText)
  }

  return fullText
}

export function stopGeneration(): void {
  if (engine) {
    try {
      engine.interruptGenerate()
    } catch (e) {
      console.warn('Error interrupting generation:', e)
    }
  }
}

export async function initChat(onProgress: InitProgressCallback): Promise<void> {
  const modelId = getSelectedModel()
  await initEngine(modelId, onProgress)
}
