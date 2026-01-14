import { DataSource } from 'typeorm';
import { LLMTrackerSDK, TypeORMAdapter } from 'llm-tracker-sdk';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    synchronize: false,
  });

  const sdk = new LLMTrackerSDK({
    projectName: 'typeorm-example',
    apiKeys: {
      openai: process.env.OPENAI_API_KEY,
    },
    database: new TypeORMAdapter({
      dataSource,
      tableName: 'llm_tracking',
    }),
  });

  await sdk.connect();

  try {
    const response = await sdk.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    console.log(response.choices[0].message.content);
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
