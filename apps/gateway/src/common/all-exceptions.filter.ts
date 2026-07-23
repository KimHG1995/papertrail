import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  ERROR_CODES,
  problemTypeUri,
  type ErrorCode,
  type FieldError,
  type ProblemDetails,
} from '@papertrail/contracts';
import { REQUEST_ID_HEADER } from './constants.js';
import { statusToErrorCode } from './exception-mapping.js';
import { ProblemException } from './problem.exception.js';

interface ResolvedProblem {
  code: ErrorCode;
  detail?: string;
  errors?: FieldError[];
}

/** 모든 예외를 RFC 7807 application/problem+json 으로 정형화한다. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const traceId = req.traceId ?? randomUUID();
    const instance = req.originalUrl.split('?')[0] ?? req.originalUrl;

    const { code, detail, errors } = this.resolve(exception);
    const { status, title } = ERROR_CODES[code];

    const problem: ProblemDetails = {
      type: problemTypeUri(code),
      title,
      status,
      code,
      timestamp: new Date().toISOString(),
      instance,
      traceId,
      ...(detail !== undefined ? { detail } : {}),
      ...(errors && errors.length > 0 ? { errors } : {}),
    };

    if (status >= 500) {
      this.logger.error(`[${traceId}] ${code}: ${detail ?? ''}`, this.stackOf(exception));
    }

    res.setHeader(REQUEST_ID_HEADER, traceId);
    res.status(status).type('application/problem+json').json(problem);
  }

  private resolve(exception: unknown): ResolvedProblem {
    if (exception instanceof ProblemException) {
      return { code: exception.code, detail: exception.detail, errors: exception.errors };
    }
    if (exception instanceof HttpException) {
      return { code: statusToErrorCode(exception.getStatus()), detail: exception.message };
    }
    return { code: 'INTERNAL', detail: '서버 내부 오류가 발생했습니다.' };
  }

  private stackOf(exception: unknown): string | undefined {
    return exception instanceof Error ? exception.stack : undefined;
  }
}
