import type { PdfStandard } from '@papertrail/contracts';
import type { PapermakeClient, RenderInput, RenderOutput } from './types.js';

/** 우리 PdfStandard → Papermake 가 기대하는 값(1.7 은 접두사 없음)으로 매핑. */
const PDF_STANDARD_MAP: Record<PdfStandard, string> = {
  'pdf-1.7': '1.7',
  'a-2b': 'a-2b',
  'a-3b': 'a-3b',
};

interface RenderResponseBody {
  data: { render_id: string; pdf_hash: string; duration_ms: number };
}

export interface HttpPapermakeClientOptions {
  baseUrl: string;
  /** 테스트 주입용. 미지정 시 전역 fetch 사용. */
  fetchImpl?: typeof fetch;
}

/**
 * Papermake HTTP REST 어댑터.
 *   POST /api/render/{reference}      → { render_id, pdf_hash, duration_ms }
 *   GET  /api/renders/{id}/pdf        → PDF 바이트
 *   GET  /api/templates/{reference}   → 매니페스트 해시(콘텐츠 주소) 해석
 * reference 는 name:tag 또는 name@sha256:... 이며 콜론/@ 는 경로에 허용되어 인코딩하지 않는다.
 */
export class HttpPapermakeClient implements PapermakeClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpPapermakeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async render(input: RenderInput): Promise<RenderOutput> {
    const reference = input.template;
    const templateHash = await this.resolveTemplateHash(reference);

    const renderRes = await this.fetchImpl(`${this.baseUrl}/api/render/${reference}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: input.data,
        pdf_standard: PDF_STANDARD_MAP[input.pdfStandard],
      }),
    });
    if (!renderRes.ok) {
      throw new Error(`Papermake render 실패: ${renderRes.status} ${await safeText(renderRes)}`);
    }
    const { data } = (await renderRes.json()) as RenderResponseBody;

    const pdfRes = await this.fetchImpl(`${this.baseUrl}/api/renders/${data.render_id}/pdf`);
    if (!pdfRes.ok) {
      throw new Error(`Papermake PDF 다운로드 실패: ${pdfRes.status}`);
    }
    const pdf = new Uint8Array(await pdfRes.arrayBuffer());

    return {
      templateHash: asHashRef(templateHash),
      outputHash: asHashRef(data.pdf_hash) ?? sha256Placeholder(),
      durationMs: data.duration_ms,
      renderId: data.render_id,
      pdf,
    };
  }

  /**
   * Papermake 는 콘텐츠 주소 기반이라 템플릿 메타데이터에서 매니페스트 해시를 얻는다.
   * 정확한 필드명은 러닝 중인 Papermake 로 확정한다(현재는 안전하게 null 폴백).
   */
  private async resolveTemplateHash(reference: string): Promise<string | null> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/templates/${reference}`);
      if (!res.ok) {
        return null;
      }
      const meta = (await res.json()) as {
        data?: { hash?: unknown; manifest_hash?: unknown; content_hash?: unknown };
      };
      const hash = meta.data?.hash ?? meta.data?.manifest_hash ?? meta.data?.content_hash;
      return typeof hash === 'string' ? hash : null;
    } catch {
      return null;
    }
  }
}

/** sha256:<64hex> 형식만 통과시키고 아니면 null. */
function asHashRef(value: string | null): `sha256:${string}` | null {
  return value !== null && /^sha256:[0-9a-f]{64}$/.test(value)
    ? (value as `sha256:${string}`)
    : null;
}

/** Papermake 가 유효한 pdf_hash 를 주지 않는 예외 상황의 방어값. */
function sha256Placeholder(): `sha256:${string}` {
  return `sha256:${'0'.repeat(64)}`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
