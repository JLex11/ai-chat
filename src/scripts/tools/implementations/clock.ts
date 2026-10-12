import type { ToolDefinition, ToolExecutionResult } from '../types'

/**
 * Herramienta de Reloj del Sistema y Operaciones de Calendario
 * Provee la fecha y hora exacta del sistema local y cálculos de fechas.
 */

export function getCurrentDateTimeInfo(): {
  date: string
  time: string
  dayOfWeek: string
  timezone: string
  iso: string
  timestamp: number
} {
  const now = new Date()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'

  const dateStr = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const timeStr = now.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const dayOfWeek = now.toLocaleDateString('es-ES', { weekday: 'long' })

  return {
    date: dateStr,
    time: timeStr,
    dayOfWeek: dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
    timezone,
    iso: now.toISOString(),
    timestamp: now.getTime(),
  }
}

export function performDateMath(options: {
  baseDate?: string
  addDays?: number
  addHours?: number
  addMonths?: number
  diffWithDate?: string
}): {
  resultDate?: string
  diffDays?: number
  description: string
} {
  const base = options.baseDate ? new Date(options.baseDate) : new Date()
  if (isNaN(base.getTime())) {
    throw new Error(`Fecha base inválida: "${options.baseDate}"`)
  }

  if (options.diffWithDate) {
    const target = new Date(options.diffWithDate)
    if (isNaN(target.getTime())) {
      throw new Error(`Fecha objetivo inválida: "${options.diffWithDate}"`)
    }
    const diffMs = target.getTime() - base.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
    return {
      diffDays,
      description: `Diferencia entre ${base.toLocaleDateString('es-ES')} y ${target.toLocaleDateString('es-ES')}: ${diffDays} días.`,
    }
  }

  const result = new Date(base.getTime())
  if (options.addDays) {
    result.setDate(result.getDate() + options.addDays)
  }
  if (options.addHours) {
    result.setHours(result.getHours() + options.addHours)
  }
  if (options.addMonths) {
    result.setMonth(result.getMonth() + options.addMonths)
  }

  const formatted = result.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return {
    resultDate: formatted,
    description: `Fecha resultante: ${formatted}`,
  }
}

/**
 * Detector heurístico de consultas sobre fecha u hora.
 */
export function detectClockQuery(prompt: string): { action: 'now' | 'math'; details?: any } | null {
  const trimmed = prompt.trim().toLowerCase()

  // 1. Relativos: mañana / ayer
  if (
    trimmed.includes('mañana') &&
    (trimmed.includes('día') || trimmed.includes('dia') || trimmed.includes('fecha') || trimmed.includes('qué') || trimmed.includes('que'))
  ) {
    return { action: 'math', details: { addDays: 1 } }
  }
  if (
    trimmed.includes('ayer') &&
    (trimmed.includes('día') || trimmed.includes('dia') || trimmed.includes('fecha') || trimmed.includes('qué') || trimmed.includes('que'))
  ) {
    return { action: 'math', details: { addDays: -1 } }
  }

  // 2. Cálculos de fecha: "en X días/semanas/meses" o "hace X días"
  const inDaysMatch = trimmed.match(/(?:en|dentro\s+de)\s+(\d+)\s+d[íi]as/i)
  if (inDaysMatch) {
    return { action: 'math', details: { addDays: parseInt(inDaysMatch[1], 10) } }
  }
  const agoDaysMatch = trimmed.match(/hace\s+(\d+)\s+d[íi]as/i)
  if (agoDaysMatch) {
    return { action: 'math', details: { addDays: -parseInt(agoDaysMatch[1], 10) } }
  }
  const inWeeksMatch = trimmed.match(/(?:en|dentro\s+de)\s+(\d+)\s+semanas?/i)
  if (inWeeksMatch) {
    return { action: 'math', details: { addDays: parseInt(inWeeksMatch[1], 10) * 7 } }
  }
  const inMonthsMatch = trimmed.match(/(?:en|dentro\s+de)\s+(\d+)\s+mes(?:es)?/i)
  if (inMonthsMatch) {
    return { action: 'math', details: { addMonths: parseInt(inMonthsMatch[1], 10) } }
  }

  // 3. Consultas sobre fecha u hora actual
  const nowPatterns = [
    /(?:qu[ée]|que)\s+hora\s+es/i,
    /(?:qu[ée]|que)\s+d[íi]a\s+es/i,
    /(?:qu[ée]|que)\s+fecha\s+es/i,
    /(?:en\s+)?(?:qu[ée]|que)\s+fecha\s+estamos/i,
    /(?:cu[áa]l|cual)\s+es\s+la\s+fecha/i,
    /(?:cu[áa]l|cual)\s+es\s+la\s+hora/i,
    /(?:qu[ée]|que)\s+a[ñn]o\s+(?:es|estamos)/i,
    /(?:en\s+)?(?:qu[ée]|que)\s+mes\s+estamos/i,
    /(?:dame|dime)\s+la\s+hora/i,
    /(?:dame|dime)\s+la\s+fecha/i,
    /fecha\s+actual/i,
    /hora\s+actual/i,
  ]

  for (const pattern of nowPatterns) {
    if (pattern.test(trimmed)) {
      return { action: 'now' }
    }
  }

  return null
}

export const clockTool: ToolDefinition = {
  id: 'system_clock',
  name: 'Reloj y Calendario',
  description:
    'Obtiene la fecha, hora actual y zona horaria del sistema, o realiza cálculos de suma/resta de días sobre el calendario.',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: 'Acción a realizar: "current_time" para consultar la hora/fecha actual, o "date_math" para cálculos.',
      required: false,
      default: 'current_time',
    },
    {
      name: 'addDays',
      type: 'number',
      description: 'Días a sumar (o restar si es negativo) a la fecha actual.',
      required: false,
    },
    {
      name: 'addMonths',
      type: 'number',
      description: 'Meses a sumar a la fecha actual.',
      required: false,
    },
    {
      name: 'diffWithDate',
      type: 'string',
      description: 'Fecha en formato YYYY-MM-DD para calcular la diferencia de días respecto a hoy.',
      required: false,
    },
  ],
  execute: (args: Record<string, any>): ToolExecutionResult => {
    try {
      const action =
        args.action ||
        (args.addDays !== undefined || args.addMonths !== undefined || args.diffWithDate
          ? 'date_math'
          : 'current_time')

      if (action === 'date_math') {
        const mathRes = performDateMath({
          addDays: args.addDays,
          addMonths: args.addMonths,
          diffWithDate: args.diffWithDate,
        })
        return {
          success: true,
          output: mathRes,
          summary: mathRes.description,
          meta: mathRes,
        }
      }

      const info = getCurrentDateTimeInfo()
      return {
        success: true,
        output: info,
        summary: `Fecha actual: ${info.date}, Hora: ${info.time} (${info.timezone})`,
        meta: info,
      }
    } catch (err: any) {
      return {
        success: false,
        output: null,
        summary: `Error en reloj: ${err.message}`,
        error: err.message,
      }
    }
  },
}
