import type { CreateDocumentRequest } from '@papertrail/contracts';
import { NextResponse } from 'next/server';
import { createDocument } from '@/lib/api';

/** 브라우저 → 게이트웨이 문서 생성 프록시(API Key 는 서버에만 보관). */
export async function POST(req: Request) {
  const body = (await req.json()) as CreateDocumentRequest;
  try {
    return NextResponse.json(await createDocument(body));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
