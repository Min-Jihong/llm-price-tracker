import { DatabaseAdapter, TrackingData, LLMTrackerSDK } from 'llm-tracker-sdk';
import Redis from 'ioredis';

export class RedisAdapter implements DatabaseAdapter {
  private client: Redis | null = null;
  private listKey: string;

  constructor(private config: { url: string; listKey?: string }) {
    this.listKey = config.listKey ?? 'llm:tracking';
  }

  async connect(): Promise<void> {
    this.client = new Redis(this.config.url);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  async save(data: TrackingData): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    await this.client.rpush(this.listKey, JSON.stringify({
      ...data,
      timestamp: data.timestamp.toISOString(),
    }));
  }
}

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'redis-example',
    apiKeys: { openai: process.env.OPENAI_API_KEY },
    database: new RedisAdapter({ url: 'redis://localhost:6379' }),
  });

  await sdk.connect();

  const response = await sdk.openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello!' }],
  });

  console.log(response.choices[0].message.content);
  await sdk.disconnect();
}

main().catch(console.error);
