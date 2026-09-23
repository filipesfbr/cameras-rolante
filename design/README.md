# Handoff: Câmeras Rolante — redesign

## Overview
Redesign of the public câmeras page and a new admin page for the "Câmeras Rolante" project (river-level monitoring cameras for Rolante/RS). Original project: https://github.com/filipesfbr/cameras-rolante (plain HTML/JS + hls.js, no backend).

## About the Design Files
The files in this bundle (`Cameras Rolante.dc.html`, `Admin Rolante.dc.html`) are **HTML design prototypes**, not production code to ship as-is. They were built in a component-streaming authoring tool (custom `<sc-for>`/`<sc-if>` template tags, inline styles, a `DCLogic` class) — that authoring format itself is not meant to be copied into a real codebase. Recreate the visual design and behavior described here using whatever stack the target codebase uses (plain HTML/JS to match the existing repo, or React/Vue if the project is rebuilt with a framework).

## Fidelity
**High-fidelity** for the public page: exact colors, typography, spacing, and layout are final. HLS video playback is real and functional (uses hls.js against the two real camera streams).

**Mocked/placeholder** for two things that need a real backend, which was explicitly out of scope for this design pass:
- **History thumbnails**: rendered as striped placeholder boxes with generated timestamps — not real captured snapshots. A backend needs to periodically capture a frame per camera and serve those images.
- **Admin page**: fully interactive UI (add/remove camera, toggle active/history, set interval) but state lives only in browser memory (React state) — nothing persists. The password gate is cosmetic (any non-empty password "logs in"). Real auth and persistence need to be implemented server-side.

## Screens

### 1. Public page (`Cameras Rolante.dc.html`)
**Purpose**: let anyone open the page and check current river camera footage, plus recent history per camera.

**Layout**:
- Root: full-height flex column, background `#0b1211` (dark, green-tinted near-black), text `#e8e8e8`, font `'Space Grotesk', 'Segoe UI', Arial, sans-serif`.
- Header: flex row, `padding: 22px 32px`, background `#161f1d`, `border-bottom: 1px solid rgba(255,255,255,.08)`. Left: title `Cameras dos Rios - Rolante` (23px, weight 600) + subtitle line with a link to `alerta.rolante.ifrs.edu.br`. Right: a grid-view icon button, then a clock block (label "AGORA" in 10px uppercase muted, time in 22px `'Space Mono'` monospace, tabular-nums, updates every second in `dd/mm/yyyy - hh:mm:ss` format).
- Main: `padding: 28px 32px`. Camera cards are laid out with **CSS multi-column** (`column-width: 380px; column-gap: 28px`) rather than CSS grid — this is deliberate: it lets each card's height be independent so expanding one camera's history section never pushes/stretches its neighbor. Each card has `break-inside: avoid; margin-bottom: 28px`.
- Camera card: `background:#000; border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,.08); box-shadow:0 8px 24px rgba(0,0,0,.35)`. Contains:
  - `<video>` (16:9, muted, autoplay, playsinline) — click opens a full-screen single-camera overlay.
  - Label bar (`padding:12px 16px; background:#141c1a; border-top:1px solid rgba(255,255,255,.06)`, flex row, space-between): camera name + small "fonte ↗" link to the source page; status badge (colored dot + text: green `#7fc97f` "AO VIVO" when playing, red `#e07a7a` for "carregando…"/"reconectando…"/errors); a reload icon button (refresh SVG, ~28×28px); a "histórico" toggle button (text label, highlights blue `rgba(91,155,240,.16)` bg / `#8fbcf5` text when open).
  - History section (collapsed by default, toggled by the button above): `background:#0d1211; border-top:1px solid rgba(255,255,255,.06); padding:16px`. Eyebrow label "HISTÓRICO · a cada N min" (11px, uppercase, `#7d828c`). Horizontal scroll strip (custom thin scrollbar via `scrollbar-width:thin` + `::-webkit-scrollbar`, thumb `rgba(255,255,255,.18)`) of 96px-wide thumbnails: 64px-tall placeholder box (diagonal stripe pattern, `repeating-linear-gradient(45deg,#1e2025,#1e2025 6px,#181a1e 6px,#181a1e 12px)`) + time label below (10px, `'Space Mono'`, `#6b6f78`).
- Single-camera overlay: fixed full-screen, `background:rgba(0,0,0,.88)`, centers an enlarged `<video>` + title; click on backdrop or Escape closes it.
- Grid view (all cameras at once): triggered by the icon button in the header (before the clock). Fixed full-screen, pure black background, **no header/title/captions** — just a 2-column CSS grid (`grid-template-columns:repeat(2,1fr); grid-auto-rows:1fr; gap:2px`) of `<video>` elements, each `object-fit:contain` (never crops the picture). A small "✕" icon button floats top-right to close; Escape also closes.
- Footer: `padding:16px 24px; background:#161f1d; border-top:1px solid rgba(255,255,255,.08)`, centered disclaimer text with links, `color:#6f7873`.

**Copy (verbatim, keep as-is)**:
- Title: "Cameras dos Rios - Rolante"
- Subtitle: "Links das câmeras obtidos no portal alerta.rolante.ifrs.edu.br" (link to `https://alerta.rolante.ifrs.edu.br/niveis-rios-arroios`)
- Camera names: "Rio Areia — Ponte do Grassmann" / "Rio Areia — Ponte Mata Olho"
- Footer: "As imagens são exibidas através do portal alerta.rolante.ifrs.edu.br e das páginas de câmera em rolante.solutti.net. Este site não é responsável pelo conteúdo, disponibilidade ou propriedade das câmeras."

### 2. Admin page (`Admin Rolante.dc.html`)
**Purpose**: internal-only page to manage cameras and history/capture settings. Not linked from the public page.

**Layout**: same header pattern, dark theme. Password gate (centered card, single password input + "Entrar" button — cosmetic only) gates access. Once "authed", shows:
- "Configurações gerais" card: default capture interval (select: 5/15/30/60 min), number of history images to keep (number input 4–24).
- "Câmeras" card: "+ Adicionar câmera" button opens an inline form (nome do ponto, rio/local, URL do stream m3u8, URL da página fonte). Each existing camera is a row with name/location, monospace stream URL, a "Remover" button, and two pill toggle buttons: Ativa/Inativa and Histórico ligado/desligado (green `#7fc97f` on `#1e3a24` when on, muted/red otherwise).
- "Sair" button at the bottom to log out (resets local auth state).

## Interactions & Behavior
- Clock: `setInterval` every 1000ms, formats `Date` as `dd/mm/yyyy - hh:mm:ss`.
- Video loading: hls.js (`Hls.isSupported()`) attaches to each `<video>`; on fatal error, destroys the instance and retries after 4s; status badge reflects state. Falls back to native HLS (`canPlayType('application/vnd.apple.mpegurl')`) for Safari-like browsers.
- Reload button: destroys the camera's hls instance, clears the video `src`, reloads.
- History toggle: per-camera local boolean state; only one section opens/closes independently per card (no shared layout impact — see the multi-column note above).
- Single overlay & grid view: separate `<video>` elements from the card ones, each gets its own hls.js instance attached on open and destroyed on close (so multiple simultaneous streams don't conflict over one video element).
- Escape key closes whichever of (grid view, single overlay) is open.
- Admin add/remove/toggle: plain React state mutations, no network calls.

## State Management (source of truth for a real implementation)
- List of cameras: `{ id, name/location, streamUrl, sourceUrl, active, historyOn }` — should live in a database, editable via the admin page, read by the public page.
- Per-camera capture interval + retention count — currently only a global default in the mock; decide if it should be per-camera or global.
- Captured snapshot history — needs a backend job (cron/serverless) that grabs a frame per active camera every N minutes, stores it (e.g. object storage), and exposes the last K per camera to the public page.
- Admin auth — needs real session/password (or better) handling server-side; nothing in the current mock should be trusted.

## Design Tokens
- Background: `#0b1211` (page), `#161f1d` (header/footer), `#141c1a` (card label bar), `#0d1211` (history section), `#000` (video card)
- Text: `#e8e8e8` (body), `#f2f2f2` (headings), `#8a8f98` / `#7d828c` / `#6b6f78` / `#6f7873` (muted tiers)
- Accent blue: `#5b9bf0` (links, active-state highlight `rgba(91,155,240,.16)` bg / `#8fbcf5` text)
- Status: green `#7fc97f` (live/active/on), red `#e07a7a` (off/error)
- Borders: `rgba(255,255,255,.06–.1)`
- Fonts: `'Space Grotesk'` (UI text, weights 400–700), `'Space Mono'` (clock + timestamps, weights 400/700) — both loaded from Google Fonts
- Radius: 14px (cards), 8–12px (buttons/small cards), 50% (status dot, pill toggles use 12px)
- Shadow: `0 8px 24px rgba(0,0,0,.35)` on video cards

## Assets
No image assets — history thumbnails are CSS-generated striped placeholders standing in for real captured frames. hls.js (`hls.min.js`, bundled in this folder) is the only third-party library, copied from the original repo.

## Files
- `Cameras Rolante.dc.html` — public page prototype
- `Admin Rolante.dc.html` — admin page prototype
- `hls.min.js` — HLS playback library used by both
