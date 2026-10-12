import { getAttachedDocuments } from './docReader'
import type { ToolDefinition, ToolExecutionResult } from '../types'

/**
 * Herramienta de Búsqueda y Análisis de Texto (Text Search & Analyzer)
 * Realiza conteo de palabras/caracteres, coincidencias regex, extracción de patrones (URLs, emails, números)
 * y filtrado de líneas.
 */

export function analyzeText(text: string): {
  characterCount: number
  characterCountNoSpaces: number
  wordCount: number
  lineCount: number
  sentenceCount: number
  paragraphsCount: number
} {
  const trimmed = text.trim()
  const characterCount = text.length
  const characterCountNoSpaces = text.replace(/\s/g, '').length
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0
  const lineCount = text ? text.split('\n').length : 0
  const sentenceCount = trimmed ? (trimmed.match(/[.!?]+(?:\s+|$)/g) || []).length || 1 : 0
  const paragraphsCount = trimmed ? trimmed.split(/\n\s*\n/).filter(Boolean).length : 0

  return {
    characterCount,
    characterCountNoSpaces,
    wordCount,
    lineCount,
    sentenceCount,
    paragraphsCount,
  }
}

export function searchInText(
  sourceOrOptions:
    | string
    | {
        sourceText: string
        pattern: string
        isRegex?: boolean
        caseSensitive?: boolean
        maxResults?: number
      },
  patternMaybe?: string,
  isRegexMaybe = false
): Array<{ match: string; index: number; line: number; preview: string }> {
  let sourceText = ''
  let pattern = ''
  let isRegex = false
  let caseSensitive = false
  let maxResults = 10

  if (typeof sourceOrOptions === 'string') {
    sourceText = sourceOrOptions
    pattern = patternMaybe || ''
    isRegex = isRegexMaybe
  } else {
    sourceText = sourceOrOptions.sourceText
    pattern = sourceOrOptions.pattern
    isRegex = sourceOrOptions.isRegex ?? false
    caseSensitive = sourceOrOptions.caseSensitive ?? false
    maxResults = sourceOrOptions.maxResults ?? 10
  }

  const results: Array<{ match: string; index: number; line: number; preview: string }> = []

  let regex: RegExp
  try {
    const flags = (caseSensitive ? '' : 'i') + 'g'
    if (isRegex) {
      regex = new RegExp(pattern, flags)
    } else {
      // Escapar caracteres especiales para búsqueda literal
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      regex = new RegExp(escaped, flags)
    }
  } catch (err: any) {
    throw new Error(`Expresión regular inválida: ${err.message}`)
  }

  const lines = sourceText.split('\n')
  let lineOffsets: number[] = [0]
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1)
  }

  function getLineNumber(charIndex: number): number {
    for (let i = 0; i < lineOffsets.length - 1; i++) {
      if (charIndex >= lineOffsets[i] && charIndex < lineOffsets[i + 1]) {
        return i + 1
      }
    }
    return lines.length
  }

  let match: RegExpExecArray | null
  while ((match = regex.exec(sourceText)) !== null) {
    const charIndex = match.index
    const lineNum = getLineNumber(charIndex)
    const lineContent = lines[lineNum - 1] || ''

    results.push({
      match: match[0],
      index: charIndex,
      line: lineNum,
      preview: lineContent.trim(),
    })

    if (results.length >= maxResults) break
    if (match.index === regex.lastIndex) {
      regex.lastIndex++
    }
  }

  return results
}

export function extractEntities(
  text: string,
  type: 'emails' | 'urls' | 'numbers' | 'ips'
): string[] {
  let regex: RegExp
  switch (type) {
    case 'emails':
      regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      break
    case 'urls':
      regex = /https?:\/\/[^\s/$.?#].[^\s]*/gi
      break
    case 'numbers':
      regex = /[-+]?\b\d+(?:\.\d+)?\b/g
      break
    case 'ips':
      regex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
      break
  }

  const matches = text.match(regex) || []
  return Array.from(new Set(matches))
}

export const textSearchTool: ToolDefinition = {
  id: 'text_search',
  name: 'Búsqueda y Análisis de Texto',
  description:
    'Realiza conteo métrico de palabras/caracteres, búsquedas de patrones textuales o regex, y extracción de entidades (URLs, correos, números).',
  category: 'text',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: 'Acción: "count", "search", "extract" o "filter_lines".',
      required: true,
      enum: ['count', 'search', 'extract', 'filter_lines'],
    },
    {
      name: 'text',
      type: 'string',
      description: 'El texto a procesar o analizar.',
      required: true,
    },
    {
      name: 'pattern',
      type: 'string',
      description: 'Patrón o palabra clave a buscar.',
      required: false,
    },
    {
      name: 'isRegex',
      type: 'boolean',
      description: 'Si el patrón debe interpretarse como expresión regular.',
      required: false,
      default: false,
    },
    {
      name: 'entityType',
      type: 'string',
      description: 'Tipo de entidad a extraer: "emails", "urls", "numbers", "ips".',
      required: false,
      enum: ['emails', 'urls', 'numbers', 'ips'],
    },
  ],
  async execute(params: Record<string, any>): Promise<ToolExecutionResult> {
    const action = String(params.action || 'count').toLowerCase()
    const rawText = String(params.text || '')
    const attached = getAttachedDocuments()
    const text = rawText || (attached.length > 0 ? attached[0].content : '')

    if (!text) {
      return {
        success: false,
        output: null,
        error: 'Se requiere texto o un documento adjunto para procesar el análisis.',
        summary: 'Error: No se proporcionó texto ni hay documentos adjuntos.',
      }
    }

    if (action === 'count') {
      const stats = analyzeText(text)
      return {
        success: true,
        output: stats,
        data: stats,
        summary: `${stats.wordCount} palabras, ${stats.characterCount} caracteres, ${stats.lineCount} líneas, ${stats.paragraphsCount} párrafos.`,
      }
    }

    if (action === 'search') {
      const pattern = String(params.pattern || '').trim()
      if (!pattern) {
        return {
          success: false,
          output: null,
          error: 'Parámetro "pattern" requerido para la búsqueda.',
          summary: 'Error: Patrón no especificado.',
        }
      }

      try {
        const matches = searchInText({
          sourceText: text,
          pattern,
          isRegex: Boolean(params.isRegex),
          maxResults: 15,
        })
        const matchData = {
          totalMatches: matches.length,
          pattern,
          results: matches,
        }
        return {
          success: true,
          output: matchData,
          data: matchData,
          summary: `Encontradas ${matches.length} coincidencia(s) de "${pattern}".`,
        }
      } catch (err: any) {
        return {
          success: false,
          output: null,
          error: err.message,
          summary: `Error en búsqueda: ${err.message}`,
        }
      }
    }

    if (action === 'extract') {
      const entityType = (params.entityType || 'emails') as
        | 'emails'
        | 'urls'
        | 'numbers'
        | 'ips'
      const entities = extractEntities(text, entityType)
      const extractData = {
        entityType,
        total: entities.length,
        items: entities,
      }
      return {
        success: true,
        output: extractData,
        data: extractData,
        summary: `Extraídas ${entities.length} entidades de tipo "${entityType}".`,
      }
    }

    if (action === 'filter_lines') {
      const pattern = String(params.pattern || '').toLowerCase()
      const lines = text.split('\n')
      const matching = lines.filter(l => l.toLowerCase().includes(pattern))
      const filterData = {
        totalMatched: matching.length,
        totalOriginal: lines.length,
        lines: matching,
      }
      return {
        success: true,
        output: filterData,
        data: filterData,
        summary: `${matching.length} de ${lines.length} líneas coinciden con el filtro.`,
      }
    }

    return {
      success: false,
      output: null,
      error: `Acción desconocida "${action}".`,
      summary: 'Acción no soportada.',
    }
  },
}
