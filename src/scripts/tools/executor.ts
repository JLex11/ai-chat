import { toolRegistry } from './registry'
import type { ToolCall } from './types'
import { detectMathQuery } from './implementations/calculator'
import { detectClockQuery } from './implementations/clock'
import { getAttachedDocuments, hasAttachedDocuments } from './implementations/docReader'

/**
 * Parsea llamadas a herramientas solicitadas por el modelo en su plan o razonamiento.
 * Soporta etiquetas XML <tool_call name="...">{"arg": "val"}</tool_call>
 * y notaciones [TOOL_CALL: name, args: {...}].
 */
export function parseModelToolCalls(text: string): Array<{ toolId: string; args: Record<string, any> }> {
  const calls: Array<{ toolId: string; args: Record<string, any> }> = []

  // 1. Sintaxis XML <tool_call name="...">...</tool_call>
  const xmlRegex = /<tool_call\s+name=["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)<\/tool_call>/gi
  let xmlMatch: RegExpExecArray | null
  while ((xmlMatch = xmlRegex.exec(text)) !== null) {
    const toolId = xmlMatch[1]
    let args: Record<string, any> = {}
    try {
      const raw = xmlMatch[2].trim()
      if (raw.startsWith('{') && raw.endsWith('}')) {
        args = JSON.parse(raw)
      } else if (raw) {
        args = { input: raw }
      }
    } catch {
      args = { input: xmlMatch[2].trim() }
    }
    calls.push({ toolId, args })
  }

  // 2. Sintaxis de corchetes [TOOL_CALL: name, args: {...}]
  const bracketRegex = /\[TOOL_CALL:\s*([a-zA-Z0-9_-]+)(?:,\s*args:\s*({[\s\S]*?}))?\]/gi
  let bracketMatch: RegExpExecArray | null
  while ((bracketMatch = bracketRegex.exec(text)) !== null) {
    const toolId = bracketMatch[1]
    let args: Record<string, any> = {}
    if (bracketMatch[2]) {
      try {
        args = JSON.parse(bracketMatch[2])
      } catch {
        args = { raw: bracketMatch[2] }
      }
    }
    calls.push({ toolId, args })
  }

  return calls
}

/**
 * Detección heurística rápida de necesidades deterministas en la consulta del usuario.
 * Permite ejecutar herramientas de forma automática sin esperar a que un modelo pequeño
 * genere una sintaxis compleja de llamadas.
 */
export async function detectHeuristicTools(userPrompt: string): Promise<ToolCall[]> {
  const toolCalls: ToolCall[] = []
  const pLower = userPrompt.toLowerCase().trim()

  // 1. Detección Matemática
  const mathExpr = detectMathQuery(userPrompt)
  if (mathExpr) {
    const call = await toolRegistry.execute('calculator', { expression: mathExpr })
    toolCalls.push(call)
  }

  // 2. Detección de Reloj / Fecha
  const clockDetect = detectClockQuery(userPrompt)
  if (clockDetect) {
    const call = await toolRegistry.execute('system_clock', {
      action: clockDetect.action === 'math' ? 'date_math' : 'current_time',
      addDays: clockDetect.details?.addDays,
      addMonths: clockDetect.details?.addMonths,
    })
    toolCalls.push(call)
  }

  // 3. Detección de Documentos Adjuntos
  if (hasAttachedDocuments()) {
    const docs = getAttachedDocuments()

    // Búsqueda de palabra específica en documento
    const searchMatch = userPrompt.match(/(?:busca|encuentra|buscar)\s+["']?([^"'.,]+)["']?/i)
    if (searchMatch && searchMatch[1]) {
      const call = await toolRegistry.execute('doc_reader', {
        action: 'search',
        query: searchMatch[1].trim(),
      })
      toolCalls.push(call)
    } else {
      // Lectura contextual del documento vinculada a la consulta
      const call = await toolRegistry.execute('doc_reader', {
        action: 'read',
        query: userPrompt,
      })
      toolCalls.push(call)
    }

    // Detección de análisis métrico si se solicitan palabras o caracteres
    if (
      pLower.includes('cuántas palabras') ||
      pLower.includes('cuantas palabras') ||
      pLower.includes('conteo de palabras') ||
      pLower.includes('cuántos caracteres') ||
      pLower.includes('cuantos caracteres')
    ) {
      const call = await toolRegistry.execute('text_search', {
        action: 'count',
        text: docs[0]?.content || '',
      })
      toolCalls.push(call)
    }
  }

  return toolCalls
}

/**
 * Ejecuta tanto herramientas detectadas heurísticamente como llamadas explícitas del modelo.
 */
export async function executePlanAndModelTools(
  userPrompt: string,
  plannerOutput?: string
): Promise<ToolCall[]> {
  const executedCalls: ToolCall[] = []

  // 1. Herramientas por detección heurística en la consulta
  const heuristicCalls = await detectHeuristicTools(userPrompt)
  executedCalls.push(...heuristicCalls)

  // 2. Herramientas sugeridas o solicitadas en el plan del modelo
  if (plannerOutput) {
    const modelCalls = parseModelToolCalls(plannerOutput)
    for (const call of modelCalls) {
      const alreadyRun = executedCalls.some(
        c => c.toolId === call.toolId && JSON.stringify(c.input) === JSON.stringify(call.args)
      )
      if (!alreadyRun) {
        const executed = await toolRegistry.execute(call.toolId, call.args)
        executedCalls.push(executed)
      }
    }
  }

  return executedCalls
}

/**
 * Formatea los resultados de ejecución de herramientas en un bloque estricto de Grounding
 * inyectando directamente los extractos reales para que el modelo no tenga dudas de los hechos.
 */
export function formatGroundingContext(toolCalls: ToolCall[]): string {
  if (toolCalls.length === 0) return ''

  const sections = toolCalls.map((tc, idx) => {
    const status = tc.result.success ? '✓ ÉXITO' : '✗ ERROR'
    let contentBlock = ''

    if (tc.toolId === 'doc_reader') {
      const docContent =
        typeof tc.result.output === 'string'
          ? tc.result.output
          : (tc.result.output?.content || tc.result.output?.preview || tc.result.summary)

      contentBlock = `\n   Contenido relevante del documento:\n"""\n${docContent}\n"""`
    } else if (tc.toolId === 'calculator') {
      contentBlock = `\n   Cálculo numérico verificado: ${tc.result.summary}`
    } else if (tc.toolId === 'system_clock') {
      contentBlock = `\n   Fecha/Hora verificada: ${tc.result.summary}`
    } else if (tc.toolId === 'text_search') {
      contentBlock = `\n   Análisis de texto verificado: ${tc.result.summary}`
    } else if (tc.result.output) {
      contentBlock = `\n   Datos: ${typeof tc.result.output === 'string' ? tc.result.output : JSON.stringify(tc.result.output)}`
    }

    return `${idx + 1}. [${tc.toolName} - ${status}]:\n   Resumen: ${tc.result.summary}${contentBlock}`
  })

  return `\n[DATOS DETERMINISTAS VERIFICADOS POR HERRAMIENTAS - GROUNDING]:\n${sections.join('\n\n')}\n\nDIRECTIVA CRÍTICA ANTI-ALUCINACIÓN:\n- Debes basar tu respuesta en estos datos verificados y en el contenido del documento anterior.\n- Resume, sintetiza y explica los puntos clave y cifras reales encontrados en el documento sin inventar ni omitir la información solicitada.\n\n`
}

/**
 * Convierte las llamadas de herramientas a formato legible para mostrar en el acordeón de pasos.
 */
export function formatToolsStepContent(toolCalls: ToolCall[]): string {
  if (toolCalls.length === 0) {
    return 'No se requirió el uso de herramientas externas para esta consulta.'
  }

  return toolCalls
    .map(tc => {
      const icon = tc.result.success ? '✅' : '⚠️'
      let preview = tc.result.summary

      if (tc.toolId === 'doc_reader') {
        const text =
          typeof tc.result.output === 'string'
            ? tc.result.output
            : (tc.result.output?.content || tc.result.output?.preview || '')
        if (text && text.length > 30) {
          const snippet = text.slice(0, 350).trim()
          preview = `${tc.result.summary}\n\n${snippet}${text.length > 350 ? '\n...' : ''}`
        }
      }

      return `### ${icon} ${tc.toolName} (\`${tc.toolId}\` - ${tc.durationMs}ms)\n- **Parámetros**: \`${JSON.stringify(tc.input)}\`\n- **Resultado verificado**:\n\`\`\`text\n${preview}\n\`\`\``
    })
    .join('\n\n')
}
