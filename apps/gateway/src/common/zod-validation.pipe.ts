import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { FieldError } from '@papertrail/contracts';
import { ValidationException } from './problem.exception.js';

/**
 * Zod 스키마로 요청 값을 검증한다.
 * 실패 시 필드별 사유(errors[])를 담아 ValidationException(400)을 던진다.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors: FieldError[] = result.error.issues.map((issue) => ({
        name: issue.path.map((segment) => String(segment)).join('.'),
        reason: issue.message,
        code: issue.code,
      }));
      throw new ValidationException(errors);
    }
    return result.data;
  }
}
