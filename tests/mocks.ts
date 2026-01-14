import { DatabaseAdapter, TrackingData } from '../src/types';

export class MockDatabaseAdapter implements DatabaseAdapter {
  public savedData: TrackingData[] = [];
  public connected = false;
  public shouldFail = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async save(data: TrackingData): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Mock database error');
    }
    this.savedData.push(data);
  }

  clear(): void {
    this.savedData = [];
  }
}
