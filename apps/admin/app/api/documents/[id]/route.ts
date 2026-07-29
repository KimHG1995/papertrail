import { NextResponse } from 'next/server';
import { getDocument } from '@/lib/api';

/** 문서 상태/증적 폴링 프록시. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await getDocument(id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
