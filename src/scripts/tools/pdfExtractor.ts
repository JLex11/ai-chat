import * as pdfjs from 'pdfjs-dist'

// Configurar worker de PDF.js para navegador con CDN fallback seguro
if (typeof window !== 'undefined') {
  try {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
    }
  } catch (err) {
    console.warn('[PDFExtractor] No se pudo asignar workerSrc global:', err)
  }
}

/**
 * Extrae todo el contenido de texto legible de un archivo PDF a partir de un ArrayBuffer.
 */
export async function extractTextFromPdf(data: ArrayBuffer): Promise<string> {
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
    })

    const pdf = await loadingTask.promise
    const pageTexts: string[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        const pageStrings = textContent.items
          .map((item: any) => (item && typeof item.str === 'string' ? item.str : ''))
          .filter(Boolean)

        const pageText = pageStrings.join(' ').replace(/\s+/g, ' ').trim()
        if (pageText.length > 0) {
          pageTexts.push(`--- Página ${pageNum} ---\n${pageText}`)
        }
      } catch (pageErr) {
        console.warn(`[PDFExtractor] Error leyendo página ${pageNum}:`, pageErr)
      }
    }

    const fullText = pageTexts.join('\n\n').trim()
    return fullText
  } catch (error: any) {
    console.error('[PDFExtractor] Error procesando PDF:', error)
    throw new Error(`Error al leer el archivo PDF: ${error.message || 'Formato no soportado o protegido'}`)
  }
}
