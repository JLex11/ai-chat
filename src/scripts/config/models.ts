import type { ModelConfig } from '../chat/types'

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 0.5B',
    description: 'Ultra ligero y muy rápido. Excelente comprensión y español.',
    size: '~350 MB',
    speed: 'fast',
    recommended: true,
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    description: 'Equilibrio óptimo entre tamaño, rapidez y razonamiento.',
    size: '~800 MB',
    speed: 'fast',
    recommended: false,
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B',
    description: 'Mayor conocimiento y fluidez multitarea manteniendo ligereza.',
    size: '~1.1 GB',
    speed: 'fast',
    recommended: false,
  },
]

export const DEFAULT_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'

export function getModelById(id: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find(m => m.id === id)
}

export function getDefaultModel(): ModelConfig {
  return AVAILABLE_MODELS.find(m => m.id === DEFAULT_MODEL) ?? AVAILABLE_MODELS[0]
}
