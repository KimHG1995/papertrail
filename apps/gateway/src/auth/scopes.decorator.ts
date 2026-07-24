import { SetMetadata } from '@nestjs/common';
import { REQUIRED_SCOPES_KEY } from './auth.constants.js';

/** 이 라우트가 요구하는 스코프를 지정한다(모두 보유해야 통과). */
export const RequiredScopes = (...scopes: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);
