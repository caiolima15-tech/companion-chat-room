# Rádio nas salas + tela de carregamento

A tabela `map_radios` já existe no banco, mas nada está conectado no frontend. Vou ligar o sistema completo de rádio, criar a tela de carregamento roxa e garantir que nada toque/conecte enquanto o usuário não estiver dentro de uma sala.

## 1. Rádio por sala (admin define, usuário só ouve)

**Painel do admin (escondido em "Ferramentas")**
- Novo botão `📻 Rádio` na barra superior, junto com Luzes / Camadas / Bots, com `class="admin-only"` (só admin vê).
- Abre um painel flutuante (`#radioAdminPanel`) com:
  - Lista de estações da sala atual (nome, gênero, URL do stream `.mp3` / `.m3u8` / Icecast).
  - Botão "+ Nova estação" → form simples (nome, gênero, URL).
  - Por estação: editar, excluir, e botão "▶ Tocar nesta sala" (marca `is_playing=true` e zera o flag das outras da mesma sala).
  - Botão "⏹ Parar rádio" (seta `is_playing=false` em todas da sala).
- Tudo via `supabase.from("map_radios")` (RLS de admin já existe).

**HUD do usuário comum (super discreto)**
- Pílula fixa no topo da tela (`#radioHud`), só aparece quando há estação tocando na sala atual:
  - Equalizer animado + `📻 Nome da Rádio · Gênero`
  - Botão `🔇/🔊` para mutar/desmutar (local).
  - Slider fino de volume (aparece no hover/tap, padrão recolhido).
- Não mostra URL, não permite trocar estação, não mostra controles de admin.

**Reprodução**
- Um único `<audio id="radioPlayer">` global controlado por JS.
- Carrega/toca quando: usuário está dentro da sala (`body.in-world`) **E** existe linha em `map_radios` para `currentMapId` com `is_playing=true`.
- Para e descarrega (`audio.src=""`) sempre que: sai da sala, troca de sala, faz logout, ou estação é parada.
- Realtime: assinatura `postgres_changes` em `map_radios` filtrada por `map_id=currentMapId` para refletir play/stop/troca em tempo real para todos.
- Volume e mute persistidos em `localStorage` (`radio.volume`, `radio.muted`).

## 2. Não tocar/conectar em background

- O rádio só inicializa **depois** de `enterRoom()` concluir; antes disso o `<audio>` não recebe `src`.
- Ao mostrar `authOverlay` ou `mapSelectOverlay` (escolha de sala), forçar `stopRadio()` e remover assinatura realtime do rádio.
- Garantir que `loadInitialAssets`, `connectRealtime` e o canal de presença **não** rodem em background: hoje já só rodam dentro de `enterRoom`, mas vou adicionar guarda explícita para não conectar enquanto o overlay de auth ou de seleção de sala estiverem visíveis.
- Trocar de sala (`switchRoom`) chama `stopRadio()` antes do novo `map_id` assumir e o assina de novo só depois do mapa estar pronto.

## 3. Tela "Carregando o mundo" (roxa com brilho)

- Novo overlay `#worldLoadingOverlay` em `index.html`, posição fixa em tela cheia, `z-index` acima do canvas e abaixo do chat.
- Visual: fundo roxo no mesmo gradiente do login (`#1a1740 → #0b0a1a` com `radial-gradient` de `#6c5ce7` e `#a78bfa`), texto centralizado **"Carregando o mundo"** em fonte do app, e uma barra circular/orbital com brilho pulsante (CSS: `@keyframes` de `box-shadow` e `opacity` em roxo `#a78bfa`).
- Mostrado quando:
  - Usuário clica "Entrar" em uma sala (`confirmMapButton` / primeira entrada após selecionar personagem).
  - `switchRoom` para outra sala.
- Escondido quando: `loadEnvironment` resolve (GLTF do mapa carregado) **E** `loadInitialAssets` + `connectRealtime` terminaram. Vou converter `loadEnvironment` para retornar Promise se ainda não retornar, e usar `Promise.all` antes de remover o overlay.
- Garantir que o usuário **nunca** vê o canvas vazio: o overlay cobre a tela enquanto qualquer um dos passos estiver pendente.

## Arquivos afetados

- `public/index.html` — botão admin `📻 Rádio`, painéis `#radioAdminPanel` e `#radioHud`, overlay `#worldLoadingOverlay`, `<audio id="radioPlayer">`.
- `public/styles.css` — estilos do painel admin de rádio, pílula HUD com equalizer, overlay roxo de loading com animação de brilho.
- `public/app.js` — módulo `setupRadio()`: CRUD admin, realtime, play/stop, volume/mute local, integração com `enterRoom`/`switchRoom`/`stopRadio`; funções `showWorldLoading()` / `hideWorldLoading()` ancoradas em `enterRoom` e `confirmMapButton`.

## Banco

Sem migração nova — `map_radios` já existe com RLS correta (admin escreve, todos os autenticados leem). Só será usada como está.
