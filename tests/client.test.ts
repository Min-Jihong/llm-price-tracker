import { LLMTrackerSDK } from '../src/client';
import { MockDatabaseAdapter } from './mocks';

describe('LLMTrackerSDK', () => {
  let sdk: LLMTrackerSDK;
  let mockDb: MockDatabaseAdapter;

  beforeEach(() => {
    mockDb = new MockDatabaseAdapter();
    sdk = new LLMTrackerSDK({
      projectName: 'test-project',
      apiKeys: {},
      database: mockDb,
    });
  });

  describe('initialization', () => {
    it('should create SDK instance', () => {
      expect(sdk).toBeInstanceOf(LLMTrackerSDK);
    });

    it('should throw error when accessing unconfigured provider', () => {
      expect(() => sdk.openai).toThrow('OpenAI API key not configured');
      expect(() => sdk.claude).toThrow('Claude API key not configured');
      expect(() => sdk.gemini).toThrow('Gemini API key not configured');
    });
  });

  describe('connect/disconnect', () => {
    it('should connect to database', async () => {
      await sdk.connect();
      expect(mockDb.connected).toBe(true);
    });

    it('should disconnect from database', async () => {
      await sdk.connect();
      await sdk.disconnect();
      expect(mockDb.connected).toBe(false);
    });
  });

  describe('tracking', () => {
    it('should not save tracking data when not connected', async () => {
      const sdkWithKey = new LLMTrackerSDK({
        projectName: 'test-project',
        apiKeys: { openai: 'test-key' },
        database: mockDb,
      });

      expect(mockDb.savedData.length).toBe(0);
    });
  });
});
