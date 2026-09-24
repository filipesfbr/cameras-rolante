// Dia e hora sempre em Brasília, independente do TZ do container.
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

/** day = AAAA-MM-DD, t = HHmmss (ambos em Brasília) */
export function stamp(d: Date = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, t: `${p.hour}${p.minute}${p.second}` };
}

/** cursor = AAAA-MM-DDTHHmmss */
export const cursorOf = (day: string, t: string) => `${day}T${t}`;

export function parseCursor(c: string | null | undefined) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{6})$/.exec(c ?? '');
  return m ? { day: m[1], t: m[2] } : null;
}

export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
