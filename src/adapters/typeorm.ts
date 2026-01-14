import type { DatabaseAdapter, TrackingData } from '../types';

export interface TypeORMConfig {
  dataSource: unknown;
  tableName?: string;
}

export class TypeORMAdapter implements DatabaseAdapter {
  private dataSource: unknown;
  private tableName: string;

  constructor(config: TypeORMConfig) {
    this.dataSource = config.dataSource;
    this.tableName = config.tableName ?? 'llm_tracking';
  }

  async connect(): Promise<void> {
    const ds = this.dataSource as { 
      isInitialized: boolean; 
      initialize: () => Promise<void>; 
      query: (sql: string) => Promise<unknown>;
    };

    if (!ds.isInitialized) {
      await ds.initialize();
    }

    await ds.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        request_id VARCHAR(255) NOT NULL,
        project_name VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        model VARCHAR(255) NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_usd DECIMAL(10, 6),
        timestamp TIMESTAMPTZ NOT NULL,
        latency_ms INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async disconnect(): Promise<void> {
    const ds = this.dataSource as { isInitialized: boolean; destroy: () => Promise<void> };
    if (ds.isInitialized) {
      await ds.destroy();
    }
  }

  async save(data: TrackingData): Promise<void> {
    const ds = this.dataSource as { query: (sql: string, params: unknown[]) => Promise<unknown> };
    await ds.query(
      `INSERT INTO ${this.tableName} 
        (request_id, project_name, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, timestamp, latency_ms, success, error)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        data.requestId,
        data.projectName,
        data.provider,
        data.model,
        data.tokenUsage.promptTokens,
        data.tokenUsage.completionTokens,
        data.tokenUsage.totalTokens,
        data.costUsd,
        data.timestamp,
        data.latencyMs,
        data.success,
        data.error ?? null,
      ]
    );
  }
}
