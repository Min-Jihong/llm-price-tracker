import { LLMTrackerSDK, MySQLAdapter } from 'llm-tracker-sdk';

async function main() {
  const sdk = new LLMTrackerSDK({
    projectName: 'mysql-example',
    apiKeys: {
      openai: process.env.OPENAI_API_KEY,
    },
    database: new MySQLAdapter({
      host: 'localhost',
      port: 3306,
      database: 'llm_tracking',
      user: 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      tableName: 'api_usage',
    }),
  });

  await sdk.connect();

  try {
    const response = await sdk.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    console.log(response.choices[0].message.content);
  } finally {
    await sdk.disconnect();
  }
}

main().catch(console.error);
