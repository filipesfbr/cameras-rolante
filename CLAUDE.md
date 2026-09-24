# Câmeras Rolante

Next.js (App Router) + TypeScript que mostra câmeras dos rios de Rolante/RS ao vivo e grava um histórico de prints 24/7 no Cloudflare R2. Sem banco de dados. O README tem só a visão de produto; ambiente, deploy e pipeline estão aqui.

## Ambiente

Node 24 (o do Dockerfile e do CI) e `ffmpeg` no PATH. Não há `.env.example` versionado: crie um `.env.local` na raiz com

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`: conta, token e bucket do R2. O token é `Object Read & Write` **escopado só no bucket** (nunca `Admin`); o secret aparece uma única vez.
- `R2_PUBLIC_URL`: URL pública do bucket (`https://pub-….r2.dev` ou domínio próprio, recomendado em produção porque o `r2.dev` tem limite de taxa), sem barra final. O bucket público expõe leitura, não listagem.
- `ADMIN_PASSWORD`: senha do `/admin`; também assina o cookie de sessão.
- `TZ`: `America/Sao_Paulo`.
- Upload falhando com erro de assinatura ou header não suportado: confira `requestChecksumCalculation: 'WHEN_REQUIRED'` em `lib/r2.ts`.

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

## Pipeline

`CI → bump na develop → release por tag → sync main → develop` (`.github/workflows/`). É o padrão do
repo `filipesfbr/workflow-test`: leia o README dele antes de mexer no fluxo ou simplificar uma guarda.

- Feature: `feat/x` → PR (squash) → `develop`. Release: PR `release: vX.Y.Z` de `develop` → `main` (merge commit). O deploy (Render) sai do push na `develop`, com Auto-Deploy "After CI Checks Pass"; a `main` só marca o release (tag + Release).
- O `bump.yml` sobe a versão **na `develop`**, nunca na branch de um PR: o push do bot num PR faz o GitHub travar os checks em "Approve and run". Minor/major: edite o `package.json` num PR ou rode o `bump.yml` com `kind`. Abra o PR de release só depois do bump terminar.
- O `release.yml` só cria tag e Release e não escreve na `main`. Tag já existente = não faz nada.
- Nunca `--delete-branch` num PR pra `main`: a head é a `develop`.
- O CI roda sem credenciais R2, de propósito.

## Convenções

- Código e comentários em português. Comentários `ponytail:` marcam simplificações deliberadas e o limite delas.
- Arquivos em `lib/` importam com caminho relativo e extensão `.ts` (o teste roda com `--experimental-strip-types`: sem `enum`, sem alias `@/`). `app/` e `components/` usam `@/`.
- CSS Modules com os tokens de `app/globals.css`; não introduzir biblioteca de UI.
- Toda URL de câmera passa por `assertPublicUrl` (`lib/ssrf.ts`): só https e IP público.

## Cuidados

- **Uma réplica só.** Duas instâncias gravam prints duplicados no mesmo bucket. O `npm run dev` local usa o `.env.local`, que aponta pro bucket real, e também grava lá.
- Não rode `npm run build` com o `next dev` ligado: os dois usam `.next`.
- Push feito com `GITHUB_TOKEN` (bump, sync) não dispara workflow: o commit do bump não gera run de CI.
- O deploy sai da `develop`, onde o bot também commita (bump, sync). Só não deploya duas vezes por merge porque o
  Render está em "After CI Checks Pass" e o commit do bot não tem check. Com "On Commit" seriam dois deploys.
- Render Free (Docker, Health Check Path `/api/health`): o serviço dorme após 15 min sem tráfego e a captura para junto. Um monitor de uptime (UptimeRobot) pinga o `/api/health` a cada 10 min ou menos; se ele sair do ar, os prints param.
- Não guarde segredo no `config.json`: ele é legível pela URL pública do bucket.
