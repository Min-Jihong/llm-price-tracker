import { LLMTrackerSDK, PostgresAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'bedrock-example',
    apiKeys: {
      bedrock: {
        region: 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    },
    database: new PostgresAdapter({
      connectionString: process.env.DATABASE_URL,
    }),
  });

  await sdk.connect();

  try {
    const response = await sdk.bedrock.chat({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages: [{ role: 'user', content: 'Hello from AWS Bedrock!' }],
      system: 'You are a helpful assistant.',
      maxTokens: 500,
    });

    console.log('Response:', response.content);
    console.log('Input tokens:', response.inputTokens);
    console.log('Output tokens:', response.outputTokens);
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
