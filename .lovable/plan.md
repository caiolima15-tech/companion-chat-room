## 1. Esconder widgets quando não está em sala

Arquivos: `public/styles.css`, `public/app.js`.

- O `body.world-ready` já é adicionado em `enterRoom()`. Vou usá-lo como interruptor único: enquanto **não** estiver presente, escondo:
  - `.mobile-bar` (botões inferiores ⚙️ 🙂 💬 👤 📨)
  - `.world-hud` (Câmera, Meu perfil, Mensagens, Trocar personagem, Trocar local…)
  - `.emote-cluster`
  - `.chat-panel` (chat lateral)
  - `.asset-dock`, `.admin-shortcut`, `#adminHideToggle` e todos os botões/painéis admin do topo
- Adicionar em `styles.css` uma regra global `body:not(.world-ready) .mobile-bar, body:not(.world-ready) .world-hud, body:not(.world-ready) .emote-cluster, body:not(.world-ready) .chat-panel, body:not(.world-ready) .admin-only { display: none !important; }` (com cuidado para que overlays de seleção de mapa/personagem/avatar não sejam afetados — eles já ficam fora do `.world-shell`).
- Em `app.js`, na função que volta para o lobby (sair da sala / `Trocar local` / `Trocar personagem` / logout), **remover** `world-ready` do `body`. Hoje só é adicionado, nunca removido — vou adicionar `document.body.classList.remove("world-ready")` nesses pontos (`closeWorld`/handlers de "Trocar local" e "Trocar personagem").

## 2. Chat limpo ao sair da sala + TTL

Arquivos: `public/app.js`.

- Ao sair da sala (mesmos handlers do item 1): esvaziar `#chatLog` (`chatLog.innerHTML = ""`) e zerar o estado em memória das mensagens. Resetar badges.
- TTL local: adicionar varredura periódica (a cada 60s) em `chatLog` que remove `.chat-item` com `data-ts` mais antigo que **30 minutos**. Cada bolha já recebe timestamp ao ser renderizada — vou anexar `data-ts={Date.now()}` no momento da inserção e rodar `setInterval(purgeOldMessages, 60_000)` enquanto estiver na sala.
- Não toco no banco — limpeza é só da UI local.

## 3. Dock admin no escudo (canto direito)

Arquivos: `public/index.html`, `public/styles.css`, `public/app.js`.

Comportamento desejado:

```text
Estado 1 (sala carregada, admin):    Estado 2 (clicou no 🛡️):           Estado 3 (clicou em "Luzes"):
                            [🛡️]    ┌────────────────┐ [🛡️]            ┌────────────────┐ [🛡️]
                                     │ 🌑 Escuro       │                  │ 🌑 Escuro       │
                                     │ 💡 Luzes        │                  │ 💡 Luzes ←ativo │  ←────┐
                                     │ 🗂️ Camadas     │                  │ 🗂️ Camadas     │       │
                                     │ 🤖 Bots         │                  │ 🤖 Bots         │   [Painel
                                     │ 📻 Rádio        │                  │ 📻 Rádio        │    Luzes]
                                     │ 🎯 Interações   │                  │ 🎯 Interações   │       │
                                     │ 🗺️ Editar mapa │                  │ 🗺️ Editar mapa │  ←────┘
                                     │ 📦 GLB / Char.  │                  │ 📦 GLB / Char.  │
                                     └────────────────┘                   └────────────────┘
```

Implementação:

- **HTML** (`public/index.html`): criar `<aside id="adminDock" class="admin-dock admin-only" hidden>` dentro de `.world-shell`, com uma lista de `<button data-tool="...">` (uma barra fina por ferramenta, ícone + nome). O `#adminShortcut` (🛡️) já existe — passa a ser o gatilho que mostra/esconde o `#adminDock`.
- **Mover para o dock** os botões hoje espalhados pelo topo: `#darkModeToggle`, `#lightsAdminToggle`, `#layersToggleBtn`, `#botsToggleBtn`, `#radioToggleBtn`, `#interactionsToggleBtn`, `#mapAdminToggle`, `#manageCharactersButton`, `#placeButton`, importar GLB e `.asset-dock` (GLBs no mapa). Os botões originais deixam de existir como `position:absolute` no topo — viram entradas do dock que despacham o clique para o handler já registrado (ou são removidos do HTML e o dock chama as mesmas funções).
- **Estado inicial**: `#adminDock` começa `hidden`. Mesmo para admin, só aparece se ele clicar no 🛡️. Persistir aberto/fechado em `localStorage` (`admin-dock-open`).
- **Abertura de painéis**: clicar numa barra do dock abre o painel correspondente (`hidden = false`) **ao lado** do dock (posição fixa à direita do dock, `right: 56px`). Marca a barra como `aria-pressed="true"`.
- **Minimizar = fechar e voltar pro dock**: os botões `data-panel-min` / `data-panel-close` / `#mapAdminClose` / `#lightsAdminClose` / `#layersClose` passam a apenas `panel.hidden = true` e remover o `aria-pressed` da barra correspondente. Não há mais estado "minimizado parcial" — fecha de vez e fica acessível só pelo dock.
- **Esconder o dock**: clicar de novo no 🛡️ esconde o dock **e** fecha qualquer painel admin aberto.
- **Não-admin**: 🛡️ e `#adminDock` permanecem com `.admin-only` → não aparecem.

## 4. CSS do dock

`public/styles.css` ganha:

- `.admin-dock` fixo em `position:absolute; right:12px; top:64px; display:flex; flex-direction:column; gap:6px; width:200px; z-index:40;` com fundo `rgba(10,10,20,0.92)`, borda, `backdrop-filter:blur(8px)`.
- `.admin-dock button` em barra única: `display:flex; align-items:center; gap:8px; padding:8px 10px; background:transparent; border:1px solid transparent; border-radius:6px; color:#eee; cursor:pointer; font:13px system-ui; text-align:left;`. Hover: borda roxa. `[aria-pressed="true"]`: fundo `rgba(167,139,250,0.18)`.
- Em telas estreitas (`max-width: 640px`): dock vira `right:8px; width:180px; top:60px` e os painéis abertos passam a ocupar `right:200px; max-width: calc(100vw - 220px)`.

## Arquivos afetados

- `public/index.html` — novo `<aside id="adminDock">`; remoção dos botões admin do topo (vira lista no dock); manter painéis (`#lightsAdminPanel`, `#layersPanel`, `#botsAdminPanel`, `#radioAdminPanel`, `#interactionsAdminPanel`, `#mapAdminPanel`) — só muda o gatilho.
- `public/styles.css` — gating geral via `body.world-ready`; estilos do `.admin-dock`; ajuste do `.admin-shortcut` (vira o handle do dock).
- `public/app.js` — `remove("world-ready")` nos retornos pro lobby; limpeza/TTL do chat; lógica do dock (abrir/fechar painéis, persistência); rebind dos handlers existentes nas novas barras do dock.

Sem alterações no banco. Sem novas dependências.