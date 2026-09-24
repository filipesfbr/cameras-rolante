export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.R2_ACCOUNT_ID) return console.warn('[captura] R2_* não configurado: agendador desligado');
  const { start } = await import('./lib/capture.ts');
  void start(); // não bloqueia o boot se o R2 demorar
}
