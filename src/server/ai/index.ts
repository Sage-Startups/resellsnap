import { getEnv } from '@/lib/env';
import { FakeAIProvider } from './fake-provider';
import { OpenAIProvider } from './openai-provider';
import type { AIProvider } from './provider';

export * from './provider';
export * from './schemas';
export * from './prompts';

let provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (provider) return provider;
  provider = getEnv().AI_PROVIDER === 'fake' ? new FakeAIProvider() : new OpenAIProvider();
  return provider;
}

export function setAIProviderForTests(next: AIProvider | null): void {
  provider = next;
}

export { FakeAIProvider, OpenAIProvider };
