import type { DatabaseAdapter, TrackingData } from '../types';

export interface MongoConfig {
  uri: string;
  database: string;
  collection?: string;
}

export class MongoAdapter implements DatabaseAdapter {
  private client: unknown;
  private collection: unknown;
  private config: MongoConfig;

  constructor(config: MongoConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const { MongoClient } = await import('mongodb');
    this.client = new MongoClient(this.config.uri);
    await (this.client as { connect: () => Promise<void> }).connect();

    const db = (this.client as { db: (name: string) => unknown }).db(this.config.database);
    this.collection = (db as { collection: (name: string) => unknown }).collection(
      this.config.collection ?? 'llm_tracking'
    );
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await (this.client as { close: () => Promise<void> }).close();
    }
  }

  async save(data: TrackingData): Promise<void> {
    const collection = this.collection as { insertOne: (doc: unknown) => Promise<unknown> };
    await collection.insertOne({
      requestId: data.requestId,
      projectName: data.projectName,
      provider: data.provider,
      model: data.model,
      tokenUsage: data.tokenUsage,
      costUsd: data.costUsd,
      timestamp: data.timestamp,
      latencyMs: data.latencyMs,
      success: data.success,
      error: data.error,
      createdAt: new Date(),
    });
  }
}
