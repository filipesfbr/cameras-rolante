import type { Camera } from './config.ts';
import { parseCursor } from './time.ts';

export type FramesQuery =
  | { error: string; status: number }
  | { cam: Camera; before: string | null; after: string | null; limit: number };

/** GET /api/frames?cam=<id>&before=<cursor>&limit=<K>  |  ?cam=<id>&after=<cursor> */
export function parseFramesQuery(q: URLSearchParams, cameras: Camera[], batch: number): FramesQuery {
  const cam = cameras.find((c) => c.id === q.get('cam') && c.active);
  if (!cam) return { error: 'câmera não encontrada', status: 404 };

  const before = q.get('before');
  const after = q.get('after');
  if ((before && !parseCursor(before)) || (after && !parseCursor(after))) return { error: 'cursor inválido', status: 400 };

  const limit = Math.min(Math.max(Number(q.get('limit')) || batch, 1), 48);
  return { cam, before, after, limit };
}
