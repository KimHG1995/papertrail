import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { SkipResponseTransform } from '../../common/decorators/skip-response-transform.decorator.js';
import { MetricsService } from './metrics.service.js';

/** Prometheus 스크레이프 엔드포인트. 인증 없이(@Public) 노출 형식 그대로 반환한다. */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @SkipResponseTransform()
  async scrape(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType());
    res.send(await this.metrics.render());
  }
}
