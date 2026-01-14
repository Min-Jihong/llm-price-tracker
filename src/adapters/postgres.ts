import type { DatabaseAdapter, TrackingData, StatsFilter, UsageStats } from '../types';

export interface PostgresConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  tableName?: string;
}

export class PostgresAdapter implements DatabaseAdapter {
  private pool: unknown;
  private tableName: string;
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
    this.tableName = config.tableName ?? 'llm_tracking';
  }

  async connect(): Promise<void> {
    const { Pool } = await import('pg');
    this.pool = new Pool(
      this.config.connectionString
        ? { connectionString: this.config.connectionString }
        : {
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.user,
            password: this.config.password,
          }
    );

    await (this.pool as { query: (sql: string) => Promise<unknown> }).query(`
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
    if (this.pool) {
      await (this.pool as { end: () => Promise<void> }).end();
    }
  }

  async save(data: TrackingData): Promise<void> {
    const pool = this.pool as { query: (sql: string, values: unknown[]) => Promise<unknown> };
    await pool.query(
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

  async saveBatch(data: TrackingData[]): Promise<void> {
    if (data.length === 0) return;

    const pool = this.pool as { query: (sql: string, values: unknown[]) => Promise<unknown> };
    const values: unknown[] = [];
    const placeholders: string[] = [];

    data.forEach((item, index) => {
      const offset = index * 12;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`
      );
      values.push(
        item.requestId,
        item.projectName,
        item.provider,
        item.model,
        item.tokenUsage.promptTokens,
        item.tokenUsage.completionTokens,
        item.tokenUsage.totalTokens,
        item.costUsd,
        item.timestamp,
        item.latencyMs,
        item.success,
        item.error ?? null
      );
    });

    await pool.query(
      `INSERT INTO ${this.tableName} 
        (request_id, project_name, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, timestamp, latency_ms, success, error)
        VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  async getStats(filter: StatsFilter): Promise<UsageStats> {
    const pool = this.pool as { query: (sql: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.projectName) {
      conditions.push(`project_name = $${paramIndex++}`);
      values.push(filter.projectName);
    }
    if (filter.provider) {
      conditions.push(`provider = $${paramIndex++}`);
      values.push(filter.provider);
    }
    if (filter.model) {
      conditions.push(`model = $${paramIndex++}`);
      values.push(filter.model);
    }
    if (filter.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(filter.startDate);
    }
    if (filter.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(filter.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT 
        COUNT(*)::integer as total_requests,
        COUNT(*) FILTER (WHERE success = true)::integer as successful_requests,
        COUNT(*) FILTER (WHERE success = false)::integer as failed_requests,
        COALESCE(SUM(total_tokens), 0)::integer as total_tokens,
        COALESCE(SUM(prompt_tokens), 0)::integer as total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::integer as total_completion_tokens,
        COALESCE(SUM(cost_usd), 0)::numeric as total_cost_usd,
        COALESCE(AVG(latency_ms), 0)::numeric as avg_latency_ms
      FROM ${this.tableName}
      ${whereClause}`,
      values
    );

    const row = result.rows[0];
    return {
      totalRequests: Number(row.total_requests),
      successfulRequests: Number(row.successful_requests),
      failedRequests: Number(row.failed_requests),
      totalTokens: Number(row.total_tokens),
      totalPromptTokens: Number(row.total_prompt_tokens),
      totalCompletionTokens: Number(row.total_completion_tokens),
      totalCostUsd: Number(row.total_cost_usd),
      avgLatencyMs: Number(row.avg_latency_ms),
    };
  }
}
