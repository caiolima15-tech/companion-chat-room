
## O que está ruim hoje (modo paisagem)

Olhando o print:
- A **tarja roxa do topo** ("Cidade BR · Limites · Câmera Livre · SAIR") corta o mapa e ocupa altura preciosa em landscape.
- Os **botões inferiores** (chat, perfil, comentário) ficam quase encostados na borda de baixo — sem respiro com a safe-area.
- O **saldo `R$ 0,00`** usa uma fonte Courier genérica, fica com cara de terminal e não conversa com o resto.
- Os pills "NPCs" (canto sup. esq.) e "R$" (canto sup. dir.) **não combinam** visualmente: cores diferentes (ciano x verde), bordas diferentes, posicionamentos inconsistentes.
- O **chat** abre como uma caixa cinza cortando o personagem, sem cabeçalho claro, com bolhas pequenas e o input desaparece atrás da safe-area; "Saiu da conversa" fica empilhado dentro do chat.
- O botão **SAIR** com escudo no canto direito está estilizado diferente de tudo.

## O que vamos mudar

### 1. Remover a tarja superior em landscape
- A `.topbar` (faixa roxa com "Cidade BR" + toggles de Limites/Câmera Livre) **desaparece** no layout mobile/landscape; vira só um título discreto opcional.
- Os toggles `#boundsToggleBtn` e `#freeCamToggleBtn` (admin) saem do topo central e voltam a ser controlados só pelo `#adminDock` lateral — não poluem o jogo.

### 2. Botões flutuantes consistentes (top + bottom)
Criar um **sistema visual único** de "pill flutuante" usado por:
- Pill `🧍 NPCs` (top-left)
- Pill saldo `R$ 0,00` (top-right)
- Botão `SAIR` (vira pill com ícone, top-right, ao lado do saldo)
- Barra de ações inferior (chat / perfil / emote) — já flutuante, só padroniza o estilo

Padrão único:
- fundo: `rgba(10,14,22,0.55)` + `backdrop-filter: blur(18px) saturate(160%)`
- borda sutil branca 10%
- raio 999px (pill) ou 18px (botão grande)
- sombra suave
- altura consistente (44px)

### 3. Descer os botões inferiores
- Adicionar `bottom: calc(28px + env(safe-area-inset-bottom))` na barra inferior (`.mobile-bar`) em landscape, para sair de cima da borda.
- O joystick e o microfone ganham o mesmo respeito de safe-area (hoje só portrait recebe).
- O badge "3" no chat fica posicionado corretamente sobre o pill.

### 4. Fonte estilo GTA no saldo
- Trocar a fonte do `#moneyHud` de Courier para uma **família condensada/estêncil** parecida com a do GTA (HUD de dinheiro):
  - Importar **`Pricedown`** (clássica do GTA) via Google Fonts alternativa ou self-host, com fallback: `"Pricedown","Anton","Bebas Neue",system-ui,sans-serif`.
  - Cor verde-dinheiro `#7be37b` mantida, mas com leve **text-shadow preto** pra dar peso, letter-spacing 1px, maiúsculas.
  - Tamanho 22px em landscape, 18px em portrait.
- Aplicar a mesma família apenas em valores numéricos de HUD (saldo, +R$ no toast de entrega) — não no texto da UI inteira.

### 5. Chat melhor
Hoje o chat mobile é um painel cinza translúcido que cobre o personagem.
Proposta:
- **Modo "flutuante" sempre visível**: as últimas 3 mensagens aparecem como bolhas discretas no canto inferior-esquerdo (acima do joystick), sem fundo de painel, com fade-out automático após ~8s.
- Ao tocar no botão de chat, abre um **painel translúcido glass** mais alto e estreito (340px de largura em landscape), encostado à esquerda, com:
  - cabeçalho fino: "Chat da sala" + botão fechar `×`
  - log com mais respiro entre bolhas (gap 8px), bolhas com avatar à esquerda e nome em negrito acima
  - bolhas do próprio usuário alinhadas à direita, fundo `primary/20`
  - input fixo no rodapé com `position: sticky; bottom: 0` + safe-area
- O texto **"Saiu da conversa"** e **"Conversando com X (Esc para sair)"** sai do log de chat e vira um **banner separado**, fixo no topo da área de jogo (logo abaixo dos pills), pra não poluir o histórico.

### 6. Correções extras propostas
- **`SAIR`** vira pill compacto (mesmo estilo dos outros), perde o escudo grande que destoa.
- **Botão de microfone** ganha estado visual claro de "gravando" (anel vermelho pulsante) — hoje fica idêntico ligado/desligado.
- **Joystick**: o anel branco está com opacidade alta, pode ficar `opacity: 0.5` quando ocioso e 0.9 ao tocar.
- **Nameplates** (ex: "caio") ganham um leve fundo `rgba(0,0,0,0.4)` + padding 2px 6px pra serem lidos em qualquer plano de fundo.
- **Pill NPCs** só aparece pra admin (hoje aparece pra todo mundo, mas o painel é admin-only).

## Onde mexer (técnico)

- `public/index.html` — remover/ocultar a `.topbar` em mobile; transformar `#logoutButton` em pill no canto.
- `public/styles.css`
  - novo bloco "HUD pills" com a classe utilitária `.hud-pill`
  - `@media (max-height: 600px) and (pointer: coarse)`: `display:none` na `.topbar`, ajuste de `bottom` da `.mobile-bar`, joystick, micro
  - estilizar `.chat-panel` em landscape (largura 340px, alinhado à esquerda) + bolha do próprio user à direita
  - `@font-face` ou `<link>` do Pricedown/Anton
  - estilo `#moneyHud` reescrito (remover inline cssText e mover pra `.css`)
- `public/delivery.js` — trocar o `style.cssText` inline do `#moneyHud` por `className = 'hud-pill money-pill'`; toast de entrega usa a mesma família.
- `public/npc.js` — trocar o `style.cssText` inline do botão "🧍 NPCs" por `className = 'hud-pill npc-pill admin-only'`.
- Banner "Conversando com X" — novo elemento `#npcChatBanner` controlado em `npc.js`, fora do `chatLog`.

Sem mudanças em backend, rotas, NPCs ou lógica de jogo — só camada visual.
