import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig } from '../types/workflow.js';

export class ProviderRegistry {
  private providers = new Map<string, ProviderConfig>();

  /** Register a named provider configuration */
  register(name: string, config: ProviderConfig): void {
    this.providers.set(name, config);
  }

  /** Create an AI SDK model instance from a "provider/model" reference */
  createModel(modelRef: string) {
    const slashIdx = modelRef.indexOf('/');
    if (slashIdx === -1) {
      throw new Error(
        `Model reference must be in "provider/model" format, got: "${modelRef}". ` +
        `Define providers in your workflow YAML and reference them like "deepseek/deepseek-chat".`
      );
    }

    const providerName = modelRef.slice(0, slashIdx);
    const modelId = modelRef.slice(slashIdx + 1);

    if (!this.providers.has(providerName)) {
      const available = [...this.providers.keys()].join(', ');
      throw new Error(
        `Provider "${providerName}" not defined. Available providers: ${available || '(none)'}. ` +
        `Add it to the "providers" section of your workflow YAML.`
      );
    }

    const config = this.providers.get(providerName)!;
    return this.createModelInstance(config, modelId);
  }

  private createModelInstance(config: ProviderConfig, modelId: string) {
    const type = config.type ?? 'openai-compatible';

    if (type === 'anthropic') {
      return anthropic(modelId) as any;
    }

    // OpenAI-compatible (DeepSeek, GLM, Qwen, Moonshot, etc.)
    const apiKey = config.api_key_env
      ? process.env[config.api_key_env]
      : process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const envVar = config.api_key_env ?? 'OPENAI_API_KEY';
      throw new Error(
        `API key not found. Set the ${envVar} environment variable.`
      );
    }

    const provider = createOpenAI({
      apiKey,
      baseURL: config.base_url,
    });

    return provider(modelId) as any;
  }
}
