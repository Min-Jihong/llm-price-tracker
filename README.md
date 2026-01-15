# LLM Tracker SDK

A backend SDK for tracking LLM API usage by team and project. Monitors token consumption, costs, and API calls for OpenAI, Claude, Gemini, Azure OpenAI, and AWS Bedrock.

> **Purpose**: Created to track and analyze LLM usage by team or project within a company. Use it for cost management and understanding API consumption patterns.

> **Note**: This SDK is **server-side only**. It requires Node.js and cannot run in browsers.

## Key Features

- **Multi-Provider Support**: OpenAI, Claude, Gemini, Azure OpenAI, AWS Bedrock
- **Automatic Cost Calculation**: Fetches real-time pricing from LiteLLM (refreshed every 24 hours)
- **Multiple DB Adapters**: PostgreSQL, MySQL, MongoDB, TypeORM
- **Streaming Support**: Streaming with token tracking for OpenAI, Claude, Azure
- **Batch Processing**: Queues tracking data for batch saving
- **Retry Logic**: Automatic retry with exponential backoff
- **Usage Statistics**: Query statistics by project, provider, model, and date range

## Installation

```bash
npm install llm-tracker-sdk

# Install the DB driver you'll use
npm install pg        # PostgreSQL
npm install mysql2    # MySQL
npm install mongodb   # MongoDB
```

## Quick Start

```typescript
import { LLMTrackerSDK, PostgresAdapter } from 'llm-tracker-sdk';

const sdk = new LLMTrackerSDK({
  projectName: 'my-project',
  apiKeys: {
    openai: process.env.OPENAI_API_KEY,
    claude: process.env.ANTHROPIC_API_KEY,
  },
  database: new PostgresAdapter({
    connectionString: process.env.DATABASE_URL,
  }),
});

await sdk.connect();

const response = await sdk.openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});

await sdk.disconnect();
```

## Providers

### OpenAI

```typescript
const response = await sdk.openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
  response_format: { type: 'json_object' },
  tools: [{ type: 'function', function: { name: 'get_weather', ... } }],
});
```

### Claude

```typescript
const response = await sdk.claude.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Azure OpenAI

```typescript
const sdk = new LLMTrackerSDK({
  projectName: 'my-project',
  apiKeys: {
    azure: {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: 'gpt-4o',
      apiVersion: '2024-02-15-preview',
    },
  },
  database: new PostgresAdapter({ ... }),
});

const response = await sdk.azure.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### AWS Bedrock

```typescript
const sdk = new LLMTrackerSDK({
  projectName: 'my-project',
  apiKeys: {
    bedrock: {
      region: 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
  database: new PostgresAdapter({ ... }),
});

const response = await sdk.bedrock.chat({
  modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  messages: [{ role: 'user', content: 'Hello!' }],
  system: 'You are a helpful assistant.',
  maxTokens: 1024,
});
```

### Gemini

```typescript
const response = await sdk.gemini.generateContent({
  model: 'gemini-1.5-flash',
  contents: [{ role: 'user', parts: [{ text: 'Hello!' }] }],
});
```

## Streaming

```typescript
const stream = sdk.openai.chat.completions.stream({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

## DB Adapters

### PostgreSQL

```typescript
import { PostgresAdapter } from 'llm-tracker-sdk';

new PostgresAdapter({
  connectionString: 'postgres://user:pass@localhost:5432/db',
  tableName: 'llm_tracking',
});
```

### MySQL

```typescript
import { MySQLAdapter } from 'llm-tracker-sdk';

new MySQLAdapter({
  host: 'localhost',
  port: 3306,
  database: 'mydb',
  user: 'root',
  password: 'password',
});
```

### MongoDB

```typescript
import { MongoAdapter } from 'llm-tracker-sdk';

new MongoAdapter({
  uri: 'mongodb://localhost:27017',
  database: 'llm_tracking',
  collection: 'api_usage',
});
```

### Custom Adapter

```typescript
import { DatabaseAdapter, TrackingData } from 'llm-tracker-sdk';

class MyAdapter implements DatabaseAdapter {
  async connect(): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async save(data: TrackingData): Promise<void> { /* ... */ }
  async saveBatch?(data: TrackingData[]): Promise<void> { /* ... */ }
  async getStats?(filter: StatsFilter): Promise<UsageStats> { /* ... */ }
}
```

## Configuration

```typescript
const sdk = new LLMTrackerSDK({
  projectName: 'my-project',
  apiKeys: { ... },
  database: new PostgresAdapter({ ... }),
  
  // Custom pricing (overrides LiteLLM pricing)
  customPricing: {
    'my-custom-model': { inputCostPerToken: 0.00001, outputCostPerToken: 0.00002 },
  },
  
  // Retry settings
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },
  
  // Batch processing
  batchSize: 10,
  batchIntervalMs: 5000,
});
```

## Usage Statistics

```typescript
const stats = await sdk.getStats({
  projectName: 'my-project',
  provider: 'openai',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
});

console.log(stats);
// {
//   totalRequests: 1000,        // Total number of requests
//   successfulRequests: 995,    // Number of successful requests
//   failedRequests: 5,          // Number of failed requests
//   totalTokens: 500000,        // Total tokens
//   totalPromptTokens: 200000,  // Prompt tokens
//   totalCompletionTokens: 300000, // Completion tokens
//   totalCostUsd: 15.50,        // Total cost (USD)
//   avgLatencyMs: 850           // Average response time (ms)
// }
```

## Stored Data

Data automatically saved for each API call:

| Field | Description |
|-------|-------------|
| `requestId` | Unique request ID |
| `projectName` | Project identifier |
| `provider` | openai, claude, gemini, azure, bedrock |
| `model` | Model name |
| `promptTokens` | Input token count |
| `completionTokens` | Output token count |
| `totalTokens` | Total token count |
| `costUsd` | Estimated cost (USD) |
| `timestamp` | Request timestamp |
| `latencyMs` | Response latency |
| `success` | Success/failure status |
| `error` | Error message (on failure) |

## License

MIT
