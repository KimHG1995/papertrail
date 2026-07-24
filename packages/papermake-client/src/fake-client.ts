import { createHash, randomUUID } from 'node:crypto';
import type { PapermakeClient, RenderInput, RenderOutput } from './types.js';

/**
 * 로컬 개발용 가짜 렌더러. Papermake(Rust) 를 빌드하지 않고도 파이프라인 전체를
 * 돌릴 수 있게 한다. 결정적(deterministic) 이라 해시 재현성을 검증할 수 있다.
 * template 참조에 'fail' 이 포함되면 실패를 시뮬레이션한다(재시도/DLQ 테스트용).
 */
export class FakePapermakeClient implements PapermakeClient {
  render(input: RenderInput): Promise<RenderOutput> {
    if (input.template.includes('fail')) {
      return Promise.reject(new Error(`가짜 렌더 실패(시뮬레이션): ${input.template}`));
    }

    const payload = JSON.stringify({
      template: input.template,
      pdfStandard: input.pdfStandard,
      data: input.data,
      recipient: input.recipient,
    });
    const pdf = new TextEncoder().encode(`%PDF-1.7 papertrail-fake\n${payload}\n%%EOF`);

    return Promise.resolve({
      templateHash: `sha256:${sha256Hex(input.template)}`,
      outputHash: `sha256:${sha256Bytes(pdf)}`,
      durationMs: 1,
      renderId: randomUUID(),
      pdf,
    });
  }
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
