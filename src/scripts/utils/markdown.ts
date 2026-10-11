import { marked } from "marked";
import { createHighlighter } from "shiki";

let highlighter: any = null;
let initPromise: Promise<void> | null = null;

export async function initMarkdown() {
if (initPromise) return initPromise;

initPromise = (async () => {
try {
highlighter = await createHighlighter({
themes: ["github-dark"],
langs: [
"javascript",
"typescript",
"python",
"java",
"cpp",
"csharp",
"rust",
"go",
"php",
"ruby",
"bash",
"html",
"css",
"json",
"sql",
"yaml",
"markdown",
],
});
} catch (error) {
console.error("Failed to initialize highlighter:", error);
}
})();

return initPromise;
}

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const displayLang = (lang || 'code').trim();
      let codeHtml = '';
      if (highlighter) {
        try {
          codeHtml = highlighter.codeToHtml(text, {
            lang: lang || 'text',
            theme: 'github-dark',
          });
        } catch {
          codeHtml = `<pre class="shiki p-4 text-sm font-mono overflow-x-auto"><code class="language-${lang || 'text'}">${escapeHtml(text)}</code></pre>`;
        }
      } else {
        codeHtml = `<pre class="shiki p-4 text-sm font-mono overflow-x-auto"><code class="language-${lang || 'text'}">${escapeHtml(text)}</code></pre>`;
      }

      return `<div class="code-block my-4 rounded-xl overflow-hidden border border-neutral-200/80 dark:border-neutral-800 bg-[#1e1e22] shadow-sm">
  <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d34] text-xs text-neutral-300 font-mono select-none">
    <span class="font-medium text-neutral-300">${escapeHtml(displayLang)}</span>
    <button type="button" class="copy-code-btn inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer" data-code="${encodeURIComponent(text)}" title="Copiar código">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
      <span>Copiar</span>
    </button>
  </div>
  <div class="code-content text-sm [&>pre]:!bg-transparent [&>pre]:!p-4 [&>pre]:!m-0 [&>pre]:overflow-x-auto">
    ${codeHtml}
  </div>
</div>`;
    },
  },
});

marked.setOptions({
gfm: true,
breaks: true,
});

export function renderMarkdown(text: string): string {
return marked.parse(text) as string;
}

export function escapeHtml(text: string): string {
const div = document.createElement("div");
div.textContent = text;
return div.innerHTML;
}
