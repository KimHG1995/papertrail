import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './auth.constants.js';

/** 인증을 생략하는 공개 라우트로 표시한다(예: 헬스체크). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
