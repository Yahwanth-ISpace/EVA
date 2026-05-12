import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';

@Injectable()
export class MongoService implements OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private mongoClient?: MongoClient;
  private mongoDb?: Db;

  async getDb(): Promise<Db> {
    if (this.mongoDb) {
      return this.mongoDb;
    }

    const uri = process.env.DATABASE_URL;
    if (!uri) {
      throw new Error(
        'DATABASE_URL is required to connect to MongoDB directly',
      );
    }

    this.mongoClient = new MongoClient(uri);
    await this.mongoClient.connect();
    this.mongoDb = this.mongoClient.db();
    this.logger.log('Connected to MongoDB directly using native MongoClient');
    return this.mongoDb;
  }

  async onModuleDestroy() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.logger.log('MongoDB connection closed');
    }
  }
}
