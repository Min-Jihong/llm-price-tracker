import { LLMTrackerSDK, MongoAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'mongodb-example',
    apiKeys: {
      claude: process.env.ANTHROPIC_API_KEY,
    },
    database: new MongoAdapter({
      uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017',
      database: 'llm_tracking',
      collection: 'api_usage',
    }),
  });

  await sdk.connect();

  try {
    const response = await sdk.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    console.log(response.content[0]);
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
