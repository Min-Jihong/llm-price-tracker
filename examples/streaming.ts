import { LLMTrackerSDK, PostgresAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'streaming-demo',
    apiKeys: {
      openai: process.env.OPENAI_API_KEY,
      claude: process.env.ANTHROPIC_API_KEY,
    },
    database: new PostgresAdapter({
      connectionString: process.env.DATABASE_URL,
    }),
  });

  await sdk.connect();

  try {
    console.log('--- OpenAI Streaming ---');
    const openaiStream = sdk.openai.chat.completions.stream({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Count from 1 to 5 slowly.' }],
    });

    for await (const chunk of openaiStream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) process.stdout.write(content);
    }
    console.log('\n');

    console.log('--- Claude Streaming ---');
    const claudeStream = sdk.claude.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'Count from 1 to 5 slowly.' }],
    });

    for await (const event of claudeStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);
      }
    }
    console.log('\n');
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
