import { NextResponse, type NextRequest } from 'next/server';
import { readConfig } from '@/lib/config';
import { parseFramesQuery } from '@/lib/query';
import { frames } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Público e só leitura. GET /api/frames?cam=<id>&before=<cursor>&limit=<K>  |  ?cam=<id>&after=<cursor> */
export async function GET(req: NextRequest) {
  const cfg = await readConfig();
  const p = parseFramesQuery(req.nextUrl.searchParams, cfg.cameras, cfg.historyBatch);
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: p.status });

  try {
    return NextResponse.json({ frames: await frames(p.cam.id, { before: p.before, after: p.after, limit: p.limit }) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[frames]', (e as Error).message);
    return NextResponse.json({ error: 'falha ao ler o histórico' }, { status: 502 });
  }
}
