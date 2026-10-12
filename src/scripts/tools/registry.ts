import type { ToolDefinition, ToolCall, ToolExecutionResult } from './types'
import { calculatorTool } from './implementations/calculator'
import { clockTool } from './implementations/clock'
import { docReaderTool } from './implementations/docReader'
import { textSearchTool } from './implementations/textSearch'

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()

  constructor() {
    this.register(calculatorTool)
    this.register(clockTool)
    this.register(docReaderTool)
    this.register(textSearchTool)
  }

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool)
  }

  public unregister(toolId: string): boolean {
    return this.tools.delete(toolId)
  }

  public getTool(id: string): ToolDefinition | undefined {
    return this.tools.get(id)
  }

  public getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  public async execute(toolId: string, args: Record<string, any>): Promise<ToolCall> {
    const tool = this.getTool(toolId)
    const callId = 'call_' + Math.random().toString(36).substring(2, 9)
    const start = performance.now()

    if (!tool) {
      const durationMs = Math.round(performance.now() - start)
      const result: ToolExecutionResult = {
        success: false,
        output: null,
        summary: `Herramienta desconocida: "${toolId}"`,
        error: `Tool "${toolId}" not found`,
      }
      return {
        id: callId,
        toolId,
        toolName: toolId,
        input: args,
        result,
        durationMs,
      }
    }

    try {
      const result = await Promise.resolve(tool.execute(args))
      const durationMs = Math.round(performance.now() - start)
      return {
        id: callId,
        toolId: tool.id,
        toolName: tool.name,
        input: args,
        result,
        durationMs,
      }
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start)
      const result: ToolExecutionResult = {
        success: false,
        output: null,
        summary: `Fallo inesperado al ejecutar "${tool.name}": ${err.message}`,
        error: err.message,
      }
      return {
        id: callId,
        toolId: tool.id,
        toolName: tool.name,
        input: args,
        result,
        durationMs,
      }
    }
  }

  /**
   * Genera una descripción legible y concisa del catálogo de herramientas
   * optimizada para modelos de lenguaje ligeros.
   */
  public generateToolsPrompt(): string {
    const toolDescriptions = this.getAllTools().map(t => {
      const paramList = t.parameters
        .map(p => `    - ${p.name} (${p.type}${p.required ? ', requerido' : ''}): ${p.description}`)
        .join('\n')
      return `- HERRAMIENTA: "${t.id}" (${t.name})\n  Descripción: ${t.description}\n  Parámetros:\n${paramList}`
    })

    return `### HERRAMIENTAS DISPONIBLES PARA VERIFICAR DATOS (GROUNDING):\n${toolDescriptions.join('\n\n')}\n\nSi necesitas verificar una operación matemática, una fecha o el contenido de un documento, indica:\n<tool_call name="NOMBRE_HERRAMIENTA">{"parametro": "valor"}</tool_call>`
  }
}

export const toolRegistry = new ToolRegistry()
