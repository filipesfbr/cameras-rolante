# Handoff: cameras-rolante

Aplicar a identidade da família Rolante (TransparêncIA Rolante, auditoria-rolante, Impostômetro Rolante) ao site **https://cameras-rolante.onrender.com/**. Só muda a camada visual. Nenhuma regra de negócio, busca de imagem, relógio ou link muda.

## 1. O que o site tem hoje

Conteúdo atual, que deve ser mantido igual (textos e ordem):

1. Título: `Câmeras dos Rios - Rolante/RS`
2. Linha de fonte: `Links das câmeras obtidos no portal alerta.rolante.ifrs.edu.br` (link para `https://alerta.rolante.ifrs.edu.br/niveis-rios-arroios`)
3. Relógio: `--/--/---- --:--:--` (preenchido pelo JavaScript)
4. Cartões de câmera (hoje 2), cada um com:
   - `Rio Areia — Ponte do Grassmann`, link `https://rolante.solutti.net/rioareia/`
   - `Rio Areia — Ponte Mata Olho`, link `https://rolante.solutti.net/pontemataolho/`
   - imagem da câmera (estado inicial: `carregando…`)
   - link com tooltip `Fonte: página da câmera`
5. Rodapé com três frases de aviso (fonte das imagens, isenção de responsabilidade, fuso de Brasília).

Novas câmeras devem entrar como mais cartões na mesma grade, sem mudar o componente.

## 2. Referência visual

`reference/Cameras Rolante Site.dc.html` é um protótipo em HTML do resultado final. Use para extrair medidas, cores e proporções. Não copie o código: `support.js` e as tags `<x-dc>` e `<helmet>` são andaime do protótipo.

## 3. Marca

Escolhida: **visor** (cantos de enquadramento com ponto de foco em terracota). Arquivos em `assets/`:

| Arquivo | Onde usar no site |
| --- | --- |
| `lockup-horizontal.svg` | cabeçalho |
| `favicon.svg` | aba do navegador (`<link rel="icon" type="image/svg+xml" href="/favicon.svg">`) |
| `app-icon-512.svg` | PWA, ícone de atalho. Gerar PNG 192 e 512 a partir dele |
| `social-square-1200.svg` | Open Graph e Twitter card. Gerar PNG 1200×1200 (`og:image`) |
| `mark.svg`, `mark-dark.svg`, `mark-mono-*.svg` | usos avulsos |
| `lockup-horizontal-dark.svg`, `lockup-stacked.svg` | materiais externos |

Os lockups usam `<text>` com Inter 600. Para o cabeçalho, prefira recriar a assinatura em HTML (símbolo SVG inline + texto), como no protótipo, para herdar a fonte do site. Para Open Graph, converta o texto em curvas ao gerar o PNG.

Regras: respiro ao redor da assinatura igual à largura do símbolo; mínimo de 16 px para o símbolo e 132 px para a assinatura; sem giro, distorção, sombra ou troca de fonte.

### Head

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#faf8f4">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:title" content="Câmeras dos Rios - Rolante">
<meta property="og:description" content="Câmeras de monitoramento dos rios de Rolante/RS, ao vivo e com histórico.">
<meta property="og:image" content="/social-square-1200.png">
```

## 4. Tokens

| Token | Hex | Uso |
| --- | --- | --- |
| `bg` | `#faf8f4` | fundo da página |
| `ink` | `#26221d` | título, nome da ponte, contorno da marca |
| `body` | `#5a534a` | texto corrido |
| `muted` | `#9a9082` | rótulo do rio, `carregando…`, rodapé |
| `accent` | `#b4622f` | links, `-rolante`, ponto do relógio |
| `card` | `#ffffff` | fundo dos cartões |
| `rule` | `#ece7df` | bordas |
| `rule-soft` | `#f0ece4` | divisória interna do cartão |
| `chip-border` | `#e4ddd1` | borda do relógio |
| `image-bg` | `#f3ede2` | fundo da imagem enquanto carrega |
| `selection` | `#f0d9c4` | `::selection` |

Um único acento. Sem sombras, sem gradientes. Profundidade só por borda e fundo branco.

Fonte: **Inter** 400/500/600/700, fallback `system-ui, sans-serif`, `-webkit-font-smoothing: antialiased`. Em produção, usar `next/font` ou `@fontsource/inter` em vez do link do Google.

## 5. Layout

Estrutura: `min-height: 100vh; display: flex; flex-direction: column`; o `main` com `flex: 1`.

| Região | Especificação |
| --- | --- |
| Contêiner | `max-width: 1080px`, centralizado, padding horizontal 56 px (20 px abaixo de 760 px) |
| Cabeçalho | padding vertical 24 px, assinatura à esquerda (símbolo 26×34, gap 12, texto 20 px / 600 / -0.01em, `cameras` em tinta + `-rolante` em terracota) |
| Título (h1) | 44 px / 700 / line-height 1.1 / -0.03em; 31 px abaixo de 760 px; `text-wrap: balance`. Margem inferior 16 px |
| Linha de fonte | 16 px / 400 / 1.65, cor `body`, largura máx. 62ch, margem inferior 24 px. Link em terracota, hover em tinta |
| Relógio | pílula `inline-flex`, gap 10, padding 7×14, borda 1 px `chip-border`, raio 30, fundo branco, 13 px / 600, `font-variant-numeric: tabular-nums`. Ponto terracota de 7 px antes do texto |
| Grade | `display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 22px`; margem superior 40 px |
| Rodapé | borda superior 1 px `rule`, padding 28 px topo e 40 px base, 12.5 px / 1.7, cor `muted`, largura máx. 78ch, links em terracota |

### Cartão de câmera

- Fundo branco, borda 1 px `rule`, raio 14, `overflow: hidden`, sem sombra.
- Área da imagem: `aspect-ratio: 16/9`, `object-fit: cover`. Enquanto carrega: fundo `image-bg` com o texto `carregando…` (13 px, `muted`) centralizado.
- No estado de carregamento, quatro cantos de enquadramento (traço 0.7, tinta, opacidade .35, não escala) desenhados por cima, como no símbolo. Somem quando a imagem carrega.
- Legenda: padding 18 20 20, borda superior 1 px `rule-soft`.
  - Rótulo do rio (`Rio Areia`): 12 px / 600 / UPPERCASE / 0.08em, `muted`, margem inferior 6.
  - Nome da ponte (`Ponte do Grassmann`): 19 px / 600 / -0.015em / 1.3, tinta.
  - Link `Fonte: página da câmera`: 13.5 px / 500, terracota, sem sublinhado, margem superior 12. Mantém o `title` atual.
- Todo o texto do cartão que hoje aparece como `Rio Areia — Ponte do Grassmann` passa a ser dividido em rótulo (rio) e nome (ponte). O link continua apontando para a mesma URL.

### Estados

| Estado | Tratamento |
| --- | --- |
| Carregando | fundo `image-bg`, cantos de enquadramento, `carregando…` |
| Carregada | imagem 16:9, sem cantos |
| Erro ao carregar | mesmo fundo do carregando, texto `imagem indisponível` em `muted`, cantos mantidos. Não usar vermelho |
| Relógio sem dado | `--/--/---- --:--:--` |

Foco de teclado: `outline: 2px solid #b4622f; outline-offset: 2px` nos links.

## 6. Implementação

Se o site é Next.js (o `meta-next-size-adjust` indica que sim):

1. Substituir os estilos atuais pelos tokens acima (variáveis CSS em `:root` ou o sistema de estilo que já existir no projeto).
2. Criar os componentes `Header`, `ClockChip` e `CameraCard` e usá-los na página. A lógica de busca das imagens e do relógio continua nos mesmos lugares; só mudam as classes e a marcação.
3. Copiar `favicon.svg` para `public/favicon.svg` e gerar `social-square-1200.png` em `public/`.
4. Ajustar o `<head>` conforme a seção 3.
5. Conferir em 1080, 760 e 375 px.

Não fazer: novas cores, sombras, ícones além do símbolo da marca, emojis, animações no carregamento. Não alterar textos nem links.

## 7. Critérios de aceite

- Fundo `#faf8f4`, Inter em todo o texto, nenhuma cor fora da tabela.
- Assinatura no cabeçalho idêntica ao protótipo; favicon aparece na aba.
- Dois cartões lado a lado em 1080 px e empilhados em 375 px.
- Texto e links originais preservados.
- Contraste de texto corrido acima de 4.5:1 (o `muted` só em rótulos e rodapé, 12 px ou mais).

## 8. O que mudou na implementação

O handoff foi desenhado sobre a versão estática do site, sem o vídeo ao vivo, o histórico, o mosaico e o admin. Ao aplicar no app atual, estas decisões mudaram ou completaram a especificação:

- **Nome:** a assinatura é `Câmeras Rolante` (não `cameras-rolante`), com a mesma tipografia da assinatura do Impostômetro Rolante: 20 px / 700 / -0.02em. A imagem de Open Graph (`app/opengraph-image.png`) foi gerada a partir de `social-square-1200.svg` com esse nome.
- **Cabeçalho:** o relógio fica à direita da assinatura, ao lado do botão do mosaico, a 15 px.
- **Grade:** continua ocupando a largura toda da tela (1 a 3 câmeras lado a lado), sem o `max-width` de 1080 px, para o vídeo ficar o maior possível.
- **Cartão:** os botões de atualizar, histórico e voltar ao vivo mantêm os ícones. O link da fonte é um ícone de link externo ao lado do nome da ponte, com o mesmo `title`.
- **Status ao vivo:** o selo segue verde (`--ok`) ou vermelho (`--bad`). Enquanto o vídeo não está ao vivo, a imagem mostra os cantos de enquadramento e o texto do status.
- **Rodapé:** centralizado, como era antes.
- **Mosaico e vídeo ampliado:** fundo `ink`, porque são telas de vídeo.
- **Admin e login:** usam os mesmos tokens.
- **Favicon:** fica em `app/icon.svg` (convenção do Next), não em `public/favicon.svg`.
