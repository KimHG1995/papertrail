import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreateDocumentRequest,
  CreateDocumentResponse,
  DocumentDetail,
} from '@papertrail/contracts';

/**
 * 문서 생성/조회 비즈니스 로직.
 * M1 스캐폴딩 단계라 큐/렌더/영속성 연동 전 스텁이다.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  /** 문서 생성 요청을 접수하고 큐에 적재한다(현재는 스텁 응답). */
  enqueue(request: CreateDocumentRequest): CreateDocumentResponse {
    // TODO(M1): 멱등성 확인 → 큐 적재 → 문서 레코드 생성.
    const documentId = `doc_stub_${Date.now().toString(36)}`;
    this.logger.log(
      `문서 생성 요청 접수: template=${request.template}, idempotencyKey=${request.idempotencyKey ?? '(none)'}`,
    );
    return {
      documentId,
      status: 'QUEUED',
      templateVersion: `sha256:${'0'.repeat(64)}`,
      statusUrl: `/v1/documents/${documentId}`,
    };
  }

  /** 문서 증적 상세를 조회한다(현재는 미구현). */
  getDetail(id: string): DocumentDetail {
    // TODO(M1): 증적 레코드 조회 (PostgreSQL, Drizzle).
    throw new NotFoundException(`문서를 찾을 수 없습니다: ${id}`);
  }
}
