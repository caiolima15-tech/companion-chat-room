
## 1. Painel "🎬 Animações" não abre pelo dock lateral

Hoje o item do dock `data-dock-target="#animAdminToggle"` clica no botão flutuante, que existe e tem listener próprio (`public/app.js:8576`). Mas o painel `#animAdminPanel` **não está** em `ALL_PANEL_SELECTORS` (`public/app.js:1833-1837`) nem em `panelMap` (`1891-1898`), então:

- ao abrir outro painel ele **não fecha** o de animações (vira "uma exceção");
- e mais importante: no caminho de fallback (`else if (panelSel)` em `1869-1872`), se o `target.click()` falhar/no-op por timing, o painel nunca alterna.

Combinado com o fato de que o bind do animAdminPanel usa `else bind()` na linha 8586 (síncrono no carregamento), se o elemento `#animSelect` ainda não estiver pronto (race do DOMContentLoaded em alguns devices) o listener do botão nunca é registrado e o clique fica morto.

**Correção:**

- Adicionar `"#animAdminPanel"` em `ALL_PANEL_SELECTORS` e `panelMap` (com a chave `animAdminPanel`).
- Trocar o bind síncrono por sempre aguardar `DOMContentLoaded` (ou usar `setTimeout(bind, 0)`).
- Garantir que `bind()` é idempotente — se reexecutado, não duplica listeners.
- Adicionar fallback no handler do dock: se `target` existir e `panelSel` também, depois de `target.click()` checar se `panel.hidden` mudou; se não, forçar `panel.hidden = !panel.hidden`.

## 2. Salvar tunings de animação para sempre e para todos

Hoje `animTunings` vive só em `localStorage` (`ANIM_TUNINGS_KEY`). Cada usuário tem o seu, e some se limpar o cache.

**Migração para Lovable Cloud:**

- Nova tabela `public.animation_tunings`:
  - `anim_key` (text, PK) — `"idle"`, `"walk"`, …, `"custom:<uuid>"`
  - `off_x`, `off_y`, `off_z` (numeric, default 0)
  - `rot_x`, `rot_y`, `rot_z` (numeric, default 0)
  - `updated_by` (uuid, nullable), `updated_at` (timestamptz default now())
- GRANTs: `SELECT` para `anon` e `authenticated` (leitura pública porque todo cliente precisa aplicar os tunings); `INSERT/UPDATE/DELETE` só para `service_role` + policy admin.
- RLS: `SELECT USING (true)`; `INSERT/UPDATE/DELETE USING (public.has_role(auth.uid(), 'admin'))`.
- Realtime ligado para refletir mudanças nos outros clientes sem reload.

**App (`public/app.js`):**

- No boot, carregar `animation_tunings` do Supabase e popular `animTunings` em memória (sobrescrevendo defaults). Manter `localStorage` apenas como cache offline / fallback antes da resposta do banco chegar.
- Substituir `__saveAnimTunings()` por:
  1. Atualizar `animTunings` em memória.
  2. `upsert` em `animation_tunings` para a chave atual.
  3. Atualizar `localStorage` como cache.
- Realtime channel: ao receber update, mesclar no `animTunings` e re-renderizar o painel se estiver aberto.
- Quando uma animação custom é deletada, deletar também a row de tuning.

## 3. Volume do rádio não muda

Duas causas reais no código atual (`public/app.js:6938-6948`, `public/styles.css:1898`):

- `touch-action: none` no `#radioVolumeSlider` mata o scrub nativo do `<input type=range>` em mobile (e em alguns trackpads usando Pointer Events).
- O `stopPropagation` nos pointerdown/touchstart/mousedown evita o pan do mundo, mas em desktop com `pointerdown` parando a propagação o navegador às vezes **não promove** o evento a `mousedown` no thumb do range (depende do user agent), travando o drag.

**Correção:**

- Trocar `touch-action: none` por `touch-action: manipulation` no slider (preserva o gesto horizontal do range).
- Manter o `stopPropagation`, mas só em `pointerdown` (sem `mousedown`/`touchstart`), e adicionar `e.stopImmediatePropagation()` apenas se o alvo for o próprio slider.
- Garantir que o slider responde também a `change` (não só `input`) para casos onde só dispara no release.
- Verificar visualmente no preview (desktop e simulação mobile) que `audio.volume` é atualizado ao arrastar.

## 4. Mobile vertical: painéis de admin não abrem / landscape com layout do desktop

Hoje o dock lateral existe em mobile, mas:

- Ao abrir um painel ele aparece em `position:absolute; top:60px; left:1020px;` — fora da viewport mobile.
- Há regras em `@media (max-width: 640px)` (`public/styles.css:2056-2068`) que reposicionam alguns painéis pelo `right`, **mas `#animAdminPanel` não está nessa lista** — então ele literalmente abre fora da tela.

**Correção mobile (portrait):**

- Adicionar `#animAdminPanel` à regra de `max-width: 640px` em styles.css, fixando `right: 188px !important; left: auto !important; max-width: calc(100vw - 200px) !important;`.
- Garantir que todos os painéis admin (`#lightsAdminPanel, #layersPanel, #botsAdminPanel, #radioAdminPanel, #interactionsAdminPanel, #mapAdminPanel, #animAdminPanel, #carsAdminPanel, #speedAdminPanel`) recebem `max-height: 70vh; overflow:auto;` em mobile.

**Correção landscape (rotacionar para o lado = layout desktop):**

- Hoje várias regras mobile usam só `max-width`. No landscape (ex.: 844×390), `max-width: 640px` ainda dispara → aplica layout mobile mesmo deitado.
- Restringir as regras mobile a `@media (max-width: 640px) and (orientation: portrait)` (e equivalentes nas outras breakpoints mobile), de forma que:
  - landscape em celular cai nas regras desktop padrão;
  - portrait continua com layout compactado.
- Para a área 3D / topbar / chat / dock: revisar as media queries de `max-width: 600px`, `max-width: 640px`, `max-width: 720px` e adicionar `and (orientation: portrait)` onde fizer sentido (sem afetar tablets grandes).

## 5. Arquivos afetados

- **Nova migração**: tabela `public.animation_tunings` + GRANTs + RLS + realtime.
- `public/app.js`:
  - dock: incluir `#animAdminPanel` em `ALL_PANEL_SELECTORS`/`panelMap` + fallback de toggle.
  - animAdminPanel IIFE: bind seguro (DOMContentLoaded), carregar/salvar tunings via Supabase, ouvir realtime.
  - radio: ajustar listeners do slider.
- `public/styles.css`:
  - `#radioVolumeSlider`: `touch-action: manipulation`.
  - Adicionar `#animAdminPanel` ao bloco `@media (max-width: 640px)` de painéis.
  - Escopar regras mobile críticas para `(orientation: portrait)` onde apropriado.

## 6. Fora de escopo

- Não vou mexer em `client.ts`, `types.ts`, nem nas animações em si (idle/walk/etc).
- Não vou trocar provedor de áudio nem adicionar HLS.js — só ajustar o controle de volume existente.
