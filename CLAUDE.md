# Câmeras Rolante

Next.js (App Router) + TypeScript que mostra câmeras dos rios de Rolante/RS ao vivo e grava um histórico de prints 24/7 no Cloudflare R2. Sem banco de dados. O README tem a visão de produto e o deploy; `design/PLANO.md` tem as decisões e a checklist de verificação.

## Comandos

```bash
npm run dev         # http://localhost:3000, precisa de ffmpeg no PATH
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-strip-types --test lib/*.test.ts
npm run build       # output: 'standalone', é o que o Dockerfile roda
```

## Arquitetura

- `instrumentation.ts` sobe o agendador (`lib/capture.ts`) junto com o servidor. Sem `R2_ACCOUNT_ID` ele não sobe.
- **A captura roda dentro do processo do servidor:** um `setTimeout` por câmera, `ffmpeg` puxa o frame do m3u8 (mata em 30 s) e sobe `full` + `thumb` pro R2. Falha só registra `[captura]` no log e o timer é rearmado. Processo parado = sem prints.
- `lib/state.ts` guarda timers e flags em `globalThis`: o Next compila `instrumentation.ts` e as Server Actions em bundles separados, então estado em módulo não é compartilhado.
- `config.json` no R2 é a fonte da configuração (editada no `/admin`, relida a cada ciclo). Os defaults ficam em `lib/config.ts`.
- Keys: `shots/<camId>/<AAAA-MM-DD>/<HHmmss>.jpg` e `.thumb.jpg`. A ordem alfabética do `ListObjectsV2` é a cronológica, por isso não há índice. O dia é sempre o de Brasília (`lib/time.ts`).
- Retenção: `sweep()` em `lib/storage.ts` roda ao subir e a cada 24 h. Não há regra de lifecycle no R2.
- As imagens vêm direto da URL pública do bucket (`R2_PUBLIC_URL`); o servidor só entrega a lista de keys em `/api/frames`.
- Auth: cookie HMAC assinado com `ADMIN_PASSWORD` (`lib/session.ts`). O `proxy.ts` só redireciona; **toda Server Action de mutação tem que chamar `requireAdmin()`**, porque Server Action é endpoint público.

## Convenções

- Código e comentários em português. Comentários `ponytail:` marcam simplificações deliberadas e o limite delas.
- Arquivos em `lib/` importam com caminho relativo e extensão `.ts` (o teste roda com `--experimental-strip-types`: sem `enum`, sem alias `@/`). `app/` e `components/` usam `@/`.
- CSS Modules com os tokens de `design/`; não introduzir biblioteca de UI.
- Toda URL de câmera passa por `assertPublicUrl` (`lib/ssrf.ts`): só https e IP público.

## Cuidados

- **Uma réplica só.** Duas instâncias gravam prints duplicados no mesmo bucket. O `npm run dev` local usa o `.env.local`, que aponta pro bucket real, e também grava lá.
- Não rode `npm run build` com o `next dev` ligado: os dois usam `.next`.
- Não guarde segredo no `config.json`: ele é legível pela URL pública do bucket.
- Não existe `.env.example` versionado. As variáveis estão na tabela do README.
