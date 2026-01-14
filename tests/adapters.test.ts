import { PostgresAdapter } from '../src/adapters/postgres';
import { MySQLAdapter } from '../src/adapters/mysql';
import { MongoAdapter } from '../src/adapters/mongo';
import { TypeORMAdapter } from '../src/adapters/typeorm';

describe('Database Adapters', () => {
  describe('PostgresAdapter', () => {
    it('should create instance with connection string', () => {
      const adapter = new PostgresAdapter({
        connectionString: 'postgres://localhost:5432/test',
      });
      expect(adapter).toBeInstanceOf(PostgresAdapter);
    });

    it('should create instance with individual config', () => {
      const adapter = new PostgresAdapter({
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'user',
        password: 'pass',
      });
      expect(adapter).toBeInstanceOf(PostgresAdapter);
    });

    it('should use custom table name', () => {
      const adapter = new PostgresAdapter({
        connectionString: 'postgres://localhost:5432/test',
        tableName: 'custom_tracking',
      });
      expect(adapter).toBeInstanceOf(PostgresAdapter);
    });
  });

  describe('MySQLAdapter', () => {
    it('should create instance', () => {
      const adapter = new MySQLAdapter({
        host: 'localhost',
        database: 'test',
        user: 'user',
        password: 'pass',
      });
      expect(adapter).toBeInstanceOf(MySQLAdapter);
    });
  });

  describe('MongoAdapter', () => {
    it('should create instance', () => {
      const adapter = new MongoAdapter({
        uri: 'mongodb://localhost:27017',
        database: 'test',
      });
      expect(adapter).toBeInstanceOf(MongoAdapter);
    });

    it('should use custom collection name', () => {
      const adapter = new MongoAdapter({
        uri: 'mongodb://localhost:27017',
        database: 'test',
        collection: 'custom_tracking',
      });
      expect(adapter).toBeInstanceOf(MongoAdapter);
    });
  });

  describe('TypeORMAdapter', () => {
    it('should create instance with data source', () => {
      const mockDataSource = { isInitialized: false };
      const adapter = new TypeORMAdapter({
        dataSource: mockDataSource,
      });
      expect(adapter).toBeInstanceOf(TypeORMAdapter);
    });
  });
});
