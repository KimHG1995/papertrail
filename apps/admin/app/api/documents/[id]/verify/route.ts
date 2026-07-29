import { NextResponse } from 'next/server';
import { verifyDocument } from '@/lib/api';

/** 재현성 검증 프록시. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await verifyDocument(id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
