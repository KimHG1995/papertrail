import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** 정형화 제외 여부를 표시하는 메타데이터 키. */
export const SKIP_RESPONSE_TRANSFORM = 'skipResponseTransform';

/**
 * 이 핸들러/컨트롤러의 응답을 { success, data, meta } 정형화에서 제외한다.
 * 헬스체크, 파일 다운로드(스트리밍/리다이렉트) 등 원본을 그대로 반환해야 하는 경우 사용.
 */
export const SkipResponseTransform = (): CustomDecorator =>
  SetMetadata(SKIP_RESPONSE_TRANSFORM, true);
