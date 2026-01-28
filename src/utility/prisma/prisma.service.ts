import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Optional() private configService?: ConfigService) {
    super();
  }

  async onModuleInit() {
    const databaseUrl = process.env.DATABASE_URL || this.configService?.get<string>('DATABASE_URL');
    
    if (!databaseUrl) {
      const errorMessage = 'DATABASE_URL environment variable is not set. Please set it in your environment variables or .env file.';
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    try {
      await this.$connect();
      this.logger.log('Successfully connected to database');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

