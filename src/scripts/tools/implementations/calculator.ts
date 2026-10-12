import type { ToolDefinition, ToolExecutionResult } from '../types'

/**
 * Evaluador matemático seguro (Safe Math Evaluator)
 * Basado en análisis léxico y gramatical descendente (Recursive Descent Parser).
 * No usa eval() ni new Function().
 */

type TokenType = 'NUMBER' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'IDENT' | 'EOF'

interface Token {
  type: TokenType
  value: string
  num?: number
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const len = expr.length

  while (i < len) {
    const ch = expr[i]

    if (/\s/.test(ch)) {
      i++
      continue
    }

    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < len && /[0-9]/.test(expr[i + 1]))) {
      let numStr = ''
      while (i < len && /[0-9.]/.test(expr[i])) {
        numStr += expr[i]
        i++
      }
      // Notación científica e.g. 1e-4 o 2.5e3
      if (i < len && (expr[i] === 'e' || expr[i] === 'E')) {
        numStr += expr[i]
        i++
        if (i < len && (expr[i] === '+' || expr[i] === '-')) {
          numStr += expr[i]
          i++
        }
        while (i < len && /[0-9]/.test(expr[i])) {
          numStr += expr[i]
          i++
        }
      }
      tokens.push({ type: 'NUMBER', value: numStr, num: Number(numStr) })
      continue
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' })
      i++
      continue
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' })
      i++
      continue
    }

    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',' })
      i++
      continue
    }

    // Operadores compuestos o simples
    if (ch === '*' && i + 1 < len && expr[i + 1] === '*') {
      tokens.push({ type: 'OP', value: '^' })
      i += 2
      continue
    }

    if ('+-*/%^'.includes(ch)) {
      tokens.push({ type: 'OP', value: ch })
      i++
      continue
    }

    // Identificadores (funciones y constantes)
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = ''
      while (i < len && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i]
        i++
      }
      tokens.push({ type: 'IDENT', value: ident.toLowerCase() })
      continue
    }

    // Símbolo de porcentaje
    if (ch === '%') {
      tokens.push({ type: 'OP', value: '%' })
      i++
      continue
    }

    i++
  }

  tokens.push({ type: 'EOF', value: '' })
  return tokens
}

class MathParser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '' }
  }

  private consume(): Token {
    const t = this.peek()
    if (this.pos < this.tokens.length) {
      this.pos++
    }
    return t
  }

  private match(type: TokenType, val?: string): boolean {
    const t = this.peek()
    if (t.type === type && (val === undefined || t.value === val)) {
      this.consume()
      return true
    }
    return false
  }

  public parse(): number {
    const res = this.expr()
    if (this.peek().type !== 'EOF') {
      throw new Error(`Sintaxis inválida cerca de: "${this.peek().value}"`)
    }
    return res
  }

  // expr = addSub
  private expr(): number {
    return this.addSub()
  }

  // addSub = mulDiv (('+' | '-') mulDiv)*
  private addSub(): number {
    let left = this.mulDiv()
    while (true) {
      if (this.match('OP', '+')) {
        left += this.mulDiv()
      } else if (this.match('OP', '-')) {
        left -= this.mulDiv()
      } else {
        break
      }
    }
    return left
  }

  // mulDiv = power (('*' | '/' | '%') power)*
  private mulDiv(): number {
    let left = this.power()
    while (true) {
      if (this.match('OP', '*')) {
        left *= this.power()
      } else if (this.match('OP', '/')) {
        const right = this.power()
        if (right === 0) throw new Error('División por cero')
        left /= right
      } else if (this.match('OP', '%')) {
        const right = this.power()
        if (right === 0) throw new Error('Módulo por cero')
        left %= right
      } else {
        break
      }
    }
    return left
  }

  // power = unary ('^' unary)*
  private power(): number {
    let left = this.unary()
    if (this.match('OP', '^')) {
      const right = this.power() // Asociatividad derecha
      return Math.pow(left, right)
    }
    return left
  }

  // unary = ('+' | '-')? factor
  private unary(): number {
    if (this.match('OP', '+')) {
      return this.unary()
    }
    if (this.match('OP', '-')) {
      return -this.unary()
    }
    return this.factor()
  }

  // factor = NUMBER | IDENT(args) | CONST | '(' expr ')'
  private factor(): number {
    const tok = this.peek()

    if (this.match('LPAREN')) {
      const val = this.expr()
      if (!this.match('RPAREN')) {
        throw new Error('Paréntesis sin cerrar')
      }
      return val
    }

    if (tok.type === 'NUMBER') {
      this.consume()
      return tok.num ?? 0
    }

    if (tok.type === 'IDENT') {
      this.consume()
      const name = tok.value

      // Constantes conocidas
      if (name === 'pi') return Math.PI
      if (name === 'e') return Math.E

      // Llamada a función: name '(' arg1, arg2... ')'
      if (this.match('LPAREN')) {
        const args: number[] = []
        if (!this.match('RPAREN')) {
          while (true) {
            args.push(this.expr())
            if (this.match('COMMA')) continue
            if (this.match('RPAREN')) break
            throw new Error(`Se esperaba ',' o ')' en llamada a función "${name}"`)
          }
        }
        return this.executeFunction(name, args)
      }

      throw new Error(`Identificador o constante desconocida: "${name}"`)
    }

    throw new Error(`Token inesperado: "${tok.value}"`)
  }

  private executeFunction(name: string, args: number[]): number {
    switch (name) {
      case 'sqrt':
        if (args.length !== 1) throw new Error('sqrt() requiere exactamente 1 argumento')
        if (args[0] < 0) throw new Error('Raíz cuadrada de número negativo no soportada en reales')
        return Math.sqrt(args[0])
      case 'cbrt':
        if (args.length !== 1) throw new Error('cbrt() requiere 1 argumento')
        return Math.cbrt(args[0])
      case 'abs':
        if (args.length !== 1) throw new Error('abs() requiere 1 argumento')
        return Math.abs(args[0])
      case 'round':
        if (args.length === 1) return Math.round(args[0])
        if (args.length === 2) {
          const factor = Math.pow(10, args[1])
          return Math.round(args[0] * factor) / factor
        }
        throw new Error('round() requiere 1 o 2 argumentos')
      case 'floor':
        if (args.length !== 1) throw new Error('floor() requiere 1 argumento')
        return Math.floor(args[0])
      case 'ceil':
        if (args.length !== 1) throw new Error('ceil() requiere 1 argumento')
        return Math.ceil(args[0])
      case 'sin':
        if (args.length !== 1) throw new Error('sin() requiere 1 argumento')
        return Math.sin(args[0])
      case 'cos':
        if (args.length !== 1) throw new Error('cos() requiere 1 argumento')
        return Math.cos(args[0])
      case 'tan':
        if (args.length !== 1) throw new Error('tan() requiere 1 argumento')
        return Math.tan(args[0])
      case 'asin':
        if (args.length !== 1) throw new Error('asin() requiere 1 argumento')
        return Math.asin(args[0])
      case 'acos':
        if (args.length !== 1) throw new Error('acos() requiere 1 argumento')
        return Math.acos(args[0])
      case 'atan':
        if (args.length !== 1) throw new Error('atan() requiere 1 argumento')
        return Math.atan(args[0])
      case 'log':
      case 'ln':
        if (args.length !== 1) throw new Error('log() requiere 1 argumento')
        return Math.log(args[0])
      case 'log10':
        if (args.length !== 1) throw new Error('log10() requiere 1 argumento')
        return Math.log10(args[0])
      case 'log2':
        if (args.length !== 1) throw new Error('log2() requiere 1 argumento')
        return Math.log2(args[0])
      case 'exp':
        if (args.length !== 1) throw new Error('exp() requiere 1 argumento')
        return Math.exp(args[0])
      case 'pow':
        if (args.length !== 2) throw new Error('pow(base, exp) requiere 2 argumentos')
        return Math.pow(args[0], args[1])
      case 'min':
        if (args.length === 0) throw new Error('min() requiere al menos 1 argumento')
        return Math.min(...args)
      case 'max':
        if (args.length === 0) throw new Error('max() requiere al menos 1 argumento')
        return Math.max(...args)
      case 'fact':
      case 'factorial': {
        if (args.length !== 1) throw new Error('factorial() requiere 1 argumento')
        const n = Math.floor(args[0])
        if (n < 0) throw new Error('Factorial de número negativo no existe')
        if (n > 170) throw new Error('Desbordamiento de factorial (n > 170)')
        let acc = 1
        for (let i = 2; i <= n; i++) acc *= i
        return acc
      }
      default:
        throw new Error(`Función desconocida: "${name}"`)
    }
  }
}

/**
 * Normaliza y resuelve expresiones de porcentajes comunes, e.g.:
 * "15% de 800" => "(15 / 100) * 800"
 * "20% * 500" => "(20 / 100) * 500"
 * "200 + 15%" => "200 + (200 * 0.15)"
 */
function normalizePercentages(expr: string): string {
  let cleaned = expr
    // "15% de 800" o "15% of 800"
    .replace(/(\d+(?:\.\d+)?)\s*%\s*(?:de|of)\s*(\d+(?:\.\d+)?)/gi, '($1 / 100) * $2')
    // "X + Y%" => X + (X * Y / 100)
    .replace(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*%/g, '$1 + ($1 * $2 / 100)')
    // "X - Y%" => X - (X * Y / 100)
    .replace(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%/g, '$1 - ($1 * $2 / 100)')
    // "Y%" standalone => (Y / 100)
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1 / 100)')

  // Sustituir multiplicación con x o X o ×
  cleaned = cleaned.replace(/(\d+)\s*[xX×]\s*(\d+)/g, '$1 * $2')
  // Sustituir división ÷
  cleaned = cleaned.replace(/÷/g, '/')

  return cleaned
}

/**
 * Ejecuta una expresión matemática de forma segura.
 */
export function evaluateMathExpression(expression: string): { result: number; formatted: string } {
  const normalized = normalizePercentages(expression.trim())
  const tokens = tokenize(normalized)
  const parser = new MathParser(tokens)
  const result = parser.parse()

  // Formato limpio: si es entero o con decimales razonables
  let formatted = String(result)
  if (Number.isFinite(result)) {
    if (!Number.isInteger(result)) {
      // Redondear a un máximo de 10 cifras decimales significativas para evitar ruido de punto flotante IEEE-754
      formatted = String(Number(result.toFixed(10)).toString())
    }
  }

  return { result, formatted }
}

/**
 * Detector heurístico para consultas matemáticas directas.
 */
export function detectMathQuery(prompt: string): string | null {
  const trimmed = prompt.trim()

  // 0. Expresiones verbales como "multiplica A por B", "divide A entre B", "suma A y B"
  const verbalOps = [
    { pattern: /(?:multiplica|multiplicar)\s+(\d+(?:\.\d+)?)\s+por\s+(\d+(?:\.\d+)?)/i, replace: "$1 * $2" },
    { pattern: /(?:divide|dividir)\s+(\d+(?:\.\d+)?)\s+(?:entre|por)\s+(\d+(?:\.\d+)?)/i, replace: "$1 / $2" },
    { pattern: /(?:suma|sumar)\s+(\d+(?:\.\d+)?)\s+y\s+(\d+(?:\.\d+)?)/i, replace: "$1 + $2" },
    { pattern: /(?:resta|restar)\s+(\d+(?:\.\d+)?)\s+(?:a|de)\s+(\d+(?:\.\d+)?)/i, replace: "$2 - $1" },
    { pattern: /(?:resta|restar)\s+(\d+(?:\.\d+)?)\s+menos\s+(\d+(?:\.\d+)?)/i, replace: "$1 - $2" },
  ];
  for (const v of verbalOps) {
    const vm = trimmed.match(v.pattern);
    if (vm) {
      return v.replace.replace("$1", vm[1]).replace("$2", vm[2]);
    }
  }

  // 1. Patrones claros de lenguaje natural
  const nlPatterns = [
    /(?:cuanto|cuánto)\s+es\s+([0-9\s+\-*/^%().,xX×a-z_]+?)(?=\s+(?:y\b|en\b|o\b|para\b|según\b|con\b|\?|$))/i,
    /(?:calcula|resolver|calculame|calcular)\s+([0-9\s+\-*/^%().,xX×a-z_]+?)(?=\s+(?:y\b|en\b|o\b|para\b|según\b|con\b|\?|$))/i,
    /(?:obtener|dame)\s+el\s+resultado\s+de\s+([0-9\s+\-*/^%().,xX×a-z_]+?)(?=\s+(?:y\b|en\b|o\b|para\b|según\b|con\b|\?|$))/i,
    /(\d+(?:\.\d+)?\s*%\s*(?:de|of)\s*\d+(?:\.\d+)?)/i,
  ]

  for (const pattern of nlPatterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      const candidate = match[1].replace(/[?¿!¡]/g, "").trim()
      if (
        /[\d]/.test(candidate) &&
        (/[+\-*/^%xX×]|sqrt|pow|log|min|max|fact|sin|cos|tan/i.test(candidate))
      ) {
        return candidate
      }
    }
  }

  // 2. Expresión matemática embebida clara (ej: "25 * 48" o "sqrt(256) + 10")
  const embeddedMath = trimmed.match(
    /\b(\d+(?:\.\d+)?\s*[+\-*/^%xX×]\s*\d+(?:\.\d+)?(?:\s*[+\-*/^%xX×]\s*\d+(?:\.\d+)?)*)\b/
  )
  if (embeddedMath && embeddedMath[1]) {
    return embeddedMath[1].trim()
  }

  // 3. Expresión aritmética directa pura (ej: "45 * 12 + 8" o "sqrt(144) + 10")
  const pureMathPattern =
    /^(?:[0-9\s+\-*/^%().,xX×]|sqrt|cbrt|abs|round|floor|ceil|sin|cos|tan|asin|acos|atan|log|ln|exp|pow|min|max|fact|factorial|pi|e)+$/i
  if (pureMathPattern.test(trimmed) && /[\d]/.test(trimmed) && /[+\-*/^%]/.test(trimmed)) {
    return trimmed
  }

  return null
}

export const calculatorTool: ToolDefinition = {
  id: 'calculator',
  name: 'Calculadora Matemática',
  description:
    'Realiza cálculos matemáticos de alta precisión (aritmética, porcentajes, potencias, raíces, funciones trigonométricas y estadísticas). Evita cualquier error numérico o alucinación.',
  parameters: [
    {
      name: 'expression',
      type: 'string',
      description: 'La expresión matemática a evaluar, e.g. "45 * 12 + 180", "sqrt(256)", "15% de 850".',
      required: true,
    },
  ],
  execute: (args: Record<string, any>): ToolExecutionResult => {
    const expr = String(args.expression || '').trim()
    if (!expr) {
      return {
        success: false,
        output: null,
        summary: 'Error: No se proporcionó ninguna expresión matemática.',
        error: 'Expresión vacía',
      }
    }

    try {
      const { result, formatted } = evaluateMathExpression(expr)
      return {
        success: true,
        output: result,
        summary: `${expr} = ${formatted}`,
        meta: { expression: expr, result, formatted },
      }
    } catch (err: any) {
      return {
        success: false,
        output: null,
        summary: `Error de cálculo en "${expr}": ${err.message}`,
        error: err.message,
      }
    }
  },
}
