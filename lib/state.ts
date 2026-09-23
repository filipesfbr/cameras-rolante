import type { Config } from './config.ts';

// O Next compila instrumentation.ts e as rotas/actions em bundles separados: estado em módulo
// não é compartilhado entre eles. Em globalThis, o agendador e o admin enxergam os mesmos timers.
type State = {
  config?: Config;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  inFlight: Set<string>;
  memo: Map<string, { at: number; v: unknown }>;
  started: boolean;
  gen: number; // sobe a cada rescheduleAll: ticks antigos não rearmam o timer
};

const g = globalThis as unknown as { __cameras?: State };

export const state: State = (g.__cameras ??= {
  timers: new Map(),
  inFlight: new Set(),
  memo: new Map(),
  started: false,
  gen: 0,
});

/** Cache curto em memória (protege o R2 de listagens repetidas do endpoint público). */
export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = state.memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await fn();
  state.memo.set(key, { at: Date.now(), v });
  return v;
}
