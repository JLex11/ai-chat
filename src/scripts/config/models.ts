import type { ModelConfig } from '../chat/types'

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'SmolLM-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM 360M',
    description: 'Modelo ultra ligero. Ideal para pruebas rápidas.',
    size: '~400 MB',
    speed: 'fast',
    recommended: false,
  },
  {
    id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
    name: 'TinyLlama 1.1B',
    description: 'Modelo pequeño y rápido. Bueno para tareas simples.',
    size: '~700 MB',
    speed: 'fast',
    recommended: false,
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B',
    description: 'Modelo ligero de Google. Excelente calidad.',
    size: '~1.6 GB',
    speed: 'fast',
    recommended: true,
  },
  {
    id: 'Qwen2-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2 1.5B',
    description: 'Modelo compacto de Alibaba. Muy eficiente.',
    size: '~1.5 GB',
    speed: 'fast',
    recommended: false,
  },
  {
    id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
    name: 'Phi 3 Mini',
    description: 'Modelo de Microsoft. Bueno en razonamiento.',
    size: '~2.3 GB',
    speed: 'medium',
    recommended: false,
  },
  {
    id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.1 8B',
    description: 'Modelo potente de Meta. Requiere buena GPU.',
    size: '~4.5 GB',
    speed: 'slow',
    recommended: false,
  },
]

export const DEFAULT_MODEL = 'gemma-2-2b-it-q4f16_1-MLC'

export function getModelById(id: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find(m => m.id === id)
}

export function getDefaultModel(): ModelConfig {
  return AVAILABLE_MODELS.find(m => m.id === DEFAULT_MODEL) ?? AVAILABLE_MODELS[0]
}
