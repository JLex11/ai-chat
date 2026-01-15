export function $(selector: string): HTMLElement | null {
  return document.querySelector(selector)
}

export function $all(selector: string): NodeListOf<HTMLElement> {
  return document.querySelectorAll(selector)
}

export function $id(id: string): HTMLElement | null {
  return document.getElementById(id)
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  innerHTML?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (innerHTML) el.innerHTML = innerHTML
  return el
}

export function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight
}
