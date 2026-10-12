import type { AttachedDocument, ToolDefinition, ToolExecutionResult } from '../types'

let attachedDocuments: AttachedDocument[] = []
let docListeners: Array<(docs: AttachedDocument[]) => void> = []

function notifyListeners(): void {
  for (const listener of docListeners) {
    try {
      listener([...attachedDocuments])
    } catch (e) {
      console.warn('[DocReader] Error in document listener:', e)
    }
  }
}

export function subscribeToDocuments(listener: (docs: AttachedDocument[]) => void): () => void {
  docListeners.push(listener)
  listener([...attachedDocuments])
  return () => {
    docListeners = docListeners.filter(l => l !== listener)
  }
}

export function getAttachedDocuments(): AttachedDocument[] {
  return [...attachedDocuments]
}

export function hasAttachedDocuments(): boolean {
  return attachedDocuments.length > 0
}

export function getDocumentById(id: string): AttachedDocument | undefined {
  return attachedDocuments.find(d => d.id === id)
}

export function getDocumentByName(name: string): AttachedDocument | undefined {
  const lower = name.toLowerCase().trim()
  return attachedDocuments.find(
    d => d.name.toLowerCase().trim() === lower || d.name.toLowerCase().includes(lower)
  )
}

/**
 * Divide el documento en fragmentos de texto coherentes respetando párrafos y saltos de línea.
 */
function createChunks(content: string, chunkSize = 1000): string[] {
  if (content.length <= chunkSize) return [content]
  const chunks: string[] = []
  let index = 0

  while (index < content.length) {
    let nextIndex = Math.min(index + chunkSize, content.length)
    if (nextIndex < content.length) {
      const lastNewline = content.lastIndexOf('\n', nextIndex)
      if (lastNewline > index + 250) {
        nextIndex = lastNewline + 1
      }
    }
    const chunk = content.slice(index, nextIndex).trim()
    if (chunk) {
      chunks.push(chunk)
    }
    index = nextIndex
  }
  return chunks.length > 0 ? chunks : [content]
}

export function attachDocument(
  name: string,
  content: string,
  type = 'text/plain'
): AttachedDocument {
  const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const doc: AttachedDocument = {
    id,
    name,
    type,
    size: content.length,
    uploadedAt: Date.now(),
    content,
    chunks: createChunks(content),
  }
  attachedDocuments.push(doc)
  notifyListeners()
  return doc
}

export function removeDocument(id: string): boolean {
  const initialLen = attachedDocuments.length
  attachedDocuments = attachedDocuments.filter(d => d.id !== id)
  if (attachedDocuments.length !== initialLen) {
    notifyListeners()
    return true
  }
  return false
}

export function clearDocuments(): void {
  attachedDocuments = []
  notifyListeners()
}

/**
 * Busca coincidencias dentro de un documento y extrae fragmentos contextuales con números de línea.
 */
export function searchInDocument(
  docOrId: AttachedDocument | string,
  query: string,
  maxMatches = 6
): Array<{ lineNumber: number; line: string; context: string }> {
  const doc = typeof docOrId === 'string' ? getDocumentById(docOrId) : docOrId
  if (!doc) {
    return []
  }

  const lines = doc.content.split('\n')
  const qLower = query.toLowerCase()
  const results: Array<{ lineNumber: number; line: string; context: string }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.toLowerCase().includes(qLower)) {
      const start = Math.max(0, i - 1)
      const end = Math.min(lines.length - 1, i + 1)
      const context = lines.slice(start, end + 1).join('\n')
      results.push({
        lineNumber: i + 1,
        line: line.trim(),
        context,
      })
      if (results.length >= maxMatches) break
    }
  }

  return results
}

const STOPWORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con',
  'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí',
  'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre', 'también', 'me', 'hasta', 'hay',
  'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra',
  'otros', 'ese', 'eso', 'ante', 'ellos', 'esto', 'mí', 'antes', 'algunos', 'qué', 'cuál', 'cuáles',
  'resumen', 'resume', 'analiza', 'analizar', 'documento', 'archivo', 'adjunto', 'dime', 'explica',
  'the', 'and', 'or', 'in', 'to', 'for', 'with', 'what', 'is', 'are', 'about', 'from', 'this',
])

/**
 * Extrae inteligentemente el contenido relevante del documento.
 * - Si es < 3500 caracteres, devuelve el documento íntegro.
 * - Si es extenso y hay consulta, localiza los fragmentos con mayor coincidencia de términos clave.
 * - Si es extenso y la consulta es general, genera una vista sinóptica (introducción, estructura de títulos y conclusiones).
 */
export function extractSmartDocumentContent(
  doc: AttachedDocument,
  query?: string,
  maxChars = 3500
): { content: string; mode: 'full' | 'relevant_chunks' | 'overview'; summary: string } {
  // 1. Si el documento cabe completo, se entrega íntegro
  if (doc.content.length <= maxChars) {
    return {
      content: doc.content,
      mode: 'full',
      summary: `Contenido completo de "${doc.name}" (${doc.content.length} caracteres).`,
    }
  }

  const cleanQuery = (query || '').toLowerCase().trim()
  const rawTerms = cleanQuery
    .replace(/[¿?¡!.,:;()\[\]"']/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t))

  // 2. Si hay términos clave de búsqueda en la consulta
  if (rawTerms.length > 0 && doc.chunks.length > 1) {
    const scoredChunks = doc.chunks.map((chunk, idx) => {
      const lower = chunk.toLowerCase()
      let score = 0
      let matchCount = 0

      for (const term of rawTerms) {
        if (lower.includes(term)) {
          matchCount++
          score += 10
          // Bonificación si el término aparece múltiples veces
          const occurrences = lower.split(term).length - 1
          score += Math.min(occurrences, 4) * 2
        }
      }

      // Bonificación si aparecen términos contiguos o frase exacta
      if (cleanQuery.length > 5 && lower.includes(cleanQuery)) {
        score += 25
      }

      return { chunk, idx, score, matchCount }
    })

    const matchingChunks = scoredChunks
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)

    if (matchingChunks.length > 0) {
      // Tomar los mejores 2 a 3 fragmentos y ordenarlos cronológicamente
      const topSelected = matchingChunks.slice(0, 3).sort((a, b) => a.idx - b.idx)
      const excerpts = topSelected.map(
        item => `[Fragmento (Sección ${item.idx + 1} de ${doc.chunks.length})]:\n${item.chunk}`
      )
      const joined = excerpts.join('\n\n---\n\n')

      return {
        content: joined,
        mode: 'relevant_chunks',
        summary: `Se seleccionaron ${topSelected.length} secciones clave de "${doc.name}" vinculadas a los términos: ${rawTerms.slice(0, 3).join(', ')}.`,
      }
    }
  }

  // 3. Vista sinóptica para documentos extensos (Introducción + Estructura/Títulos + Conclusiones)
  const intro = doc.content.slice(0, 1200).trim()
  const outro = doc.content.slice(-1000).trim()

  // Extraer líneas que parecen encabezados o páginas
  const lines = doc.content.split('\n')
  const headings = lines
    .map(l => l.trim())
    .filter(
      l =>
        l.startsWith('#') ||
        l.startsWith('---') ||
        l.match(/^(cap[íi]tulo|secci[óo]n|p[áa]gina|tema|\d+\.)/i) ||
        (l.length > 4 && l.length < 50 && l === l.toUpperCase() && !l.includes(';'))
    )
    .slice(0, 12)

  let synopsis = `[SINOPSIS ESTRUCTURAL DE "${doc.name}" (${doc.content.length} caracteres totales, ${doc.chunks.length} bloques)]\n\n`
  synopsis += `--- APERTURA / INTRODUCCIÓN ---\n${intro}\n\n`
  if (headings.length > 0) {
    synopsis += `--- ÍNDICE / SECCIONES DETECTADAS ---\n${headings.map(h => `• ${h}`).join('\n')}\n\n`
  }
  synopsis += `--- CIERRE / CONCLUSIÓN ---\n${outro}`

  return {
    content: synopsis,
    mode: 'overview',
    summary: `Vista sinóptica estructurada de "${doc.name}" (apertura, ${headings.length} temas y cierre).`,
  }
}

export const docReaderTool: ToolDefinition = {
  id: 'doc_reader',
  name: 'Lector de Documentos',
  description:
    'Permite consultar, listar, buscar texto o inspeccionar fragmentos de documentos cargados en el chat (.pdf, .txt, .md, .csv, código, notas).',
  category: 'document',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: 'Acción a realizar: "read", "search", "stats" o "list".',
      required: true,
      enum: ['read', 'search', 'stats', 'list'],
    },
    {
      name: 'docId',
      type: 'string',
      description: 'Identificador del documento (o nombre parcial). Opcional si solo hay 1.',
      required: false,
    },
    {
      name: 'query',
      type: 'string',
      description: 'Término a buscar o tema de la consulta para enfocar la lectura.',
      required: false,
    },
    {
      name: 'chunkIndex',
      type: 'number',
      description: 'Índice de fragmento específico a leer (0 a N-1). Opcional.',
      required: false,
    },
  ],
  async execute(params: Record<string, any>): Promise<ToolExecutionResult> {
    const action = String(params.action || 'read').toLowerCase()

    if (action === 'list') {
      if (attachedDocuments.length === 0) {
        return {
          success: true,
          output: { total: 0, documents: [] },
          data: { total: 0, documents: [] },
          summary: 'No hay documentos adjuntos actualmente en el chat.',
        }
      }
      const docList = attachedDocuments.map(d => ({
        id: d.id,
        name: d.name,
        sizeBytes: d.size,
        chunksCount: d.chunks.length,
        type: d.type,
      }))
      return {
        success: true,
        output: docList,
        data: docList,
        summary: `${attachedDocuments.length} documento(s) disponible(s): ${attachedDocuments.map(d => d.name).join(', ')}`,
      }
    }

    if (attachedDocuments.length === 0) {
      return {
        success: false,
        output: null,
        error: 'No se encontraron documentos adjuntos en la sesión.',
        summary: 'Error: No hay documentos adjuntos para procesar.',
      }
    }

    // Identificar documento objetivo
    let targetDoc: AttachedDocument | undefined
    if (params.docId) {
      targetDoc =
        getDocumentById(String(params.docId)) || getDocumentByName(String(params.docId))
    }
    if (!targetDoc && attachedDocuments.length === 1) {
      targetDoc = attachedDocuments[0]
    }

    if (!targetDoc) {
      return {
        success: false,
        output: null,
        error: `Documento "${params.docId || ''}" no encontrado. Usa action="list" para ver identificadores disponibles.`,
        summary: 'Documento objetivo no identificado.',
      }
    }

    if (action === 'stats') {
      const stats = {
        id: targetDoc.id,
        name: targetDoc.name,
        type: targetDoc.type,
        characters: targetDoc.content.length,
        lines: targetDoc.content.split('\n').length,
        words: targetDoc.content.split(/\s+/).filter(Boolean).length,
        chunks: targetDoc.chunks.length,
      }
      return {
        success: true,
        output: stats,
        data: stats,
        summary: `Documento "${targetDoc.name}": ${stats.characters} caracteres, ${stats.words} palabras, ${stats.chunks} bloques.`,
      }
    }

    if (action === 'search') {
      const q = String(params.query || '').trim()
      if (!q) {
        return {
          success: false,
          output: null,
          error: 'Debes proporcionar un término "query" para buscar.',
          summary: 'Búsqueda sin término especificado.',
        }
      }
      const matches = searchInDocument(targetDoc, q)
      const searchData = {
        document: targetDoc.name,
        query: q,
        totalMatches: matches.length,
        results: matches,
      }
      return {
        success: true,
        output: searchData,
        data: searchData,
        summary: `Encontradas ${matches.length} coincidencia(s) de "${q}" en "${targetDoc.name}".`,
      }
    }

    if (action === 'read') {
      if (typeof params.chunkIndex === 'number') {
        const idx = Math.max(0, Math.min(targetDoc.chunks.length - 1, params.chunkIndex))
        const chunkData = {
          document: targetDoc.name,
          chunkIndex: idx,
          totalChunks: targetDoc.chunks.length,
          content: targetDoc.chunks[idx],
        }
        return {
          success: true,
          output: targetDoc.chunks[idx],
          data: chunkData,
          summary: `Bloque ${idx + 1}/${targetDoc.chunks.length} de "${targetDoc.name}".`,
        }
      }

      const q = typeof params.query === 'string' ? params.query : ''
      const extraction = extractSmartDocumentContent(targetDoc, q)

      return {
        success: true,
        output: extraction.content,
        data: {
          document: targetDoc.name,
          mode: extraction.mode,
          content: extraction.content,
          totalLength: targetDoc.content.length,
          chunksCount: targetDoc.chunks.length,
        },
        summary: extraction.summary,
      }
    }

    return {
      success: false,
      output: null,
      error: `Acción no soportada: "${action}"`,
      summary: 'Acción no válida.',
    }
  },
}
