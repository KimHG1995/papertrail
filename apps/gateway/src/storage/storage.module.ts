import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3StorageClient, type StorageClient } from '@papertrail/storage';
import { STORAGE } from './storage.constants.js';

/** S3/MinIO 스토리지 클라이언트를 전역으로 제공한다(설정은 S3_* 환경변수). */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageClient =>
        new S3StorageClient({
          endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
          region: config.get<string>('S3_REGION', 'us-east-1'),
          bucket: config.getOrThrow<string>('S3_BUCKET'),
          accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
          secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
          forcePathStyle: true,
        }),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
