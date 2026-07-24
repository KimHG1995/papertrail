import type { HashRef, JsonObject, PdfStandard } from '@papertrail/contracts';

/** 렌더 입력. template 은 name:tag 또는 name@sha256:... 참조. */
export interface RenderInput {
  template: string;
  pdfStandard: PdfStandard;
  data: JsonObject;
  recipient: JsonObject | null;
}

/** 렌더 결과. 증적에 기록할 해시들과 PDF 바이트를 담는다. */
export interface RenderOutput {
  /** 렌더에 실제로 쓰인 매니페스트 해시. 해석 불가 시 null. */
  templateHash: HashRef | null;
  /** 결과 PDF 의 콘텐츠 주소(sha256:...). */
  outputHash: HashRef;
  durationMs: number;
  renderId: string;
  pdf: Uint8Array;
}

/** 템플릿 등록(publish) 입력. */
export interface PublishInput {
  name: string;
  tag: string;
  source: string;
  schema?: JsonObject;
  author?: string;
}

/** 템플릿 등록 결과. Papermake 의 콘텐츠 주소(매니페스트 해시). */
export interface PublishOutput {
  manifestHash: HashRef;
}

/** Papermake 렌더 엔진 포트. 게이트웨이(publish)와 워커(render)가 이 인터페이스에만 의존한다. */
export interface PapermakeClient {
  publish(input: PublishInput): Promise<PublishOutput>;
  render(input: RenderInput): Promise<RenderOutput>;
}
