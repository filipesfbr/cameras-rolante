import { NextResponse, type NextRequest } from 'next/server';
import { readConfig } from '@/lib/config';
import { frames } from '@/lib/storage';
import { parseCursor } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** Público e só leitura. GET /api/frames?cam=<id>&before=<cursor>&limit=<K>  |  ?cam=<id>&after=<cursor> */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const cfg = await readConfig();
  const cam = cfg.cameras.find((c) => c.id === q.get('cam') && c.active);
  if (!cam) return NextResponse.json({ error: 'câmera não encontrada' }, { status: 404 });

  const before = q.get('before');
  const after = q.get('after');
  if ((before && !parseCursor(before)) || (after && !parseCursor(after)))
    return NextResponse.json({ error: 'cursor inválido' }, { status: 400 });

  const limit = Math.min(Math.max(Number(q.get('limit')) || cfg.historyBatch, 1), 48);
  try {
    return NextResponse.json({ frames: await frames(cam.id, { before, after, limit }) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[frames]', (e as Error).message);
    return NextResponse.json({ error: 'falha ao ler o histórico' }, { status: 502 });
  }
}
