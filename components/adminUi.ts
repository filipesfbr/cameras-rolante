export const OPTIONS = [
  [300, '5 minutos'],
  [900, '15 minutos'],
  [1800, '30 minutos'],
  [3600, '1 hora'],
] as const;

export const labelOf = (sec: number) => OPTIONS.find(([v]) => v === sec)?.[1] ?? `${Math.round(sec / 60)} min`;

export const agoText = (ms: number) => {
  const min = Math.round(ms / 60_000);
  return min < 1 ? 'agora mesmo' : `há ${min} min`;
};

const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');

export const fmtBytes = (b: number) => {
  if (b >= 1024 ** 3) return `${trim(b / 1024 ** 3)} GB`;
  if (b >= 1024 ** 2) return `${trim(b / 1024 ** 2)} MB`;
  if (b >= 1024) return `${trim(b / 1024)} KB`;
  return `${b.toLocaleString('pt-BR')} bytes`;
};

export const fmtExact = (b: number) => `${b.toLocaleString('pt-BR')} bytes`;
