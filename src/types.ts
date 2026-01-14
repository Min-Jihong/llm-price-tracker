import type OpenAI from 'openai';
import type Anthropic from '@anthropic-ai/sdk';
import type { GenerateContentRequest, GenerateContentResult } from '@google/generative-ai';
import type { ModelPricing } from './pricing';

export type ProviderType = 'openai' | 'azure' | 'claude' | 'gemini' | 'bedrock';

export interface TrackingData {
  requestId: string;
  projectName: string;
  provider: ProviderType;
  model: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd: number | null;
  timestamp: Date;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  save(data: TrackingData): Promise<void>;
  saveBatch?(data: TrackingData[]): Promise<void>;
  getStats?(filter: StatsFilter): Promise<UsageStats>;
}

export interface StatsFilter {
  projectName?: string;
  provider?: ProviderType;
  model?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface UsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface AzureConfig {
  apiKey: string;
  endpoint: string;
  apiVersion?: string;
  deployment?: string;
}

export interface BedrockConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface SDKConfig {
  projectName: string;
  apiKeys: {
    openai?: string;
    azure?: AzureConfig;
    claude?: string;
    gemini?: string;
    bedrock?: BedrockConfig;
  };
  database: DatabaseAdapter;
  customPricing?: Record<string, ModelPricing>;
  retry?: RetryConfig;
  batchSize?: number;
  batchIntervalMs?: number;
}

export type OpenAIChatParams = OpenAI.ChatCompletionCreateParamsNonStreaming;
export type OpenAIChatResponse = OpenAI.ChatCompletion;
export type OpenAIStreamParams = OpenAI.ChatCompletionCreateParamsStreaming;
export type OpenAIStreamChunk = OpenAI.ChatCompletionChunk;

export type AzureChatParams = OpenAI.ChatCompletionCreateParamsNonStreaming;
export type AzureChatResponse = OpenAI.ChatCompletion;
export type AzureStreamParams = OpenAI.ChatCompletionCreateParamsStreaming;

export type ClaudeMessageParams = Anthropic.MessageCreateParamsNonStreaming;
export type ClaudeMessageResponse = Anthropic.Message;
export type ClaudeStreamParams = Anthropic.MessageCreateParamsStreaming;

export type GeminiGenerateParams = GenerateContentRequest & { model: string };
export type GeminiGenerateResponse = GenerateContentResult;

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockChatParams {
  modelId: string;
  messages: BedrockMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface BedrockChatResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}
