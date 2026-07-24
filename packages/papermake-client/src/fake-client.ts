import { createHash, randomUUID } from 'node:crypto';
import type {
  PapermakeClient,
  PublishInput,
  PublishOutput,
  RenderInput,
  RenderOutput,
} from './types.js';

/**
 * 로컬 개발용 가짜 렌더러. Papermake(Rust) 를 빌드하지 않고도 파이프라인 전체를
 * 돌릴 수 있게 한다. 결정적(deterministic) 이라 해시 재현성을 검증할 수 있다.
 * template 참조에 'fail' 이 포함되면 실패를 시뮬레이션한다(재시도/DLQ 테스트용).
 */
export class FakePapermakeClient implements PapermakeClient {
  publish(input: PublishInput): Promise<PublishOutput> {
    // 이름 + 소스로 결정적 매니페스트 해시를 만든다(콘텐츠 주소 모사).
    const manifestHash = sha256Hex(`${input.name}\n${input.source}`);
    return Promise.resolve({ manifestHash: `sha256:${manifestHash}` });
  }

  async render(input: RenderInput): Promise<RenderOutput> {
    if (input.template.includes('fail')) {
      throw new Error(`가짜 렌더 실패(시뮬레이션): ${input.template}`);
    }

    // template 에 'slow' 가 있으면 렌더 지연을 시뮬레이션한다(동시성 제한 관찰용).
    const delayMs = input.template.includes('slow') ? 1200 : 0;
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const payload = JSON.stringify({
      template: input.template,
      pdfStandard: input.pdfStandard,
      data: input.data,
      recipient: input.recipient,
    });
    const pdf = new TextEncoder().encode(`%PDF-1.7 papertrail-fake\n${payload}\n%%EOF`);

    return {
      templateHash: `sha256:${sha256Hex(input.template)}`,
      outputHash: `sha256:${sha256Bytes(pdf)}`,
      durationMs: delayMs || 1,
      renderId: randomUUID(),
      pdf,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
