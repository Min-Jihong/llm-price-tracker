import { LLMTrackerSDK, PostgresAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'my-chatbot',
    apiKeys: {
      openai: process.env.OPENAI_API_KEY,
      claude: process.env.ANTHROPIC_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
    },
    database: new PostgresAdapter({
      connectionString: process.env.DATABASE_URL,
    }),
  });

  await sdk.connect();

  try {
    // OpenAI
    const openaiResponse = await sdk.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is TypeScript?' },
      ],
      max_tokens: 500,
    });
    console.log('OpenAI:', openaiResponse.choices[0].message.content);

    // Claude
    const claudeResponse = await sdk.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'What is TypeScript?' }],
    });
    console.log('Claude:', claudeResponse.content[0]);

    // Gemini
    const geminiResponse = await sdk.gemini.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'What is TypeScript?' }] }],
    });
    console.log('Gemini:', geminiResponse.response.text());
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
