import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
    SDKConfig,
    TrackingData,
    OpenAIChatParams,
    OpenAIChatResponse,
    OpenAIStreamParams,
    OpenAIStreamChunk,
    AzureChatParams,
    AzureChatResponse,
    AzureStreamParams,
    ClaudeMessageParams,
    ClaudeMessageResponse,
    ClaudeStreamParams,
    GeminiGenerateParams,
    GeminiGenerateResponse,
    BedrockChatParams,
    BedrockChatResponse,
    ProviderType,
    RetryConfig,
    StatsFilter,
    UsageStats
} from './types';
import { fetchPricing, calculateCost, ModelPricing } from './pricing';

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class LLMTrackerSDK {
  private openaiClient: OpenAI | null = null;
  private azureClient: OpenAI | null = null;
  private claudeClient: Anthropic | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private bedrockClient: unknown = null;
  private connected = false;
  private pricing: Record<string, ModelPricing> = {};
  private trackingQueue: TrackingData[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private readonly defaultRetry: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  };

  constructor(private config: SDKConfig) {
    if (config.apiKeys.openai) {
      this.openaiClient = new OpenAI({ apiKey: config.apiKeys.openai });
    }
    if (config.apiKeys.azure) {
      this.azureClient = new OpenAI({
        apiKey: config.apiKeys.azure.apiKey,
        baseURL: `${config.apiKeys.azure.endpoint}/openai/deployments/${config.apiKeys.azure.deployment ?? ''}`,
        defaultQuery: { 'api-version': config.apiKeys.azure.apiVersion ?? '2024-02-15-preview' },
        defaultHeaders: { 'api-key': config.apiKeys.azure.apiKey },
      });
    }
    if (config.apiKeys.claude) {
      this.claudeClient = new Anthropic({ apiKey: config.apiKeys.claude });
    }
    if (config.apiKeys.gemini) {
      this.geminiClient = new GoogleGenerativeAI(config.apiKeys.gemini);
    }
  }

  async connect(): Promise<void> {
    if (this.config.apiKeys.bedrock) {
      const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
      const bedrockConfig = this.config.apiKeys.bedrock;
      this.bedrockClient = new BedrockRuntimeClient({
        region: bedrockConfig.region,
        ...(bedrockConfig.accessKeyId && bedrockConfig.secretAccessKey
          ? {
              credentials: {
                accessKeyId: bedrockConfig.accessKeyId,
                secretAccessKey: bedrockConfig.secretAccessKey,
              },
            }
          : {}),
      });
    }

    const promises: Promise<unknown>[] = [fetchPricing()];
    if (this.config.database) {
      promises.push(this.config.database.connect());
    }

    const results = await Promise.all(promises);
    const fetchedPricing = results[0] as Record<string, ModelPricing>;

    this.pricing = { ...fetchedPricing, ...this.config.customPricing };
    this.connected = true;

    if (this.config.database && this.config.batchSize && this.config.batchIntervalMs) {
      this.startBatchProcessor();
    }
  }

  async disconnect(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    await this.flushBatch();
    if (this.config.database) {
      await this.config.database.disconnect();
    }
    this.connected = false;
  }

  async getStats(filter: StatsFilter = {}): Promise<UsageStats | null> {
    if (!this.config.database?.getStats) {
      console.warn('[LLM-Tracker] Database adapter not configured or does not support getStats');
      return null;
    }
    return this.config.database.getStats(filter);
  }

  get openai() {
    if (!this.openaiClient) throw new Error('OpenAI API key not configured');
    return {
      chat: {
        completions: {
          create: (params: OpenAIChatParams) => this.executeOpenAI(params),
          stream: (params: Omit<OpenAIStreamParams, 'stream'>) => this.streamOpenAI(params),
        },
      },
    };
  }

  get azure() {
    if (!this.azureClient) throw new Error('Azure OpenAI not configured');
    return {
      chat: {
        completions: {
          create: (params: AzureChatParams) => this.executeAzure(params),
          stream: (params: Omit<AzureStreamParams, 'stream'>) => this.streamAzure(params),
        },
      },
    };
  }

  get claude() {
    if (!this.claudeClient) throw new Error('Claude API key not configured');
    return {
      messages: {
        create: (params: ClaudeMessageParams) => this.executeClaude(params),
        stream: (params: Omit<ClaudeStreamParams, 'stream'>) => this.streamClaude(params),
      },
    };
  }

  get gemini() {
    if (!this.geminiClient) throw new Error('Gemini API key not configured');
    return {
      generateContent: (params: GeminiGenerateParams) => this.executeGemini(params),
    };
  }

  get bedrock() {
    if (!this.bedrockClient) throw new Error('AWS Bedrock not configured');
    return {
      chat: (params: BedrockChatParams) => this.executeBedrock(params),
    };
  }

  private async track(data: TrackingData): Promise<void> {
    if (!this.connected || !this.config.database) return;

    if (this.config.batchSize) {
      this.trackingQueue.push(data);
      if (this.trackingQueue.length >= this.config.batchSize) {
        await this.flushBatch();
      }
    } else {
      try {
        await this.config.database.save(data);
      } catch (err) {
        console.error('[LLM-Tracker] Failed to save tracking data:', err instanceof Error ? err.message : err);
      }
    }
  }

  private startBatchProcessor(): void {
    if (!this.config.batchIntervalMs) return;
    
    this.batchTimer = setInterval(() => {
      this.flushBatch().catch((err) => {
        console.error('[LLM-Tracker] Batch flush error:', err instanceof Error ? err.message : err);
      });
    }, this.config.batchIntervalMs);
  }

  private async flushBatch(): Promise<void> {
    if (this.trackingQueue.length === 0) return;

    const batch = this.trackingQueue.splice(0, this.trackingQueue.length);

    try {
      if (this.config.database?.saveBatch) {
        await this.config.database.saveBatch(batch);
      } else if (this.config.database) {
        await Promise.all(batch.map((data) => this.config.database!.save(data)));
      }
    } catch (err) {
      console.error('[LLM-Tracker] Failed to save batch:', err instanceof Error ? err.message : err);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, retryConfig?: RetryConfig): Promise<T> {
    const config = retryConfig ?? this.config.retry ?? this.defaultRetry;
    let lastError: Error | null = null;
    let delay = config.initialDelayMs;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        if (attempt === config.maxRetries) break;
        
        const isRetryable = this.isRetryableError(lastError);
        if (!isRetryable) break;

        await this.sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }

    throw lastError;
  }

  private isRetryableError(err: Error): boolean {
    const message = err.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('429') ||
      message.includes('econnreset') ||
      message.includes('network')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async executeOpenAI(params: OpenAIChatParams): Promise<OpenAIChatResponse> {
    return this.executeOpenAILike(params, 'openai', this.openaiClient!);
  }

  private async executeAzure(params: AzureChatParams): Promise<AzureChatResponse> {
    return this.executeOpenAILike(params, 'azure', this.azureClient!);
  }

  private async executeOpenAILike(
    params: OpenAIChatParams,
    provider: ProviderType,
    client: OpenAI
  ): Promise<OpenAIChatResponse> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
      const response = await this.withRetry(() => client.chat.completions.create(params));
      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;

      const costUsd = calculateCost(params.model, promptTokens, completionTokens, this.pricing);

      this.track({
        requestId,
        projectName: this.config.projectName,
        provider,
        model: params.model,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        costUsd,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return {
        ...response,
        usageInfo: {
          promptTokens,
          completionTokens,
          totalTokens: response.usage?.total_tokens ?? 0,
          costUsd,
        },
      };
    } catch (err) {
      this.track({
        requestId,
        projectName: this.config.projectName,
        provider,
        model: params.model,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: null,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async executeClaude(params: ClaudeMessageParams): Promise<ClaudeMessageResponse> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
      const response = await this.withRetry(() => this.claudeClient!.messages.create(params));
      const promptTokens = response.usage.input_tokens;
      const completionTokens = response.usage.output_tokens;

      const costUsd = calculateCost(params.model, promptTokens, completionTokens, this.pricing);

      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'claude',
        model: params.model,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        costUsd,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return {
        ...response,
        usageInfo: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          costUsd,
        },
      };
    } catch (err) {
      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'claude',
        model: params.model,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: null,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async executeGemini(params: GeminiGenerateParams): Promise<GeminiGenerateResponse> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const { model, ...rest } = params;

    try {
      const geminiModel = this.geminiClient!.getGenerativeModel({ model });
      const response = await this.withRetry(() => geminiModel.generateContent(rest));
      const promptTokens = response.response.usageMetadata?.promptTokenCount ?? 0;
      const completionTokens = response.response.usageMetadata?.candidatesTokenCount ?? 0;

      const costUsd = calculateCost(model, promptTokens, completionTokens, this.pricing);

      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'gemini',
        model,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: response.response.usageMetadata?.totalTokenCount ?? 0,
        },
        costUsd,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return {
        ...response,
        usageInfo: {
          promptTokens,
          completionTokens,
          totalTokens: response.response.usageMetadata?.totalTokenCount ?? 0,
          costUsd,
        },
      };
    } catch (err) {
      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'gemini',
        model,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: null,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async executeBedrock(params: BedrockChatParams): Promise<BedrockChatResponse> {
    const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
      const command = new ConverseCommand({
        modelId: params.modelId,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: [{ text: m.content }],
        })),
        system: params.system ? [{ text: params.system }] : undefined,
        inferenceConfig: {
          maxTokens: params.maxTokens ?? 4096,
          temperature: params.temperature,
        },
      });

      const client = this.bedrockClient as { send: (cmd: unknown) => Promise<unknown> };
      const response = (await client.send(command)) as {
        output?: { message?: { content?: Array<{ text?: string }> } };
        usage?: { inputTokens?: number; outputTokens?: number };
        stopReason?: string;
      };

      const content = response.output?.message?.content?.[0]?.text ?? '';
      const inputTokens = response.usage?.inputTokens ?? 0;
      const outputTokens = response.usage?.outputTokens ?? 0;

      const costUsd = calculateCost(params.modelId, inputTokens, outputTokens, this.pricing);

      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'bedrock',
        model: params.modelId,
        tokenUsage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        costUsd,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return {
        content,
        model: params.modelId,
        inputTokens,
        outputTokens,
        stopReason: response.stopReason ?? 'end_turn',
        usageInfo: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
          costUsd,
        },
      };
    } catch (err) {
      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'bedrock',
        model: params.modelId,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: null,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async *streamOpenAI(
    params: Omit<OpenAIStreamParams, 'stream'>
  ): AsyncGenerator<OpenAIStreamChunk, void, unknown> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const stream = await this.openaiClient!.chat.completions.create({
        ...params,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? 0;
          completionTokens = chunk.usage.completion_tokens ?? 0;
        }
        yield chunk;
      }

      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'openai',
        model: params.model,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        costUsd: calculateCost(params.model, promptTokens, completionTokens, this.pricing),
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: true,
      });
    } catch (err) {
      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'openai',
        model: params.model,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: null,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async *streamAzure(
    params: Omit<AzureStreamParams, 'stream'>
  ): AsyncGenerator<OpenAIStreamChunk, void, unknown> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const stream = await this.azureClient!.chat.completions.create({
        ...params,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? 0;
          completionTokens = chunk.usage.completion_tokens ?? 0;
        }
        yield chunk;
      }

      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'azure',
        model: params.model,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        costUsd: calculateCost(params.model, promptTokens, completionTokens, this.pricing),
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: true,
      });
    } catch (err) {
      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'azure',
        model: params.model,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: null,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async *streamClaude(
    params: Omit<ClaudeStreamParams, 'stream'>
  ): AsyncGenerator<Anthropic.MessageStreamEvent, void, unknown> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const stream = this.claudeClient!.messages.stream({ ...params });

      for await (const event of stream) {
        if (event.type === 'message_start' && event.message.usage) {
          promptTokens = event.message.usage.input_tokens;
        }
        if (event.type === 'message_delta' && event.usage) {
          completionTokens = event.usage.output_tokens;
        }
        yield event;
      }

      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'claude',
        model: params.model,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        costUsd: calculateCost(params.model, promptTokens, completionTokens, this.pricing),
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: true,
      });
    } catch (err) {
      this.track({
        requestId,
        projectName: this.config.projectName,
        provider: 'claude',
        model: params.model,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        costUsd: null,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
