import type { AIProvider } from './provider';
import { FakeAIProvider } from './fake-provider';
import { OpenAIProvider } from './openai-provider';

const DEFAULT_PROVIDER = 'fake';

type ProviderFactory = (config: Record<string, unknown>) => AIProvider;

const providerFactories = new Map<string, ProviderFactory>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  providerFactories.set(name, factory);
}

registerProvider('fake', (_config: Record<string, unknown>) => {
  return new FakeAIProvider({
    model: (_config.model as string) ?? 'fake-model-v1',
    embeddingDimensions: (_config.embeddingDimensions as number) ?? 384,
  });
});

registerProvider('openai', (config: Record<string, unknown>) => {
  const apiKey = config.apiKey as string;
  if (!apiKey) {
    throw new Error('OpenAI provider requires an API key');
  }
  return new OpenAIProvider({
    apiKey,
    model: config.model as string | undefined,
    embeddingModel: config.embeddingModel as string | undefined,
    embeddingDimensions: config.embeddingDimensions as number | undefined,
  });
});

let activeProvider: AIProvider | null = null;
let activeProviderName: string = DEFAULT_PROVIDER;
let activeProviderConfig: Record<string, unknown> = {};

export const KNOWN_PROVIDERS = ['fake', 'openai'] as const;

export function getProvider(): AIProvider {
  if (!activeProvider) {
    activeProvider = createProvider(activeProviderName, activeProviderConfig);
  }
  return activeProvider;
}

export function createProvider(name: string, config: Record<string, unknown> = {}): AIProvider {
  const factory = providerFactories.get(name);
  if (!factory) {
    throw new Error(
      'Unknown AI provider: "' + name + '". Known providers: ' + Array.from(providerFactories.keys()).join(', ')
    );
  }
  return factory(config);
}

export function getActiveProviderName(): string {
  return activeProviderName;
}

export function getActiveProviderConfig(): Record<string, unknown> {
  return { ...activeProviderConfig };
}

export function setActiveProvider(name: string, config: Record<string, unknown> = {}): void {
  if (!providerFactories.has(name)) {
    throw new Error(
      'Unknown AI provider: "' + name + '". Known providers: ' + Array.from(providerFactories.keys()).join(', ')
    );
  }

  if (name === 'openai' && !config.apiKey) {
    throw new Error('OpenAI provider requires an API key');
  }

  activeProviderName = name;
  activeProviderConfig = { ...config };
  activeProvider = null;
}
