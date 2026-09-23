# Câmeras Rolante

Câmeras de monitoramento dos rios de Rolante/RS, ao vivo e com histórico de prints.
As câmeras apontam para uma régua graduada e queimam data/hora na imagem, então o histórico
mostra a evolução do nível do rio, inclusive de madrugada.

O projeto apenas exibe as imagens; os links das câmeras vêm do portal
[alerta.rolante.ifrs.edu.br](https://alerta.rolante.ifrs.edu.br/niveis-rios-arroios),
e os streams são carregados das páginas das câmeras em `rolante.solutti.net`.

## Como funciona

- **Ao vivo:** o navegador toca o HLS direto da fonte (hls.js), com reconexão, contagem
  regressiva, `FORA DO AR` e detecção de stream travado.
- **Captura 24/7:** o servidor Node roda um timer por câmera. A cada ciclo o `ffmpeg` puxa um frame
  do m3u8 (sem browser), gera `full` (1280px) e `thumb` (320px) numa chamada só e sobe para o
  Cloudflare R2. O container não guarda nada em disco.
- **Histórico:** faixa recolhível em cada câmera, com scroll infinito para trás e print novo
  entrando sozinho. As imagens vêm direto do R2 pela URL pública; a VPS só entrega a lista de keys.
- **Retenção:** varredura própria ao subir e a cada 24h apaga os dias mais velhos que `retentionDays`.
- **Admin (`/admin`, com senha):** toggle mestre, intervalo global e por câmera, retenção, cadastro
  de câmeras (com teste antes de salvar), ativar/desativar, apagar período.

### Armazenamento no R2

```
bucket/
  config.json                                  configuração editada no /admin
  shots/<camId>/<AAAA-MM-DD>/<HHmmss>.jpg       1280px, ~180KB
  shots/<camId>/<AAAA-MM-DD>/<HHmmss>.thumb.jpg  320px, ~10KB
```

A key é o próprio id da imagem e a ordem alfabética do `ListObjectsV2` já é a cronológica, sem banco
nem índice. O dia é sempre o de Brasília, independente do fuso do container.

## Stack

Next.js (App Router) + TypeScript, CSS Modules com os tokens do design (`design/`), hls.js,
`@aws-sdk/client-s3` (R2 é compatível com S3) e ffmpeg. Sem banco de dados.

## Variáveis de ambiente

| Variável | O que é |
|---|---|
| `R2_ACCOUNT_ID` | ID da conta Cloudflare |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | token R2 `Object Read & Write`, escopado só no bucket |
| `R2_BUCKET` | nome do bucket |
| `R2_PUBLIC_URL` | URL pública do bucket (`https://pub-….r2.dev` ou domínio próprio), sem barra final |
| `ADMIN_PASSWORD` | senha do `/admin` (também assina o cookie de sessão) |
| `TZ` | `America/Sao_Paulo` |

Copie `.env.example` para `.env.local` para rodar localmente.

## Rodar localmente

Precisa de Node 20+ e `ffmpeg` no PATH.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # paginação, fuso, SSRF e sessão
npm run build
```

## Deploy (EasyPanel)

1. App a partir do repositório, branch `main`, build por **Dockerfile** (traz ffmpeg e tzdata).
2. Cadastre as variáveis acima no app. Sem volume: o container é stateless.
3. Mantenha **uma réplica só**: duas réplicas gravariam prints duplicados no mesmo bucket.
4. Domínio com HTTPS: o cookie de sessão é `secure` em produção.

## Cloudflare R2

1. Crie o bucket e habilite a leitura pública (Settings → Public Development URL, ou um domínio
   customizado, que é o recomendado para produção: o `r2.dev` tem limite de taxa).
2. R2 → Manage API Tokens → token `Object Read & Write`, **escopado só nesse bucket** (não use
   `Admin`). O secret é mostrado uma única vez.
3. Se o upload falhar com erro de assinatura ou header não suportado, confira o
   `requestChecksumCalculation: 'WHEN_REQUIRED'` em `lib/r2.ts`.

O bucket público expõe leitura, não listagem. O `config.json` fica legível, então não guarde segredo nele.

## Segurança

O `/admin` é protegido por senha; toda Server Action de mutação valida a sessão (`requireAdmin()`),
porque Server Action é um endpoint público e o `proxy.ts` sozinho não basta. O cadastro e o teste de
câmera só aceitam URLs `https` que resolvam para IP público. Limite conhecido: um playlist remoto
que redirecione ou aponte segmentos para um endereço interno não é filtrado pela aplicação; para
fechar isso é preciso restringir a saída de rede do container.

## Licença

MIT, veja `LICENSE`. Este site não é responsável pelo conteúdo, disponibilidade ou propriedade das câmeras.

## Deploy antigo

A versão estática anterior (`index.html`) segue publicada em
https://filipesfbr.github.io/cameras-rolante/ até o novo domínio existir; depois ela vira um
redirect de uma linha para ele.
