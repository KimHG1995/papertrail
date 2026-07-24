import { Injectable } from '@nestjs/common';
import type { FieldError, JsonObject } from '@papertrail/contracts';
import { Ajv, type ValidateFunction } from 'ajv';
import { ProblemException } from '../common/exceptions/problem.exception.js';

/**
 * 템플릿 JSON Schema 로 렌더 입력을 검증한다. 컴파일된 검증기를 schemaHash 로 캐시해
 * 요청마다 재컴파일하지 않는다. Ajv strict=false 로 미지원 키워드에 관대하게 동작한다.
 */
@Injectable()
export class SchemaValidatorService {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly cache = new Map<string, ValidateFunction>();

  /** 스키마 자체가 유효한 JSON Schema 인지 확인한다(등록 시). 잘못되면 400. */
  assertValidSchema(schema: JsonObject): void {
    try {
      this.ajv.compile(schema);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '알 수 없는 오류';
      throw new ProblemException('BAD_REQUEST', `유효하지 않은 JSON Schema: ${detail}`);
    }
  }

  /** data 를 schema 로 검증하고 위반 사항을 FieldError[] 로 반환한다(없으면 빈 배열). */
  validate(schemaHash: string, schema: JsonObject, data: unknown): FieldError[] {
    const validate = this.getValidator(schemaHash, schema);
    if (validate(data)) {
      return [];
    }
    return (validate.errors ?? []).map((err) => {
      const path = err.instancePath.replace(/^\//, '').replaceAll('/', '.');
      const missing =
        err.keyword === 'required' && typeof err.params.missingProperty === 'string'
          ? err.params.missingProperty
          : '';
      const name = [path, missing].filter(Boolean).join('.') || '(root)';
      return { name, reason: err.message ?? '스키마 위반', code: err.keyword };
    });
  }

  private getValidator(schemaHash: string, schema: JsonObject): ValidateFunction {
    const cached = this.cache.get(schemaHash);
    if (cached) {
      return cached;
    }
    const validate = this.ajv.compile(schema);
    this.cache.set(schemaHash, validate);
    return validate;
  }
}
