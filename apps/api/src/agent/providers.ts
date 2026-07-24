import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';

// ── Well-known providers with native SDK support ──────────────────────────
// For everything else, we use OpenAI-compatible mode with a custom baseURL.

interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  modelId: string;
}

export function getModel(
  provider: string,
  apiKey: string,
  modelId: string,
  baseURL?: string,
): LanguageModelV1 {
  // Native SDK providers
  if (provider === 'openai' && !baseURL) {
    const p = createOpenAI({ apiKey });
    return p.chat(modelId);
  }

  if (provider === 'anthropic' && !baseURL) {
    const p = createAnthropic({ apiKey });
    return p.chat(modelId);
  }

  if (provider === 'google' && !baseURL) {
    const p = createGoogleGenerativeAI({ apiKey });
    return p.chat(modelId);
  }

  // Everything else: OpenAI-compatible mode
  // Works with: OpenRouter, DeepSeek, Qwen/Alibaba, Groq, Together,
  // Fireworks, Mistral, Ollama, LM Studio, vLLM, LiteLLM, and any
  // other provider that exposes an /v1/chat/completions endpoint.
  const resolvedBaseURL = baseURL || getBaseURLForProvider(provider);
  const p = createOpenAI({
    apiKey,
    baseURL: resolvedBaseURL,
  });
  return p.chat(modelId);
}

// ── Default base URLs for known OpenAI-compatible providers ───────────────
function getBaseURLForProvider(provider: string): string {
  const defaults: Record<string, string> = {
    openrouter: 'https://openrouter.ai/api/v1',
    deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    groq: 'https://api.groq.com/openai/v1',
    together: 'https://api.together.xyz/v1',
    fireworks: 'https://api.fireworks.ai/inference/v1',
    mistral: 'https://api.mistral.ai/v1',
    cohere: 'https://api.cohere.com/v2',
    novita: 'https://api.novita.ai/v3/openai',
    chutes: 'https://api.chutes.ai/v1',
    siliconflow: 'https://api.siliconflow.cn/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    moonshot: 'https://api.moonshot.cn/v1',
    minimax: 'https://api.minimax.chat/v1',
    baichuan: 'https://api.baichuan-ai.com/v1',
    yi: 'https://api.lingyiwanwu.com/v1',
    stepfun: 'https://api.stepfun.com/v1',
    openai: 'https://api.openai.com/v1',
    ollama: 'http://localhost:11434/v1',
  };
  return defaults[provider] || 'https://api.openai.com/v1';
}

// ── Provider metadata for UI display ─────────────────────────────────────
export interface ProviderInfo {
  id: string;
  name: string;
  baseURL: string;
  keyPrefix: string;
  keyPlaceholder: string;
  models: string[];
  native: boolean; // true = has native SDK, false = OpenAI-compatible
}

export const ALL_PROVIDERS: ProviderInfo[] = [
  // Native SDK providers
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini', 'gpt-3.5-turbo'],
    native: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    keyPrefix: 'sk-ant-',
    keyPlaceholder: 'sk-ant-...',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    native: true,
  },
  {
    id: 'google',
    name: 'Google AI',
    baseURL: 'https://generativelanguage.googleapis.com',
    keyPrefix: 'AIza',
    keyPlaceholder: 'AIza...',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    native: true,
  },
  // OpenAI-compatible providers
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    keyPrefix: 'sk-or-',
    keyPlaceholder: 'sk-or-...',
    models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'meta-llama/llama-3.1-405b-instruct', 'google/gemini-2.5-flash'],
    native: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    native: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    keyPrefix: 'gsk_',
    keyPlaceholder: 'gsk_...',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    native: false,
  },
  {
    id: 'qwen',
    name: 'Alibaba Qwen',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwq-plus'],
    native: false,
  },
  {
    id: 'together',
    name: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    keyPrefix: '',
    keyPlaceholder: 'your-api-key',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen-2.5-72B-Instruct-Turbo'],
    native: false,
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseURL: 'https://api.fireworks.ai/inference/v1',
    keyPrefix: 'fw_',
    keyPlaceholder: 'fw_...',
    models: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/deepseek-v3', 'accounts/fireworks/models/qwen-v2.5-72b-instruct'],
    native: false,
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseURL: 'https://api.mistral.ai/v1',
    keyPrefix: '',
    keyPlaceholder: 'your-api-key',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mixtral-8x22b'],
    native: false,
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI (GLM)',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    keyPrefix: '',
    keyPlaceholder: 'your-api-key',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
    native: false,
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    baseURL: 'https://api.moonshot.cn/v1',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    native: false,
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    baseURL: 'https://api.siliconflow.cn/v1',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'meta-llama/Llama-3.3-70B-Instruct'],
    native: false,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseURL: 'http://localhost:11434/v1',
    keyPrefix: '',
    keyPlaceholder: 'ollama',
    models: ['llama3.1', 'mistral', 'codellama', 'gemma2'],
    native: false,
  },
];

// ── Resolve a provider by ID ─────────────────────────────────────────────
export function getProviderInfo(id: string): ProviderInfo | undefined {
  return ALL_PROVIDERS.find(p => p.id === id);
}

// ── Legacy provider models map (kept for backward compat) ────────────────
export const PROVIDER_MODELS: Record<string, string[]> = Object.fromEntries(
  ALL_PROVIDERS.map(p => [p.id, p.models])
);
