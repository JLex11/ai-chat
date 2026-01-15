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
if (highlighter) {
try {
return highlighter.codeToHtml(text, {
lang: lang || "text",
theme: "github-dark",
});
} catch (e) {
console.warn(`Failed to highlight code block (${lang}):`, e);
return `<pre><code class="language-${lang}">${text}</code></pre>`;
}
}
console.warn("Highlighter not ready, using fallback");
return `<pre><code class="language-${lang}">${text}</code></pre>`;
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
