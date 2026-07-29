import type { PdfStandard } from '@papertrail/contracts';
import { PapermakeError } from '../errors.js';
import type {
  PapermakeClient,
  PublishInput,
  PublishOutput,
  RenderInput,
  RenderOutput,
} from '../types.js';

/** Papermake 는 metadata.author 가 비어 있으면 400 을 반환하므로 폴백을 둔다. */
const DEFAULT_AUTHOR = 'papertrail';

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

  async publish(input: PublishInput): Promise<PublishOutput> {
    // 빈 문자열(공백만)도 Papermake 는 거부하므로 길이를 명시적으로 확인해 폴백한다(?? 로는 불가).
    const trimmedAuthor = input.author?.trim();
    const author = trimmedAuthor && trimmedAuthor.length > 0 ? trimmedAuthor : DEFAULT_AUTHOR;
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/templates/${input.name}/publish-simple?tag=${encodeURIComponent(input.tag)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          main_typ: input.source,
          metadata: { name: input.name, author },
          ...(input.schema ? { schema: input.schema } : {}),
        }),
      },
    );
    if (!res.ok) {
      throw new PapermakeError(
        res.status,
        'publish',
        `Papermake publish 실패: ${await safeText(res)}`,
      );
    }
    const body = (await res.json()) as {
      data?: { hash?: unknown; manifest_hash?: unknown; pdf_hash?: unknown };
    };
    const hash = body.data?.hash ?? body.data?.manifest_hash ?? body.data?.pdf_hash;
    const manifestHash = asHashRef(typeof hash === 'string' ? hash : null);
    if (!manifestHash) {
      throw new Error('Papermake publish 응답에서 매니페스트 해시를 찾지 못했습니다.');
    }
    return { manifestHash };
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
      throw new PapermakeError(
        renderRes.status,
        'render',
        `Papermake render 실패: ${await safeText(renderRes)}`,
      );
    }
    const { data } = (await renderRes.json()) as RenderResponseBody;

    const pdfRes = await this.fetchImpl(`${this.baseUrl}/api/renders/${data.render_id}/pdf`);
    if (!pdfRes.ok) {
      throw new PapermakeError(pdfRes.status, 'download', `Papermake PDF 다운로드 실패`);
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
   * v0.3.0 기준 GET /api/templates/{ref} → { data: { manifest_hash } }. 실패 시 null 폴백.
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
