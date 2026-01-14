import { LLMTrackerSDK, PostgresAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'structured-output-demo',
    apiKeys: {
      openai: process.env.OPENAI_API_KEY,
    },
    database: new PostgresAdapter({
      connectionString: process.env.DATABASE_URL,
    }),
  });

  await sdk.connect();

  try {
    // JSON Schema로 structured output
    const response = await sdk.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'List 3 programming languages with their main use cases.' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'languages',
          schema: {
            type: 'object',
            properties: {
              languages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    useCase: { type: 'string' },
                  },
                  required: ['name', 'useCase'],
                },
              },
            },
            required: ['languages'],
          },
        },
      },
    });

    const result = JSON.parse(response.choices[0].message.content ?? '{}');
    console.log('Structured Output:', result);
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
