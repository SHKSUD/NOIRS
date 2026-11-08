import { anthropicLLM } from './anthropic-llm';
import { mockLLM } from './mock-llm';
import type { LLMProvider } from './types';

export type { Breakdown, LLMProvider } from './types';

// LLM_PROVIDER=mock|anthropic. Default: anthropic when a key is set, otherwise mock (runs with no keys).
export function getLLM(): LLMProvider {
  const pick = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
  return pick === 'anthropic' ? anthropicLLM : mockLLM;
}
