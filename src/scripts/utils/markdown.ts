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
      const lang = (attrs.language || 'code').trim()
      const cacheKey = `${lang}:${rawCode}`

      let codeHtml = ''
      if (highlightCache.has(cacheKey)) {
        codeHtml = highlightCache.get(cacheKey)!
      } else if (highlighter) {
        try {
          codeHtml = highlighter.codeToHtml(rawCode, {
            lang: lang || 'text',
            theme: 'github-dark',
          })
        } catch {
          codeHtml = `<pre class="shiki p-4 text-sm font-mono overflow-x-auto"><code class="language-${escapeHtml(lang)}">${escapeHtml(rawCode)}</code></pre>`
        }
        if (highlightCache.size >= MAX_CACHE_SIZE) {
          const firstKey = highlightCache.keys().next().value
          if (firstKey !== undefined) highlightCache.delete(firstKey)
        }
        highlightCache.set(cacheKey, codeHtml)
      } else {
        codeHtml = `<pre class="shiki p-4 text-sm font-mono overflow-x-auto"><code class="language-${escapeHtml(lang)}">${escapeHtml(rawCode)}</code></pre>`
      }

      return `<div class="code-block my-4 rounded-xl overflow-hidden border border-neutral-200/80 dark:border-neutral-800 bg-[#1e1e22] shadow-sm">
  <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d34] text-xs text-neutral-300 font-mono select-none">
    <span class="font-medium text-neutral-300">${escapeHtml(lang)}</span>
    <button type="button" class="copy-code-btn inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer" data-code="${encodeURIComponent(rawCode)}" title="Copiar código">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
      <span>Copiar</span>
    </button>
  </div>
  <div class="code-content text-sm [&>pre]:!bg-transparent [&>pre]:!p-4 [&>pre]:!m-0 [&>pre]:overflow-x-auto">
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
  const parser = createMarkdownParser()
  const doc = await parser(text)
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
      const closed = autoCloseMarkdown(latestText, { dropTrailingOpeners: true })
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
        const doc = await streamParser(finalText)
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
