import { LLMTrackerSDK, PostgresAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'batch-retry-demo',
    apiKeys: {
      openai: process.env.OPENAI_API_KEY,
    },
    database: new PostgresAdapter({
      connectionString: process.env.DATABASE_URL,
    }),
    retry: {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    },
    batchSize: 10,
    batchIntervalMs: 5000,
  });

  await sdk.connect();

  try {
    const promises = Array.from({ length: 5 }, (_, i) =>
      sdk.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Request ${i + 1}: Hello!` }],
      })
    );

    const responses = await Promise.all(promises);
    responses.forEach((res, i) => {
      console.log(`Response ${i + 1}:`, res.choices[0].message.content?.slice(0, 50));
    });

    const stats = await sdk.getStats({ projectName: 'batch-retry-demo' });
    if (stats) {
      console.log('\n--- Usage Stats ---');
      console.log('Total requests:', stats.totalRequests);
      console.log('Total tokens:', stats.totalTokens);
      console.log('Total cost (USD):', stats.totalCostUsd.toFixed(4));
      console.log('Avg latency (ms):', stats.avgLatencyMs.toFixed(0));
    }
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
