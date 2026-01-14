import { LLMTrackerSDK, PostgresAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'azure-example',
    apiKeys: {
      azure: {
        apiKey: process.env.AZURE_OPENAI_API_KEY!,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
        deployment: 'gpt-4o',
        apiVersion: '2024-02-15-preview',
      },
    },
    database: new PostgresAdapter({
      connectionString: process.env.DATABASE_URL,
    }),
  });

  await sdk.connect();

  try {
    const response = await sdk.azure.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello from Azure!' }],
    });
    console.log(response.choices[0].message.content);
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
