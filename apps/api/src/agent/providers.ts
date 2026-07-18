import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';

export function getModel(provider: string, apiKey: string, modelId: string): LanguageModelV1 {
  switch (provider) {
    case 'openai': {
      const p = createOpenAI({ apiKey });
      return p.chat(modelId);
    }
    case 'anthropic': {
      const p = createAnthropic({ apiKey });
      return p.chat(modelId);
    }
    case 'google': {
      const p = createGoogleGenerativeAI({ apiKey });
      return p.chat(modelId);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export const PROVIDER_MODELS: Record<string, string[]> = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
  ],
  google: [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
};
