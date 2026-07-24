import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/** 헬스체크. 인증 없이(@Public) 정형화를 적용하지 않고 원본 그대로 반환한다. */
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @SkipResponseTransform()
  check(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
