import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ProblemException } from './exceptions/problem.exception.js';

const IV_LEN = 12;
const TAG_LEN = 16;

/** INPUT_ENCRYPTION_KEY(hex 64자 또는 base64)를 32바이트 키로 디코딩한다. */
function decodeKey(raw: string): Buffer {
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('INPUT_ENCRYPTION_KEY 는 32바이트여야 합니다(hex 64자 또는 base64 44자).');
  }
  return buf;
}

/**
 * 렌더 입력 원문 암호화(AES-256-GCM). 저장 형식: iv(12) + authTag(16) + ciphertext.
 * 키(INPUT_ENCRYPTION_KEY)가 없으면 비활성이며, 저장 요청 시 400 으로 거부한다.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>('INPUT_ENCRYPTION_KEY');
    this.key = raw ? decodeKey(raw) : null;
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  encrypt(value: unknown): Uint8Array {
    const key = this.requireKey();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]);
  }

  decrypt(bytes: Uint8Array): unknown {
    const key = this.requireKey();
    const buf = Buffer.from(bytes);
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ProblemException(
        'BAD_REQUEST',
        '입력 암호화 키(INPUT_ENCRYPTION_KEY)가 설정되지 않았습니다.',
      );
    }
    return this.key;
  }
}
