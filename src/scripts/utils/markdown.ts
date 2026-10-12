import { autoCloseMarkdown, createMarkdownParser } from 'comark'
import { renderHtmlFromDocument } from '@comark/html'
import { textContent, escapeHtml as comarkEscapeHtml } from 'comark/utils'
import { createHighlighter, type HighlighterGeneric } from 'shiki'

let highlighter: HighlighterGeneric<any, any> | null = null
let initPromise: Promise<void> | null = null

// Cache de bloques de código resaltados para maximizar velocidad en streaming
const highlightCache = new Map<string, string>()
const MAX_CACHE_SIZE = 150

export async function initMarkdown(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      highlighter = await createHighlighter({
        themes: ['github-dark'],
        langs: [
          'javascript',
          'typescript',
          'python',
          'java',
          'cpp',
          'csharp',
          'rust',
          'go',
          'php',
          'ruby',
          'bash',
          'html',
          'css',
          'json',
          'sql',
          'yaml',
          'markdown',
        ],
      })
    } catch (error) {
      console.error('Error al inicializar Shiki highlighter:', error)
    }
  })()

  return initPromise
}

export function escapeHtml(text: string): string {
  return comarkEscapeHtml(text)
}

/**
 * Formatea bloques HTML/XML indentando etiquetas anidadas con 2 espacios.
 */
function formatHtml(code: string): string {
  const lines = code.split(/\r?\n/)
  const voidTags = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
    '!doctype',
  ])
  let indent = 0
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      result.push('')
      continue
    }

    const isClosingLine = /^<\/([a-zA-Z0-9:-]+)>/.test(trimmed)
    if (isClosingLine) {
      indent = Math.max(0, indent - 1)
    }

    result.push('  '.repeat(indent) + trimmed)

    const openMatch = trimmed.match(/^<([a-zA-Z0-9:-]+)[^>]*>/)
    const hasSelfClose = trimmed.endsWith('/>')
    const hasCloseSameLine = /<\/([a-zA-Z0-9:-]+)>\s*$/.test(trimmed)
    const isCommentOrDoc = trimmed.startsWith('<!--') || trimmed.startsWith('<!')

    if (openMatch && !hasSelfClose && !hasCloseSameLine && !isCommentOrDoc) {
      const tagName = openMatch[1].toLowerCase()
      if (!voidTags.has(tagName)) {
        indent++
      }
    }
  }

  return result.join('\n')
}

/**
 * Normaliza tabulaciones, sangría común (dedent) y formato básico del código:
 * 1. Expande tabuladores a 2 espacios.
 * 2. Detecta y corrige el lenguaje si el modelo especificó 'markdown'/'code' pero es HTML o JSON.
 * 3. Aplica indentación limpia y segura en JSON y HTML.
 * 4. Remueve sangría base común (dedent) y espacios redundantes al final de cada línea.
 */
export function formatCodeBlock(
  rawCode: string,
  rawLang: string = 'code'
): { code: string; lang: string } {
  if (!rawCode) return { code: '', lang: rawLang }

  let lang = rawLang.toLowerCase().trim()
  let code = rawCode.replace(/\t/g, '  ')
  const trimmed = code.trim()

  // Detección y corrección de lenguaje si el modelo etiquetó erróneamente HTML o JSON como markdown/code
  if (
    (lang === 'markdown' || lang === 'code' || !lang) &&
    (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html'))
  ) {
    lang = 'html'
  } else if (
    (lang === 'markdown' || lang === 'code' || !lang) &&
    ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')))
  ) {
    try {
      JSON.parse(trimmed)
      lang = 'json'
    } catch {
      // Ignorar si no es JSON válido
    }
  }

  // Formateo específico seguro por lenguaje
  if (lang === 'json') {
    try {
      code = JSON.stringify(JSON.parse(trimmed), null, 2)
      return { code, lang }
    } catch {
      // Fallback a normalización estándar
    }
  } else if (lang === 'html' || lang === 'xml' || lang === 'svg') {
    try {
      code = formatHtml(code)
    } catch {
      // Fallback a normalización estándar
    }
  }

  // Dedent general y limpieza de líneas
  const lines = code.split(/\r?\n/)
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()

  if (lines.length === 0) return { code: '', lang }

  let minIndent = Infinity
  for (const line of lines) {
    if (line.trim() === '') continue
    const match = line.match(/^ */)
    const leading = match ? match[0].length : 0
    if (leading < minIndent) minIndent = leading
  }

  if (minIndent > 0 && minIndent !== Infinity) {
    code = lines
      .map((line) => (line.trim() === '' ? '' : line.slice(minIndent).trimEnd()))
      .join('\n')
  } else {
    code = lines.map((line) => line.trimEnd()).join('\n')
  }

  return { code, lang }
}

/**
 * Limpia y normaliza bloques de código markdown para evitar errores comunes de modelos LLM:
 * 1. Delimitadores huérfanos o desbalanceados al final del texto (sin contenido posterior).
 * 2. Cierre adecuado de bloques de código incompletos.
 * 3. Eliminación de bloques de código vacíos.
 */
export function sanitizeMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return ''

  const lines = text.split(/\r?\n/)
  const blocks: { openIndex: number; closeIndex: number }[] = []
  let inBlock = false
  let fenceChar = ''
  let fenceLen = 0
  let openLineIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!inBlock) {
      const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/)
      if (match) {
        fenceChar = match[2][0]
        fenceLen = match[2].length
        inBlock = true
        openLineIndex = i
      }
    } else {
      const closeRegex = new RegExp(`^( {0,3})${fenceChar === '`' ? '`' : '~'}{${fenceLen},}\\s*$`)
      if (closeRegex.test(line)) {
        blocks.push({ openIndex: openLineIndex, closeIndex: i })
        inBlock = false
        fenceChar = ''
        fenceLen = 0
        openLineIndex = -1
      }
    }
  }

  // 1. Eliminar bloques de código completamente vacíos
  for (let b = blocks.length - 1; b >= 0; b--) {
    const { openIndex, closeIndex } = blocks[b]
    const contentLines = lines.slice(openIndex + 1, closeIndex)
    const isEmpty = contentLines.every((l) => l.trim() === '')
    if (isEmpty) {
      lines.splice(openIndex, closeIndex - openIndex + 1)
    }
  }

  // 2. Si quedó un bloque abierto al final (inBlock === true)
  if (inBlock && openLineIndex !== -1) {
    const remainingLines = lines.slice(openLineIndex + 1)
    const isRestEmpty = remainingLines.every((l) => l.trim() === '')
    if (isRestEmpty) {
      // Delimitador huérfano sin código después -> descartarlo
      lines.splice(openLineIndex)
    } else {
      // Bloque legítimo sin cerrar -> cerrarlo adecuadamente con la longitud exacta
      lines.push(fenceChar.repeat(fenceLen))
    }
  }

  return lines.join('\n').trimEnd()
}

function renderCallout(type: string, content: string): string {
  const normalizedType = type.toLowerCase()
  let title = 'Nota'
  let borderColor = 'border-blue-500/30'
  let bgColor = 'bg-blue-500/5 dark:bg-blue-500/10'
  let iconSvg = `<svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`

  if (normalizedType === 'warning') {
    title = 'Advertencia'
    borderColor = 'border-amber-500/30'
    bgColor = 'bg-amber-500/5 dark:bg-amber-500/10'
    iconSvg = `<svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
  } else if (normalizedType === 'tip') {
    title = 'Consejo'
    borderColor = 'border-emerald-500/30'
    bgColor = 'bg-emerald-500/5 dark:bg-emerald-500/10'
    iconSvg = `<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>`
  } else if (normalizedType === 'danger' || normalizedType === 'error') {
    title = 'Importante'
    borderColor = 'border-red-500/30'
    bgColor = 'bg-red-500/5 dark:bg-red-500/10'
    iconSvg = `<svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
  }

  return `<div class="callout my-4 rounded-xl border ${borderColor} ${bgColor} p-4 text-[14px] leading-relaxed">
  <div class="flex items-center gap-2 font-medium text-[var(--text-primary)] mb-1">
    ${iconSvg}
    <span>${title}</span>
  </div>
  <div class="callout-body text-[var(--text-secondary)]">
    ${content}
  </div>
</div>`
}

function getComarkComponents() {
  return {
    pre: async (node: any) => {
      const attrs = node[1] || {}
      const rawCode = textContent(node).trimEnd()

      // Si el bloque de código está vacío o sólo contiene espacios/saltos de línea, no renderizar nada
      if (!rawCode.trim()) {
        return ''
      }

      const initialLang = (attrs.language || 'code').trim()
      const { code, lang } = formatCodeBlock(rawCode, initialLang)

      if (!code.trim()) {
        return ''
      }

      const cacheKey = `${lang}:${code}`

      let codeHtml = ''
      if (highlightCache.has(cacheKey)) {
        codeHtml = highlightCache.get(cacheKey)!
      } else if (highlighter) {
        try {
          codeHtml = highlighter.codeToHtml(code, {
            lang: lang || 'text',
            theme: 'github-dark',
          })
        } catch {
          codeHtml = `<pre class="shiki p-4 text-sm font-mono overflow-x-auto"><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`
        }
        if (highlightCache.size >= MAX_CACHE_SIZE) {
          const firstKey = highlightCache.keys().next().value
          if (firstKey !== undefined) highlightCache.delete(firstKey)
        }
        highlightCache.set(cacheKey, codeHtml)
      } else {
        codeHtml = `<pre class="shiki p-4 text-sm font-mono overflow-x-auto"><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`
      }

      return `<div class="code-block my-4 rounded-xl overflow-hidden border border-neutral-200/80 dark:border-neutral-800 bg-[#1e1e22] shadow-sm">
  <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d34] text-xs text-neutral-300 font-mono select-none">
    <span class="font-medium text-neutral-300">${escapeHtml(lang)}</span>
    <button type="button" class="copy-code-btn inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer" data-code="${encodeURIComponent(code)}" title="Copiar código">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
      <span>Copiar</span>
    </button>
  </div>
  <div class="code-content text-sm [&>pre]:!bg-transparent [&>pre]:!p-4 [&>pre]:!m-0 [&>pre]:overflow-x-auto [tab-size:2]">
    ${codeHtml}
  </div>
</div>`
    },
    alert: async ([, attrs, ...children]: any, { render }: any) => {
      const type = attrs?.type || 'info'
      return renderCallout(type, await render(children))
    },
    tip: async ([, , ...children]: any, { render }: any) => {
      return renderCallout('tip', await render(children))
    },
    note: async ([, , ...children]: any, { render }: any) => {
      return renderCallout('note', await render(children))
    },
    warning: async ([, , ...children]: any, { render }: any) => {
      return renderCallout('warning', await render(children))
    },
  }
}

/**
 * Renderiza Markdown de forma estática y asíncrona mediante Comark.
 */
export async function renderMarkdown(text: string): Promise<string> {
  if (!text || text.trim() === '') return ''
  const sanitized = sanitizeMarkdown(text)
  if (!sanitized.trim()) return ''
  const parser = createMarkdownParser()
  const doc = await parser(sanitized)
  return await renderHtmlFromDocument(doc, { components: getComarkComponents() })
}

/**
 * Crea una sesión de renderizado en streaming que aplica autoCloseMarkdown
 * y sincroniza la actualización del DOM vía requestAnimationFrame para 60fps constantes.
 */
export function createStreamingRenderer(onRender: (html: string) => void) {
  let pendingRaf: number | null = null
  let latestText = ''
  let isFinished = false
  const streamParser = createMarkdownParser()

  const updateFrame = async () => {
    pendingRaf = null
    if (isFinished || !latestText) return

    try {
      const sanitized = sanitizeMarkdown(latestText)
      const closed = autoCloseMarkdown(sanitized, { dropTrailingOpeners: true })
      const doc = await streamParser(closed, { streaming: true })
      const html = await renderHtmlFromDocument(doc, { components: getComarkComponents() })
      onRender(html)
    } catch (err) {
      console.warn('Error en streaming frame con Comark:', err)
    }
  }

  return {
    push(accumulatedText: string) {
      latestText = accumulatedText
      if (pendingRaf === null && !isFinished) {
        pendingRaf = requestAnimationFrame(updateFrame)
      }
    },
    async finish(finalText: string) {
      isFinished = true
      if (pendingRaf !== null) {
        cancelAnimationFrame(pendingRaf)
        pendingRaf = null
      }
      if (!finalText || finalText.trim() === '') {
        onRender('')
        return
      }
      try {
        const sanitized = sanitizeMarkdown(finalText)
        const doc = await streamParser(sanitized)
        const html = await renderHtmlFromDocument(doc, { components: getComarkComponents() })
        onRender(html)
      } catch {
        // En caso de cualquier error con el parser en streaming, fallback al parser estático
        const html = await renderMarkdown(finalText)
        onRender(html)
      }
    },
    reset() {
      isFinished = true
      if (pendingRaf !== null) {
        cancelAnimationFrame(pendingRaf)
        pendingRaf = null
      }
      latestText = ''
    },
  }
}
