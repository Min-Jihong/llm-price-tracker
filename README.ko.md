# LLM Tracker SDK

팀 및 프로젝트별 LLM API 사용량을 추적하는 백엔드 SDK입니다. OpenAI, Claude, Gemini, Azure OpenAI, AWS Bedrock의 토큰 소비량, 비용, API 호출을 모니터링합니다.

> **목적**: 회사에서 팀별 또는 프로젝트별 LLM 사용량을 추적하고 분석하기 위해 만들어졌습니다. 비용 관리와 API 소비 현황 파악에 활용하세요.

> **주의**: 이 SDK는 **서버 사이드 전용**입니다. Node.js가 필요하며 브라우저에서는 실행할 수 없습니다.

## 주요 기능

- **다중 프로바이더 지원**: OpenAI, Claude, Gemini, Azure OpenAI, AWS Bedrock
- **자동 비용 계산**: LiteLLM에서 실시간 가격 정보 가져옴 (24시간마다 갱신)
- **다양한 DB 어댑터**: PostgreSQL, MySQL, MongoDB, TypeORM
- **스트리밍 지원**: OpenAI, Claude, Azure에서 토큰 추적과 함께 스트리밍
- **배치 처리**: 트래킹 데이터를 큐에 쌓아서 일괄 저장
- **재시도 로직**: 지수 백오프로 자동 재시도
- **사용량 통계**: 프로젝트, 프로바이더, 모델, 날짜 범위별 통계 조회

## 설치

```bash
npm install llm-tracker-sdk

# 사용할 DB 드라이버 설치
npm install pg        # PostgreSQL
npm install mysql2    # MySQL
npm install mongodb   # MongoDB
```

## 빠른 시작

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
  messages: [{ role: 'user', content: '안녕하세요!' }],
});

await sdk.disconnect();
```

## 프로바이더

### OpenAI

```typescript
const response = await sdk.openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '안녕하세요!' }],
  response_format: { type: 'json_object' },
  tools: [{ type: 'function', function: { name: 'get_weather', ... } }],
});
```

### Claude

```typescript
const response = await sdk.claude.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '안녕하세요!' }],
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
  messages: [{ role: 'user', content: '안녕하세요!' }],
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
  messages: [{ role: 'user', content: '안녕하세요!' }],
  system: 'You are a helpful assistant.',
  maxTokens: 1024,
});
```

### Gemini

```typescript
const response = await sdk.gemini.generateContent({
  model: 'gemini-1.5-flash',
  contents: [{ role: 'user', parts: [{ text: '안녕하세요!' }] }],
});
```

## 스트리밍

```typescript
const stream = sdk.openai.chat.completions.stream({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '안녕하세요!' }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

## DB 어댑터

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

### 커스텀 어댑터

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

## 설정

```typescript
const sdk = new LLMTrackerSDK({
  projectName: 'my-project',
  apiKeys: { ... },
  database: new PostgresAdapter({ ... }),
  
  // 커스텀 가격 (LiteLLM 가격 덮어쓰기)
  customPricing: {
    'my-custom-model': { inputCostPerToken: 0.00001, outputCostPerToken: 0.00002 },
  },
  
  // 재시도 설정
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },
  
  // 배치 처리
  batchSize: 10,
  batchIntervalMs: 5000,
});
```

## 사용량 통계

```typescript
const stats = await sdk.getStats({
  projectName: 'my-project',
  provider: 'openai',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
});

console.log(stats);
// {
//   totalRequests: 1000,        // 총 요청 수
//   successfulRequests: 995,    // 성공한 요청 수
//   failedRequests: 5,          // 실패한 요청 수
//   totalTokens: 500000,        // 총 토큰 수
//   totalPromptTokens: 200000,  // 프롬프트 토큰 수
//   totalCompletionTokens: 300000, // 응답 토큰 수
//   totalCostUsd: 15.50,        // 총 비용 (USD)
//   avgLatencyMs: 850           // 평균 응답 시간 (ms)
// }
```

## 저장되는 데이터

각 API 호출 시 자동으로 저장되는 데이터:

| 필드 | 설명 |
|------|------|
| `requestId` | 고유 요청 ID |
| `projectName` | 프로젝트 식별자 |
| `provider` | openai, claude, gemini, azure, bedrock |
| `model` | 모델명 |
| `promptTokens` | 입력 토큰 수 |
| `completionTokens` | 출력 토큰 수 |
| `totalTokens` | 총 토큰 수 |
| `costUsd` | 예상 비용 (USD) |
| `timestamp` | 요청 시간 |
| `latencyMs` | 응답 소요 시간 |
| `success` | 성공/실패 여부 |
| `error` | 에러 메시지 (실패 시) |

## 라이센스

MIT
