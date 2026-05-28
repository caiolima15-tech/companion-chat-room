# Ajustes de UI conforme a imagem

## 1. Chat — cores e opacidade (`public/styles.css`)

- Fundo do `.chat-panel` / `.chat-log` / `.chat-form`: trocar o `rgba(...,0.5)` atual por **preto com opacidade bem mais baixa** (ex.: `rgba(0,0,0,0.78)` sólido escuro, sem o tom roxo/azulado atual).
- Padronizar as bolhas (`.chat-bubble`):
  - Mensagens do próprio usuário (`.chat-item.is-self .chat-bubble`): fundo **roxo claro `#a78bfa**` (lilás como no print), texto escuro, alinhadas à direita.
  - Mensagens dos outros (`.chat-item:not(.is-self) .chat-bubble`): fundo **preto `#1a1a1a**`, texto branco, alinhadas à esquerda.
  - Remover os tons amarelo/laranja atuais.

## 2. Espaço vazio abaixo do mobile-bar (`public/styles.css`)

- Após a subida dos widgets, ficou uma faixa transparente entre o `mobile-bar` e a borda inferior. Preencher essa área com a cor `**#231e24**` (mesma da barra), aplicando `background: #231e24` direto no `.mobile-bar` e estendendo via `padding-bottom: env(safe-area-inset-bottom)` + um pseudo-elemento `::after` que cobre o espaço restante até `bottom: 0` com a mesma cor sólida.

## 3. Ícone fantasma do chat quando minimizado (`public/app.js` + `public/styles.css`)

- No print, com o chat minimizado, o botão de chat do `mobile-bar` mostra um ícone duplicado (balão preto + setinha). Investigar `#chatToggle` / `.chat-toggle` e o badge — provavelmente é o `.chat-toggle` flutuante antigo aparecendo junto. Garantir que quando `body` **não** tem `mobile-show-chat`, o `.chat-toggle` fique `display: none` em mobile (já existe o botão no `mobile-bar`).

## 4. Topbar — só nome da sala (`public/index.html` + `public/app.js`)

- Remover do `.topbar`:
  - `<span class="kicker">Bar online 3D</span>` (linha 21 do `index.html`).
  - `<span id="roleBadge">` (badge ADMIN/visitante).
  - `<span id="onlineCount">` ("1 online" / bolinha verde).
- Manter apenas o `<h1>Neon Tap Room</h1>` (nome da sala atual) e o botão **SAIR**.
- No `app.js`, proteger as escritas em `roleBadge` / `onlineCount` com `if (el)` para não quebrar (linhas 1623, 1836, 2785). Não removo a lógica, só os elementos da UI.

## 5. Indicador roxo fantasma no canto esquerdo do topbar

- No print há um "pílula" roxa pequena à esquerda do título. Provavelmente é o `kicker` ou um `::before`. Após remover o kicker (item 4), conferir se sobra algum estilo decorativo em `.topbar` e remover.

## 6. Botão "Sentar" contextual (`public/app.js`)

Hoje o painel/botão de sentar aparece fixo. Mudar para:

- Aparecer **somente quando o player está próximo (raio ~1.2m) de uma interação do tipo `sit**` configurada no mapa atual.
- Renderizar como um **balão flutuante 3D** fixo acima do objeto (usando `THREE.Sprite` ou um `div` projetado via `camera.project()` na posição do assento), **não** seguindo o personagem.
- Sumir suavemente quando o player se afasta do raio.
- Implementação: no loop de animação (`animate()` / `tick`), iterar `assetInteractions` filtrando `type === 'sit'`, calcular distância `player.position.distanceTo(seatWorldPos)`, mostrar/esconder o overlay correspondente e atualizar `left/top` via projeção da câmera.

## Arquivos afetados

- `public/styles.css` — cores/opacidade do chat, bolhas self/other, fundo `#231e24` abaixo do mobile-bar, esconder `.chat-toggle` em mobile.
- `public/index.html` — remover `kicker`, `roleBadge`, `onlineCount` da `.topbar`.
- `public/app.js` — guards nos elementos removidos; refatorar o prompt de sentar para ser baseado em proximidade + overlay projetado no objeto.

Sem mudanças no banco. Sem novas dependências. 

## 7. O mapa não sobe junto com a subida do teclado 

quando usuario clica em digitar uma mensagem o que deve subir apenas é o chat, o mapa ao fundo permanece na mesma posicao na tela.