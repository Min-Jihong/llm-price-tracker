import { LLMTrackerSDK, PostgresAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'function-calling-demo',
    apiKeys: {
      openai: process.env.OPENAI_API_KEY,
    },
    database: new PostgresAdapter({
      connectionString: process.env.DATABASE_URL,
    }),
  });

  await sdk.connect();

  try {
    const response = await sdk.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'What is the weather in Seoul?' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather for a location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'City name',
                },
                unit: {
                  type: 'string',
                  enum: ['celsius', 'fahrenheit'],
                },
              },
              required: ['location'],
            },
          },
        },
      ],
      tool_choice: 'auto',
    });

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (toolCall) {
      console.log('Function called:', toolCall.function.name);
      console.log('Arguments:', toolCall.function.arguments);
    }
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
