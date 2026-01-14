import type { DatabaseAdapter, TrackingData } from '../types';

export interface MySQLConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  tableName?: string;
}

export class MySQLAdapter implements DatabaseAdapter {
  private pool: unknown;
  private tableName: string;
  private config: MySQLConfig;

  constructor(config: MySQLConfig) {
    this.config = config;
    this.tableName = config.tableName ?? 'llm_tracking';
  }

  async connect(): Promise<void> {
    const mysql = await import('mysql2/promise');
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port ?? 3306,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
    });

    const pool = this.pool as { execute: (sql: string) => Promise<unknown> };
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id VARCHAR(255) NOT NULL,
        project_name VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        model VARCHAR(255) NOT NULL,
        prompt_tokens INT NOT NULL,
        completion_tokens INT NOT NULL,
        total_tokens INT NOT NULL,
        cost_usd DECIMAL(10, 6),
        timestamp DATETIME NOT NULL,
        latency_ms INT NOT NULL,
        success BOOLEAN NOT NULL,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await (this.pool as { end: () => Promise<void> }).end();
    }
  }

  async save(data: TrackingData): Promise<void> {
    const pool = this.pool as { execute: (sql: string, values: unknown[]) => Promise<unknown> };
    await pool.execute(
      `INSERT INTO ${this.tableName} 
        (request_id, project_name, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, timestamp, latency_ms, success, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
