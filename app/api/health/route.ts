export const dynamic = 'force-dynamic';

/** Liveness p/ uptime monitor. Não toca config/R2 de propósito. */
export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
