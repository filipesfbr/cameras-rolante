# Câmeras Rolante — plano de migração para Next.js

Página estática → app Next.js com captura 24/7, histórico em Cloudflare R2 e admin restrito.

## Status (2026-09-23)

Fases 1–4 implementadas e validadas localmente contra o R2 real. **Falta:** deploy no EasyPanel (env vars + domínio HTTPS) e, com o domínio no ar, trocar o `index.html` do GitHub Pages por um redirect e apagar `index.html`/`hls.min.js` da raiz. A raiz continua com eles de propósito: apagar antes derrubaria o link antigo.

Diferenças em relação ao plano original, todas decididas durante a implementação:

| Ponto | Plano | Feito | Por quê |
|---|---|---|---|
| Middleware | `middleware.ts` | `proxy.ts` | Next 16 renomeou (mesma função) |
| Layout dos cards | `column-width:380px`, raio 14px | `column-count` conforme a quantidade (1–3 lado a lado; 4→2; 5–9→3) com `column-width:380px` de piso, raio 6px, gap 16px | Câmeras o maior possível, ocupando a largura toda. Mantém a altura independente por card |
| Barra do card | nome, "fonte ↗", badge, botões de texto | grid: nome + ícone de fonte → status → botões só de ícone (atualizar imagem, histórico) | Pedido do usuário. Container query quebra em 2 linhas em card estreito |
| Clique na thumb | frame cheio no Overlay | print aparece **dentro do card, por cima do ao vivo**, badge vira `PRINT · dd/mm hh:mm`, botão "Voltar ao vivo" no grid, thumb selecionada destacada. Clicar no print amplia no Overlay | Pedido do usuário: sem modal gigante |
| Polling da faixa | no ritmo do intervalo da câmera | a cada 60s | Polling no exato intervalo cai fora de fase com a captura e atrasaria um ciclo |
| Header | relógio com rótulo "AGORA" | só data e hora, fonte 18px | Pedido do usuário |
| Scroll da página | não previsto | `scrollbar-gutter: stable` | A largura das câmeras não pula quando a página passa a ter scroll |
| Primeiro print | só após o intervalo | 10s depois de subir | Não fica um ciclo inteiro sem print a cada redeploy |
| Teste antes de salvar | testar câmera | "Salvar" só habilita após um teste bem-sucedido da mesma URL | Câmera fora do ar no momento do cadastro não entra; aceitável |

## Contexto

Hoje o projeto é um único `index.html` (12,8KB) + `hls.min.js` vendorizado (603KB), publicado no GitHub Pages. Exibe ao vivo 2 câmeras HLS do Rio Areia em Rolante/RS, com detecção de queda/travamento e overlay ampliado. Um botão de captura manual existia e foi removido no commit `f3ccf1e`.

O objetivo é registrar a evolução do nível do rio ao longo do tempo — as câmeras apontam para uma régua graduada e queimam data/hora na própria imagem. Uma cheia sobe de madrugada, então a captura precisa acontecer **sem ninguém com o navegador aberto**. Isso é o que força a migração: página estática não captura sozinha.

O design em `design/` (handoff do Claude Design, alta fidelidade) é a referência visual desta implementação.

### Fatos apurados (testados, não presumidos)

- Streams servem `Access-Control-Allow-Origin: *`, sem autenticação
- `ffmpeg -i <m3u8> -frames:v 1` puxa frame direto do servidor, **sem browser**: 2560x1440 nativo
- Uma única chamada ffmpeg gera full + thumb em **1,1s**: `1280px/q5 = 193KB`, `320px/q6 = 11,7KB`
- Segmentos são fMP4 de 4s em janela deslizante curta (segmento expira em segundos — sempre reler o playlist)

### Decisões travadas

| Decisão | Escolha |
|---|---|
| Onde captura roda | Servidor 24/7 (ffmpeg, sem browser) |
| Stack | Next.js App Router + TypeScript |
| Estilo | CSS Modules + variáveis CSS com os tokens do design. Sem Tailwind |
| Host | VPS própria com EasyPanel, build por Dockerfile apontando pra `main` |
| **Armazenamento** | **Cloudflare R2** — imagens e config. Container fica sem estado |
| Deploy | Público, URL nova (Pages sai, com redirect) |
| Histórico | Faixa embaixo de cada câmera, na mesma página. Recolhível, fechada por padrão |
| Navegação da faixa | Abre com lote de K thumbs, scroll infinito pra trás, print novo entra sozinho |
| Intervalo | Por câmera, com padrão global. Select 5/15/30/60 min |
| Retenção | Varredura própria com `DeleteObjects` (o R2 não cobra delete) |
| Câmeras | Add/remove/ativa/histórico pelo admin, com teste antes de salvar |

---

## Armazenamento: Cloudflare R2

A VPS não guarda imagem nenhuma. O container é **stateless** — sem volume no EasyPanel, o que também elimina o erro clássico de esquecer o volume e perder o histórico a cada redeploy.

```
bucket/
  config.json
  shots/<camId>/<YYYY-MM-DD>/
    143000.jpg          ← 1280px, ~193KB
    143000.thumb.jpg    ← 320px,  ~12KB
```

A key **é** o timestamp, e a ordem lexicográfica do `ListObjectsV2` já é a ordem cronológica — paginação sem índice nenhum.

### Credenciais (env vars no EasyPanel)

| Var | Origem |
|---|---|
| `R2_ACCOUNT_ID` | ID da conta Cloudflare |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens → Create API Token |
| `R2_SECRET_ACCESS_KEY` | mostrado uma única vez na criação |
| `R2_BUCKET` | nome do bucket |
| `R2_PUBLIC_URL` | domínio público do bucket |
| `ADMIN_PASSWORD` | senha do `/admin` |
| `TZ` | `America/Sao_Paulo` |

Endpoint derivado: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, região `auto`.

**Token com `Object Read & Write`, escopado só nesse bucket.** Não usar `Admin Read & Write`: é conta inteira, não dá pra escopar por bucket, e só serviria pra editar configuração de bucket. A retenção usa `DeleteObject`, que o R2 não cobra nem exige permissão de admin.

### Custo (2 câmeras, 5 min, 30 dias)

| Recurso | Uso | Free tier |
|---|---|---|
| Storage | 3,5 GB | 10 GB |
| Class A (PUT/LIST) | ~35 mil/mês | 1 milhão |
| Class B (GET) | tráfego da página | 10 milhões |
| DELETE | retenção | não cobrado |
| Egress | tudo | grátis |

$0/mês com folga. Storage estoura o free tier só com ~6 câmeras a 5 min; acima disso são $0,015/GB-mês.

### Servir as imagens

Bucket com leitura pública por **domínio customizado** (`imgs.<dominio>`), referenciado direto no `<img src>`. Egress grátis, CDN da Cloudflare, e a VPS não serve byte de imagem nenhum. Isso **elimina** a rota `/api/shot/[...path]` e o risco de path traversal junto com ela.

> Domínio customizado exige um domínio hospedado na Cloudflare. Sem ele, dá pra começar no subdomínio `r2.dev` (um clique, sem domínio próprio) — mas a Cloudflare limita taxa e diz que não é pra produção. Trocar depois é só mudar `R2_PUBLIC_URL`.
>
> **Situação atual:** bucket `cameras-rolante` com o `r2.dev` habilitado (`https://pub-91ab0e96fe60426bb98622b7f55e1b82.r2.dev`). A leitura é pública por chave (sem login); listar o bucket não é possível por ali. Como o `config.json` mora no mesmo bucket, ele também é legível: não guardar segredo nele.

---

## O que o design define

Fonte: `design/README.md` + os dois protótipos. O README é explícito que o formato de autoria (`<sc-for>`, `DCLogic`, estilos inline) **não** deve ser copiado — só o visual e o comportamento.

**Identidade nova** (substitui o cinza atual): fundo `#0b1211`, header/footer `#161f1d`, barra de label `#141c1a`, painel de histórico `#0d1211`. Texto `#e8e8e8`/`#f2f2f2`, mutados `#8a8f98`/`#7d828c`/`#6b6f78`. Azul de acento `#5b9bf0`, destaque ativo `rgba(91,155,240,.16)` + `#8fbcf5`. Status verde `#7fc97f` / vermelho `#e07a7a`. Bordas `rgba(255,255,255,.06–.1)`. Raio 14px nos cards, 8–12px em botões. Sombra `0 8px 24px rgba(0,0,0,.35)`. Fontes Space Grotesk (UI) e Space Mono (relógio e timestamps).

**Layout multi-coluna, não grid.** `column-count` (máximo, conforme a quantidade de câmeras) + `column-width:380px` (piso, no mobile cai pra 1 coluna) e `break-inside:avoid`. O README diz que é deliberado: a altura de cada card fica independente, então abrir o histórico de uma câmera não empurra nem estica a vizinha. Preservar.

**Card:** vídeo 16:9 clicável → overlay ampliado. Barra de label em grid: nome da câmera com ícone de fonte, badge com bolinha de status, e um grid de botões só de ícone (voltar ao vivo, atualizar imagem, histórico).

**Faixa:** fechada por padrão. Eyebrow "HISTÓRICO · a cada N min". Scroll horizontal com scrollbar fina customizada, thumbs 96×64px, gap 8px, hora `HH:MM` embaixo em Space Mono 10px. **Mais recente à esquerda.**

**Grid view:** botão no header abre mosaico fullscreen preto, sem chrome, `gap:2px`, `object-fit:contain`. ✕ e Escape fecham. Uma instância HLS por vídeo, destruída ao fechar.

**Admin:** portão de senha, card "Configurações gerais" (select de intervalo, número de imagens 4–48), card "Câmeras" com form inline de adicionar e, por câmera, URL em monoespaçada, botão Remover e dois pills: `Ativa/Inativa` e `Histórico: ligado/desligado`.

### Onde a implementação diverge do protótipo (de propósito)

| Ponto | Protótipo | Implementação | Por quê |
|---|---|---|---|
| Reconexão HLS | retry a cada 4s pra sempre | Preservar a lógica do `index.html:189-277`: `MAX_RECONNECT`, contagem regressiva, `FORA DO AR`, detecção de travamento | O mock é mais simples que o que já roda em produção. Copiar literalmente seria regressão. O badge aceita qualquer texto |
| Histórico | K imagens fixas geradas na hora | K é o **lote inicial**; scroll busca mais até o fim da retenção | Mantém o controle do admin e o alcance total |
| Intervalo | global | Por câmera, com o global de padrão | Aberto pelo próprio README do design |
| Clique na thumb | não definido | Abre o frame cheio no mesmo overlay | Lacuna do design |
| Grid 2 colunas | fixo | Colunas conforme a contagem de câmeras | Com 5 câmeras, `repeat(2,…)` deixa a última linha pela metade |
| Fontes | Google Fonts por `<link>` | `next/font/google` | Self-host no build: sem request externo, sem layout shift |
| Admin | só intervalo e K | + toggle mestre, retenção, testar câmera, apagar período | Já decididos; entram na linguagem visual do design |

---

## Duas superfícies

| | Público (sem login) | Restrito (`/admin`, senha) |
|---|---|---|
| Rotas | `/` — ao vivo, grid view, faixa por câmera | `/admin`, `/login` |
| Pode | Ver ao vivo, abrir mosaico, rolar histórico, abrir frame cheio | Toggle mestre, intervalo global e por câmera, retenção, K, add/remove/ativa/histórico, testar câmera, apagar período |
| Não pode | Nada que escreva | — |

Público é **estritamente leitura**. O admin não é linkado da página pública.

---

## Arquitetura

**Um processo só.** Next.js como servidor Node (não serverless), com o agendador embutido via `instrumentation.ts`. Sem worker separado, sem fila, sem banco.

> Por que não Vercel: serverless não roda loop contínuo (cron do Hobby é 1x/dia) e não tem ffmpeg.

### Config

Vive no R2 como `config.json`, com cache em memória invalidado no save. `PutObject` substitui o objeto inteiro de forma atômica — sem risco de corromper no meio da escrita.

```ts
type Config = {
  captureEnabled: boolean;      // toggle mestre
  intervalSec: number;          // padrão global (5/15/30/60 min)
  historyBatch: number;         // 4–48, lote inicial da faixa
  retentionDays: number;
  cameras: Array<{
    id: string;                 // slug, vira prefixo de key
    name: string;               // "Ponte do Grassmann"
    location: string;           // "Rio Areia"
    streamUrl: string;
    sourceUrl?: string;
    active: boolean;            // aparece na página pública
    captureEnabled: boolean;    // "Histórico: ligado" no admin
    intervalSec?: number;       // sobrescreve o global
  }>;
};
```

### Agendador — um timer por câmera

```ts
// lib/capture.ts
function scheduleCamera(camId: string) {
  clearTimeout(timers[camId]);
  timers[camId] = setTimeout(async () => {
    const cfg = await readConfig();
    const cam = cfg.cameras.find(c => c.id === camId);
    if (!cam) return;                                  // removida no admin
    if (cfg.captureEnabled && cam.captureEnabled && !inFlight.has(camId)) {
      await grab(cam);
    }
    scheduleCamera(camId);                             // relê intervalo a cada ciclo
  }, (cam.intervalSec ?? cfg.intervalSec) * 1000);
}
```

- `rescheduleAll()` é chamado pela action que salva a config: derruba os timers e recria, pra mudança valer na hora
- `inFlight` por câmera impede sobreposição se um grab demorar mais que o intervalo
- `spawn` com kill em 30s: câmera fora do ar não trava o ciclo dela nem o das outras
- flags `-nostdin -loglevel error -y` (contexto de daemon)
- ffmpeg grava em `/tmp`, sobe os dois arquivos pro R2, apaga o local
- `grab()` é reaproveitado pelo botão "testar câmera" do admin

### API de frames

```
GET /api/frames?cam=<id>&before=<cursor>&limit=<K>   → mais antigos (scroll)
GET /api/frames?cam=<id>&after=<cursor>              → mais novos (polling)
```

Cursor é `YYYY-MM-DDTHHmmss`. `ListObjectsV2` com `prefix=shots/<cam>/<dia>/` devolve o dia em ordem cronológica; reverte em memória e, se não completou o lote, desce pro dia anterior. Os dias existentes saem de um list com `delimiter=/` (vem em `CommonPrefixes`).

> `ponytail:` varredura linear pelos prefixos de dia. A 30 dias de retenção nunca dói. Se doer, um `index.json` por dia escrito na captura resolve sem mudar a API.

### Estrutura de arquivos

```
app/
  layout.tsx                    # next/font, tokens CSS globais
  page.tsx                      # PÚBLICO
  admin/page.tsx                # RESTRITO
  admin/actions.ts              # Server Actions (cada uma chama requireAdmin())
  login/page.tsx
  api/frames/route.ts
components/
  CameraCard.tsx                # vídeo + barra de label + faixa recolhível
  CameraPlayer.tsx              # hls.js + reconexão + stall watch
  HistoryStrip.tsx              # scroll infinito + auto-append
  GridView.tsx                  # mosaico fullscreen
  Overlay.tsx                   # vídeo ampliado OU frame cheio
  Clock.tsx
  CamerasApp.tsx                # header + colunas + estado do overlay/mosaico (página pública)
  attachHls.ts                  # liga um stream HLS a um <video> (overlay e mosaico)
  AdminPanel.tsx                # configurações, câmeras, apagar período
  LoginForm.tsx
lib/
  r2.ts                         # cliente S3, put/list/delete
  config.ts                     # config.json no R2 + cache
  capture.ts                    # ffmpeg + agendador
  storage.ts                    # keys, cursor, retenção, exclusão por período
  auth.ts                       # cookies + requireAdmin()
  session.ts                    # HMAC via Web Crypto: token e comparação de senha (sem dependência do Next)
  ssrf.ts                       # https + IP público (net.BlockList)
  state.ts                      # estado em globalThis + cache curto (memo)
  time.ts                       # dia/hora de Brasília, cursor
instrumentation.ts
proxy.ts
design/                         # referência: README.md + os 2 protótipos
Dockerfile
```

---

## Fases

**Fase 1 — Base, design e ao vivo.** Next + TS + `output:'standalone'`, Dockerfile com ffmpeg, subir no EasyPanel com domínio. Tokens em variáveis CSS, `next/font/google`, layout multi-coluna. `CameraPlayer` com a lógica de reconexão e stall detection portada do `index.html:189-277`. Overlay e grid view. Trocar o `hls.min.js` vendorizado pelo pacote npm. Deletar `index.html` e `hls.min.js` da raiz só depois da paridade confirmada; limpar a pasta `design/` (apagar a cópia do `hls.min.js`, tirar os sufixos `(1)`/`(3)` dos nomes).

**Fase 2 — Motor de captura.** Cliente R2, `config.json` com defaults, timers por câmera, grab via ffmpeg (full + thumb numa chamada) com upload pro R2, varredura de retenção diária. Config ainda editada à mão.

**Fase 3 — Admin restrito.** Login por senha, `proxy.ts` + `requireAdmin()` nas actions. Configurações gerais (toggle mestre, intervalo, K, retenção, estimativa de uso), CRUD de câmeras com os pills `Ativa` e `Histórico`, intervalo por câmera, testar câmera antes de salvar, apagar período com confirmação.

> Admin antes da faixa de propósito: assim que a Fase 2 sobe na VPS, a captura está exposta. A Fase 3 fecha essa janela.

**Fase 4 — Faixa de histórico.** `/api/frames` + `HistoryStrip`. Abre fechada, botão alterna. Primeiro lote = `historyBatch`, mais antigos via `IntersectionObserver` na ponta direita, novos por polling a cada 60s. Clique na thumb abre o print dentro do card, por cima do ao vivo, com botão "Voltar ao vivo" no grid; clicar no print amplia no `Overlay`.

---

## Pontos de atenção

**Proxy (o antigo middleware) sozinho não protege Server Action.** Next trata Server Action como endpoint público — dá pra invocar por POST direto, sem passar pela página que a renderizou. Toda action de mutação chama `requireAdmin()` no começo; o proxy é só a conveniência que redireciona pro login. Cookie httpOnly assinado com HMAC via Web Crypto — funciona no runtime Edge e sobrevive a restart, sem dependência nova.

**SSRF no cadastro e no teste de câmera.** Ambos fazem o ffmpeg buscar URL arbitrária de dentro da VPS. Validar: exigir `https` e rejeitar hostname que resolva pra IP privado/loopback/link-local. O login barra a maior parte, mas a validação fica — é o caminho mais exposto. **Limite conhecido:** a validação roda no cadastro, no teste e em todo grab, mas um playlist remoto que redirecione (`-max_redirects` padrão é 8) ou aponte segmentos para um endereço interno não é filtrado pela aplicação, e o DNS pode mudar entre a checagem e o ffmpeg. O `-protocol_whitelist` já barra `file:` e afins; fechar o resto exige restringir a saída de rede do container.

**Checksum do AWS SDK v3 contra o R2.** Versões recentes do `@aws-sdk/client-s3` mandam headers `x-amz-checksum-*` por padrão, e o R2 não implementa parte deles. Se aparecer erro de assinatura ou header não suportado, setar `requestChecksumCalculation: "WHEN_REQUIRED"` no client. Primeira coisa a checar se o upload falhar de forma esquisita.

**Chave secreta aparece uma vez só.** O `R2_SECRET_ACCESS_KEY` não é recuperável depois da criação do token. Guardar no gerenciador de senhas na hora; se perder, gerar token novo.

**Prepend não pode pular o scroll.** Inserir thumb nova numa faixa sendo rolada move o conteúdo sob o dedo. Guardar `scrollWidth`/`scrollLeft` antes e restaurar depois. Bug clássico de scroll infinito.

**Não empurrar frame novo em quem foi pro passado.** Auto-append só com a faixa na ponta ao vivo; se o usuário rolou pra trás, os novos ficam em buffer com indicador de quantos chegaram.

**Grid view custa banda.** Abrir o mosaico sobe uma instância HLS por câmera ao mesmo tempo. Com 2 tudo bem; com 5+ pesa no cliente. Destruir todas no fechamento é obrigatório e não pré-carregar nada antes de abrir.

**Apagar período é irreversível.** Confirmação com o intervalo e a contagem de objetos antes de executar.

**Timezone.** Container roda em UTC por padrão. Sem `TZ=America/Sao_Paulo`, print das 21h BRT cai no prefixo do dia seguinte e o cursor fica torto. Setar no Dockerfile **e** no EasyPanel.

**Relógio da câmera.** O carimbo queimado na imagem fica ~2 min atrás do nome da key (que usa o relógio do servidor, em Brasília). É o relógio/latência da câmera: no ao vivo o atraso é o mesmo. Erro de fuso seria de horas.

**Réplica única.** Duas réplicas = captura duplicada no mesmo bucket. Manter replicas=1.

**Cache das imagens.** Subir os objetos com `Cache-Control: public, max-age=31536000, immutable` — frame nunca muda, e é isso que faz a rolagem pra trás parecer instantânea na segunda passada.

**GitHub Pages.** Trocar o `index.html` publicado por um redirect de uma linha pro novo domínio, pra não quebrar link salvo.

---

## Verificação

**Ao vivo e design**
1. Card bate com os tokens do design; fontes carregam self-hosted (sem request a fonts.googleapis.com no Network)
2. Abrir o histórico de uma câmera não muda a altura nem a posição das vizinhas (é o motivo do layout multi-coluna)
3. Derrubar uma câmera de propósito: badge percorre `reconectando (N)` e chega em `FORA DO AR` — a lógica rica sobreviveu à migração
4. Grid view abre, Escape fecha, e nenhuma instância HLS fica viva depois

**Captura e R2**
5. `intervalSec: 300` numa câmera e override de 900 em outra: as duas gravam no próprio ritmo
6. Objetos aparecem no bucket como `shots/<cam>/<hoje>/<HHmmss>.jpg` + `.thumb.jpg`
7. Timestamp queimado pela câmera bate com o nome da key (valida o TZ)
8. `/tmp` não acumula: arquivo local é apagado depois do upload
9. Desligar o toggle mestre → nenhuma câmera grava no ciclo seguinte
10. `retentionDays: 0` + objetos antigos criados à mão → varredura apaga os antigos, mantém os de hoje
11. Reiniciar o container e confirmar que o histórico continua lá (prova que nada depende do disco local)

**Faixa**
12. Abre fechada; o botão alterna e o primeiro lote traz exatamente `historyBatch` thumbs
13. Rolar pra direita carrega mais e atravessa a virada de dia sem buraco nem repetição
14. Chegar no frame mais antigo: a faixa para, sem loop nem erro
15. Na ponta ao vivo, esperar um tick → thumb nova entra sozinha, sem pular o scroll
16. Rolado pro passado, esperar um tick → nada se move; aparece o indicador de novos
17. Câmera sem nenhum print renderiza estado vazio, não quebra

**Separação das superfícies**
18. Aba anônima: `/` abre; `/admin` redireciona pro login
19. POST direto numa action de mutação sem cookie é rejeitado (prova que não depende só do middleware)
20. Testar câmera com `http://127.0.0.1:3000` é recusado pela validação de SSRF

**Docker e produção**
21. `docker exec ... ffmpeg -version` responde; `docker exec ... date` mostra horário de Brasília
22. Deploy da `main` com as 7 env vars setadas
23. Salvar config no admin reprograma os timers na hora
24. 24h rodando: virada de meia-noite cria o prefixo do dia novo e a faixa atravessa a virada

---

### Resultado da verificação (local, R2 real, 2026-09-23)

| # | Resultado |
|---|---|
| 1 | ✅ Fontes servidas de `/_next/static/media`, nenhuma requisição a fonts.googleapis.com |
| 2 | ✅ Abrir o histórico não altera a largura nem a posição do vizinho |
| 3 | ✅ Câmera derrubada: `queda — reconectando (8)…(1)` → `FORA DO AR` em ~19s, como no original |
| 4 | ✅ Mosaico abre, Escape fecha, vídeos do mosaico destruídos |
| 5 | ⚠️ Não testado com duas câmeras em intervalos diferentes. O intervalo por câmera está implementado |
| 6 | ✅ `shots/<cam>/<hoje>/<HHmmss>.jpg` + `.thumb.jpg`, com `Cache-Control: public, max-age=31536000, immutable` |
| 7 | ✅ Fuso correto (Brasília). Delta de ~2 min é o relógio da câmera, ver Pontos de atenção |
| 8 | ✅ `/tmp` do container fica vazio, inclusive depois de timeout de câmera |
| 9 | ⚠️ Toggle mestre não exercitado por mim (o config foi editado no admin pelo usuário: intervalo, lote e retenção salvaram e reagendaram) |
| 10 | ✅ Retenção apaga dias velhos da câmera existente e de câmera removida, mantém os recentes, é idempotente e não toca no `config.json` |
| 11 | ⚠️ Reinício do container não testado com histórico; o container é stateless por construção |
| 12–14 | ✅ Lote inicial correto; scroll infinito atravessa 5 dias sem buraco nem repetição e para no mais antigo |
| 15–16 | ⚠️ Entrada automática de print novo e buffer "N novas" não exercitados no navegador |
| 17 | ⚠️ Estado vazio implementado, não exercitado |
| 18 | ✅ `/admin` sem cookie redireciona pro login (307) |
| 19 | ✅ POST direto em Server Action sem cookie não executa nada; com cookie válido executa |
| 20 | ✅ `http://`, loopback, `localhost`, `169.254.169.254`, `[::1]`, rede privada recusados |
| 21 | ✅ `ffmpeg -version` responde; `date` mostra -03; processo roda como usuário `node` |
| 22, 24 | ⏳ Dependem do deploy no EasyPanel |
| 23 | ✅ Salvar config no admin reprograma os timers (`rescheduleAll`) |

## Fora de escopo (decidido, não esquecido)

Rota `/historico` separada, timelapse, comparação lado a lado, exportação zip/mp4, painel de status e botão "capturar agora". O `grab()` já deixa os dois últimos prontos, e a estrutura de prefixos por dia deixa timelapse barato de adicionar. Banco de dados só quando a paginação por `ListObjectsV2` doer — o que não acontece nas ordens de grandeza aqui.
