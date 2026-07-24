import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase, type Database } from '@papertrail/db';
import { DRIZZLE } from './database.constants.js';

/**
 * PostgreSQL(Drizzle) 연결을 전역으로 제공한다.
 * DATABASE_URL 로 풀을 만들고, 앱 종료 시 풀을 정리한다(enableShutdownHooks 필요).
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database =>
        createDatabase(config.getOrThrow<string>('DATABASE_URL')),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.$client.end();
  }
}
