export interface ModelPricing {
  inputCostPerToken: number;
  outputCostPerToken: number;
}

interface LiteLLMModelData {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  mode?: string;
}

const LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

let cachedPricing: Record<string, ModelPricing> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchPricing(): Promise<Record<string, ModelPricing>> {
  if (cachedPricing && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPricing;
  }

  try {
    const response = await fetch(LITELLM_PRICING_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch pricing: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, LiteLLMModelData>;
    const pricing: Record<string, ModelPricing> = {};

    for (const [model, info] of Object.entries(data)) {
      if (model === 'sample_spec') continue;
      if (info.mode !== 'chat') continue;
      if (info.input_cost_per_token === undefined || info.output_cost_per_token === undefined) continue;

      pricing[model] = {
        inputCostPerToken: info.input_cost_per_token,
        outputCostPerToken: info.output_cost_per_token,
      };
    }

    cachedPricing = pricing;
    cacheTimestamp = Date.now();

    return pricing;
  } catch (err) {
    console.error('[LLM-Tracker] Failed to fetch pricing data:', err instanceof Error ? err.message : err);
    return cachedPricing ?? {};
  }
}

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  pricing: Record<string, ModelPricing>
): number | null {
  const modelPricing = pricing[model];
  if (!modelPricing) return null;

  const promptCost = promptTokens * modelPricing.inputCostPerToken;
  const completionCost = completionTokens * modelPricing.outputCostPerToken;

  return promptCost + completionCost;
}
