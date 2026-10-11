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

// Optimización de VRAM y generación: límites y mitigación de bucles degenerativos
export const DEFAULT_CHAT_OPTS: ChatOptions = {
  context_window_size: 4096,
  repetition_penalty: 1.15,
  frequency_penalty: 0.3,
  presence_penalty: 0.1,
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

/**
 * Detecta si el texto generado ha entrado en un bucle degenerativo de repetición.
 */
export function detectRepetitionLoop(text: string): boolean {
  if (text.length < 60) return false

  // 1. Detección por líneas repetidas consecutivas (mínimo 16 caracteres para ignorar viñetas o sintaxis corta)
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 16)

  if (lines.length >= 3) {
    const last = lines[lines.length - 1]
    const prev1 = lines[lines.length - 2]
    const prev2 = lines[lines.length - 3]
    if (last === prev1 && prev1 === prev2) {
      return true
    }
  }

  // 2. Detección por oraciones consecutivas repetidas (separadas por . ! ?)
  const sentences = text
    .split(/[\n.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 16)

  if (sentences.length >= 3) {
    const last = sentences[sentences.length - 1]
    const prev1 = sentences[sentences.length - 2]
    const prev2 = sentences[sentences.length - 3]
    if (last === prev1 && prev1 === prev2) {
      return true
    }
  }

  // 3. Detección por bloques periódicos en la cola del texto
  const tail = text.slice(-300).trim()
  for (let len = 16; len <= Math.floor(tail.length / 3); len++) {
    const chunk1 = tail.slice(-len).trim()
    const chunk2 = tail.slice(-2 * len, -len).trim()
    const chunk3 = tail.slice(-3 * len, -2 * len).trim()
    if (chunk1.length >= 16 && chunk1 === chunk2 && chunk2 === chunk3) {
      return true
    }
  }

  return false
}

/**
 * Limpia y recorta las repeticiones redundantes al final del texto para no contaminar
 * la interfaz ni el contexto de conversación en turnos siguientes.
 */
export function pruneRepetitionLoop(text: string): string {
  const lines = text.split('\n')
  const resultLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (
      trimmed.length >= 16 &&
      resultLines.length > 0 &&
      resultLines[resultLines.length - 1].trim() === trimmed
    ) {
      continue
    }
    resultLines.push(line)
  }

  let cleaned = resultLines.join('\n').trimEnd()
  const sentencePattern = /([^.!?\n]{16,}[.!?])(\s*\1){2,}/g
  cleaned = cleaned.replace(sentencePattern, '$1')

  return cleaned
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
    repetition_penalty: 1.15,
    frequency_penalty: 0.3,
    presence_penalty: 0.1,
    max_tokens: 1500,
  })

  let fullText = ''

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content ?? ''
    fullText += content

    if (detectRepetitionLoop(fullText)) {
      console.warn('[WebLLM] Bucle de repetición detectado. Interrumpiendo generación.')
      try {
        engine.interruptGenerate()
      } catch (e) {
        console.warn('Error al interrumpir generación en bucle:', e)
      }
      fullText = pruneRepetitionLoop(fullText)
      onChunk(fullText)
      break
    }

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
