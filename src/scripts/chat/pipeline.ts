import { getEngine } from './engine'
import type { Message } from './types'
import type { Skill } from '../skills/types'
import {
  PLANNER_PROMPT,
  DRAFTER_PROMPT,
  VALIDATOR_PROMPT,
  REFINER_PROMPT,
} from '../config/prompts'
import type { ReasoningStep } from './types'
import {
  executePlanAndModelTools,
  formatGroundingContext,
  formatToolsStepContent,
  parseModelToolCalls,
} from '../tools/executor'
import { toolRegistry } from '../tools/registry'
import type { ToolCall } from '../tools/types'

export interface PipelineCallbacks {
  onStepChange?: (
    step: 'planning' | 'tools' | 'draft' | 'validation' | 'refinement',
    label: string
  ) => void
  onStepThought?: (
    step: 'planning' | 'tools' | 'draft' | 'validation' | 'refinement',
    delta: string,
    accumulated: string
  ) => void
  onChunk?: (chunk: string) => void
  onToolCall?: (toolCall: ToolCall) => void
}

export interface PipelineResult {
  finalResponse: string
  content?: string
  reasoningSteps: ReasoningStep[]
  correctionsApplied: boolean
  toolCalls?: ToolCall[]
}

let isPipelineAborted = false

export function abortPipeline(): void {
  isPipelineAborted = true
  const engine = getEngine()
  if (engine) {
    try {
      engine.interruptGenerate()
    } catch (e) {
      console.warn('[Pipeline] Error interrupting engine on abort:', e)
    }
  }
}

/**
 * Filtro de consultas triviales (saludos simples de una o dos palabras sin necesidad de agentes).
 */
export function isTrivialQuery(prompt: string): boolean {
  const p = prompt.trim().toLowerCase()
  const trivialPatterns = [
    /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|hey|hi|hello)[\s!.]*$/i,
    /^(gracias|muchas gracias|ok|vale|entendido|genial)[\s!.]*$/i,
    /^(qui[ée]n eres|c[oó]mo te llamas)[\s?.]*$/i,
  ]
  return trivialPatterns.some(pattern => pattern.test(p))
}

/**
 * Detecta bucles repetitivos en cadenas de texto para cortar a tiempo
 */
function detectRepetitionLoop(text: string): boolean {
  if (text.length < 100) return false
  const tail = text.slice(-180)
  for (let len = 20; len <= 60; len++) {
    const chunk = tail.slice(-len)
    const prevChunk = tail.slice(-len * 2, -len)
    if (chunk === prevChunk && chunk.length >= 20) {
      return true
    }
  }
  return false
}

/**
 * Recorta texto si cayó en un bucle repetitivo.
 */
function pruneRepetitionLoop(text: string): string {
  if (text.length < 100) return text
  for (let len = 20; len <= 80; len++) {
    const tail = text.slice(-len)
    const prev = text.slice(-len * 2, -len)
    if (tail === prev && tail.length >= 20) {
      return text.slice(0, -len).trim()
    }
  }
  return text
}

/**
 * Extrae un resumen ultracompacto del historial reciente para no saturar la ventana de contexto.
 */
function extractMinimalContext(history: Message[]): string {
  if (!history || history.length === 0) return ''
  const relevant = history.slice(-4)
  const parts: string[] = []

  const lastUser = [...relevant].reverse().find(m => m.role === 'user')
  const lastAssistant = [...relevant].reverse().find(m => m.role === 'assistant')

  if (lastUser) {
    const snippet = lastUser.content.slice(0, 90).replace(/\s+/g, ' ').trim()
    parts.push(`Usuario: "${snippet}${lastUser.content.length > 90 ? '...' : ''}"`)
  }
  if (lastAssistant) {
    const snippet = lastAssistant.content.slice(0, 110).replace(/\s+/g, ' ').trim()
    parts.push(`Asistente: "${snippet}${lastAssistant.content.length > 110 ? '...' : ''}"`)
  }

  if (parts.length === 0) return ''
  return `[Contexto previo: ${parts.join(' | ')}]\n\n`
}

/**
 * Ejecuta una llamada de inferencia con micro-contexto y protección contra bucles.
 */
async function runMicroStep(options: {
  systemPrompt: string
  userMessage: string
  maxTokens: number
  temperature: number
  topP?: number
  repetitionPenalty?: number
  onStreamChunk?: (accumulated: string, delta: string) => void
}): Promise<string> {
  const engine = getEngine()
  if (!engine) {
    throw new Error('Engine not initialized')
  }

  if (isPipelineAborted) {
    throw new Error('Pipeline aborted by user')
  }

  const messages = [
    { role: 'system' as const, content: options.systemPrompt },
    { role: 'user' as const, content: options.userMessage },
  ]

  const response = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: options.temperature,
    top_p: options.topP ?? 0.85,
    max_tokens: options.maxTokens,
    repetition_penalty: options.repetitionPenalty ?? 1.15,
    frequency_penalty: 0.25,
    presence_penalty: 0.1,
  })

  let accumulated = ''

  for await (const chunk of response) {
    if (isPipelineAborted) {
      try {
        engine.interruptGenerate()
      } catch {}
      throw new Error('Pipeline aborted by user')
    }

    const delta = chunk.choices[0]?.delta?.content ?? ''
    accumulated += delta

    if (options.onStreamChunk) {
      options.onStreamChunk(accumulated, delta)
    }

    if (detectRepetitionLoop(accumulated)) {
      try {
        engine.interruptGenerate()
      } catch {}
      accumulated = pruneRepetitionLoop(accumulated)
      if (options.onStreamChunk) {
        options.onStreamChunk(accumulated, '')
      }
      break
    }
  }

  return pruneRepetitionLoop(accumulated.trim())
}

/**
 * Orquestador principal del loop de razonamiento:
 * 1. Herramientas y Grounding inicial (lectura de documentos / cálculos / reloj)
 * 2. Planificador (alimentado con los hechos verificados)
 * 3. Borrador inicial asistido por herramientas
 * 4. Validador y auditor de hechos
 * 5. Refinamiento final estructurado
 */
export async function runAgenticPipeline(
  userPrompt: string,
  historyMessages: Message[],
  callbacks: PipelineCallbacks = {},
  activeSkill?: Skill | null
): Promise<PipelineResult> {
  isPipelineAborted = false
  const reasoningSteps: ReasoningStep[] = []
  const minimalHistory = extractMinimalContext(historyMessages)

  // ==========================================
  // PASO 1: HERRAMIENTAS Y GROUNDING DETERMINISTA
  // Se ejecutan en primer lugar para alimentar al planificador y al borrador
  // con la realidad factual de los documentos o cálculos solicitados.
  // ==========================================
  let toolCalls = await executePlanAndModelTools(userPrompt)
  let groundingContext = ''

  if (toolCalls.length > 0) {
    callbacks.onStepChange?.(
      'tools',
      `Ejecutando y verificando ${toolCalls.length} herramienta${toolCalls.length > 1 ? 's' : ''}...`
    )

    for (const tc of toolCalls) {
      callbacks.onToolCall?.(tc)
    }

    const toolsThought = formatToolsStepContent(toolCalls)
    callbacks.onStepThought?.('tools', '\n\n' + toolsThought, '')

    groundingContext = formatGroundingContext(toolCalls)

    reasoningSteps.push({
      step: 'tools',
      title: `Validación de datos con herramientas (${toolCalls.length})`,
      content: toolsThought,
      toolCalls,
    })
  }

  if (isPipelineAborted) throw new Error('Pipeline aborted by user')

  // ==========================================
  // PASO 2: PLANIFICADOR (Informado con Grounding)
  // ==========================================
  callbacks.onStepChange?.('planning', 'Planificando enfoque y puntos clave...')

  let plannerSystem = PLANNER_PROMPT
  if (activeSkill) {
    plannerSystem += `\nDirectiva obligatoria: Seguir habilidad "${activeSkill.name}" (${activeSkill.description}).`
  }

  const plannerUserMessage = `${minimalHistory}Consulta del usuario:\n${userPrompt}\n\n${groundingContext}Define de 2 a 3 puntos clave que la respuesta definitiva debe cubrir:`

  const planContent = await runMicroStep({
    systemPrompt: plannerSystem,
    userMessage: plannerUserMessage,
    maxTokens: 160,
    temperature: 0.2, // Determinista para evitar dispersión
    topP: 0.8,
    repetitionPenalty: 1.2,
    onStreamChunk: (accumulated, delta) => {
      callbacks.onStepThought?.('planning', delta, accumulated)
    },
  })

  reasoningSteps.push({
    step: 'planning',
    title: 'Planificación de puntos clave',
    content: planContent || '- Responder con claridad y precisión a la consulta.',
  })

  if (isPipelineAborted) throw new Error('Pipeline aborted by user')

  // Si el planificador sugiere llamadas a herramientas adicionales no ejecutadas
  const modelCalls = parseModelToolCalls(planContent)
  if (modelCalls.length > 0) {
    let newCallsMade = false
    for (const mc of modelCalls) {
      const already = toolCalls.some(c => c.toolId === mc.toolId)
      if (!already) {
        const executed = await toolRegistry.execute(mc.toolId, mc.args)
        toolCalls.push(executed)
        newCallsMade = true
      }
    }
    if (newCallsMade) {
      groundingContext = formatGroundingContext(toolCalls)
    }
  }

  // ==========================================
  // PASO 3: BORRADOR INICIAL (Asistido por datos verificados)
  // ==========================================
  callbacks.onStepChange?.('draft', 'Redactando borrador preliminar...')

  let drafterSystem = DRAFTER_PROMPT
  if (activeSkill) {
    drafterSystem += `\nInstrucciones específicas de habilidad:\n${activeSkill.systemPrompt}`
  }

  const drafterUserMessage = `${minimalHistory}Consulta del usuario:\n${userPrompt}\n\n${groundingContext}Plan acordado a desarrollar:\n${planContent}`

  const draftContent = await runMicroStep({
    systemPrompt: drafterSystem,
    userMessage: drafterUserMessage,
    maxTokens: 850,
    temperature: 0.4,
    topP: 0.9,
    repetitionPenalty: 1.15,
    onStreamChunk: (accumulated, delta) => {
      callbacks.onStepThought?.('draft', delta, accumulated)
    },
  })

  reasoningSteps.push({
    step: 'draft',
    title: 'Borrador preliminar',
    content: draftContent,
  })

  if (isPipelineAborted) throw new Error('Pipeline aborted by user')

  // ==========================================
  // PASO 4: VALIDADOR / CRÍTICO (Auditoría con Grounding)
  // ==========================================
  callbacks.onStepChange?.('validation', 'Validando coherencia y precisión...')

  let validatorSystem = VALIDATOR_PROMPT
  if (activeSkill) {
    validatorSystem += `\nVerifica especialmente que cumpla las pautas de: ${activeSkill.name}`
  }

  const validatorUserMessage = `Consulta original del usuario:\n${userPrompt}\n\n${groundingContext}Borrador preliminar a auditar:\n${draftContent}`

  const validationContent = await runMicroStep({
    systemPrompt: validatorSystem,
    userMessage: validatorUserMessage,
    maxTokens: 150,
    temperature: 0.1,
    topP: 0.7,
    repetitionPenalty: 1.2,
    onStreamChunk: (accumulated, delta) => {
      callbacks.onStepThought?.('validation', delta, accumulated)
    },
  })

  const isApproved =
    validationContent.toUpperCase().includes('APROBADO') &&
    !validationContent.includes('- ') &&
    !draftContent.includes('¿Cuál es la pregunta')

  reasoningSteps.push({
    step: 'validation',
    title: 'Validación y control de calidad',
    content: isApproved ? 'APROBADO' : validationContent,
  })

  if (isPipelineAborted) throw new Error('Pipeline aborted by user')

  // ==========================================
  // PASO 5: REFINAMIENTO FINAL
  // Si fue aprobado y no evade la pregunta, emitimos el borrador.
  // Si requiere correcciones, el refinador las aplica con streaming directo al usuario.
  // ==========================================
  callbacks.onStepChange?.('refinement', 'Generando respuesta definitiva...')

  let finalResponse = ''
  let correctionsApplied = false

  if (isApproved && draftContent.trim().length > 20) {
    callbacks.onStepThought?.(
      'refinement',
      'El borrador superó la validación sin requerir correcciones estructurales.',
      'El borrador superó la validación sin requerir correcciones estructurales.'
    )
    callbacks.onChunk?.(draftContent)
    finalResponse = draftContent
    correctionsApplied = false

    reasoningSteps.push({
      step: 'refinement',
      title: 'Refinamiento final',
      content: 'El borrador superó la validación sin requerir correcciones estructurales.',
    })
  } else {
    correctionsApplied = true
    let refinerSystem = REFINER_PROMPT
    if (activeSkill) {
      refinerSystem += `\nInstrucciones obligatorias de habilidad:\n${activeSkill.systemPrompt}`
    }

    const refinerUserMessage = `Consulta del usuario:\n${userPrompt}\n\n${groundingContext}Borrador previo:\n${draftContent}\n\nCorrecciones indicadas por el auditor:\n${validationContent}\n\nGenera la versión definitiva:`

    finalResponse = await runMicroStep({
      systemPrompt: refinerSystem,
      userMessage: refinerUserMessage,
      maxTokens: 950,
      temperature: 0.4,
      topP: 0.85,
      repetitionPenalty: 1.15,
      onStreamChunk: (_accumulated, delta) => {
        callbacks.onChunk?.(delta)
        callbacks.onStepThought?.('refinement', delta, _accumulated)
      },
    })

    reasoningSteps.push({
      step: 'refinement',
      title: 'Refinamiento final',
      content: `Se aplicaron correcciones:\n${validationContent}`,
    })
  }

  return {
    finalResponse,
    content: finalResponse,
    reasoningSteps,
    correctionsApplied,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}
