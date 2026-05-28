## Objetivo

Trazer a mecânica do seu protótipo de futebol para dentro da sala 3D multiplayer: uma **bola GLB compartilhada** que aparece nos mapas onde você colocar (via painel admin), e quando qualquer avatar chega perto entra no **modo futebol** (controle analógico, câmera atrás do jogador, correr, e chute com barra de força). A bola é sincronizada em tempo real entre todos da sala.

## O que VOCÊ precisa subir (e como exportar)

- **Bola:** um único arquivo **`.glb`** (modelo de bola). Tamanho/posição são ajustados no código/admin.
- **Animações de chute (Mixamo):** exportar **FBX Binary, "Without Skin"** (só animação, sem malha) — igual aos seus `idle/walk/run.fbx` atuais. A base usada no Mixamo é indiferente (todo rig Mixamo usa os ossos `mixamorig`, e o app já faz retarget). Use **30 fps** e marque **"In Place"** quando existir.
  - `kickWeak` → ex.: "Soccer Pass" / "Passing"
  - `kickStrong` → ex.: "Center Kick" / "Striker"
  - (opcional) `dribble` para idle com bola; senão reuso `walk`.
- `walk` e `run` já existem e serão reaproveitados.

Você me sobe a bola `.glb` e os 2 FBX de chute aqui no chat; eu coloco a bola na biblioteca de objetos e os chutes na biblioteca de animações.

## Como vai funcionar

```text
┌──────────────────────────────────────────┐
│  (sala normal: clique pra andar)          │
│                ⚽  ← bola dinâmica         │
│        ↑ chega perto da bola              │
│  ╔══════════════════════════════════════╗ │
│  ║  MODO FUTEBOL                         ║ │
│  ║  joystick/WASD + câmera atrás         ║ │
│  ║  [RUN]            [CHUTE] + barra força║ │
│  ╚══════════════════════════════════════╝ │
│        ↓ se afasta → volta ao normal      │
└──────────────────────────────────────────┘
```

### 1. Colocar a bola por mapa (painel admin)
- Adiciono um novo tipo de objeto **"Futebol"** ao sistema de interações que você já usa (`map_asset_interactions` + `map_assets`). Você escolhe o mapa, posição (ponto de spawn da bola), escala e o **raio de ativação** (a "zona do campo").
- Pode colocar em quantos mapas quiser (1 registro por mapa).
- O objeto colocado define o spawn; a bola em si é um objeto dinâmico que se move com física.

### 2. Bola compartilhada (multiplayer)
- A bola vive como um objeto dinâmico na cena para todos que estão num mapa com futebol ativo.
- Sincronização por **posse/autoridade** via um canal realtime dedicado por mapa (broadcast):
  - Quem está com a bola (ou foi o último a chutar) é a **autoridade** e transmite posição/velocidade da bola em alta frequência.
  - Os outros clientes **interpolam** a bola recebida (sem recalcular física).
  - Ao um jogador entrar no raio de captura da bola solta, ele **reivindica a posse** (broadcast de "claim"); empate resolvido por menor id/timestamp.
- Estado da bola é efêmero (só realtime) — sem novas tabelas. Quem entra na sala recebe a posição atual da autoridade no próximo tick.

### 3. Modo futebol (ativação por proximidade)
- Ao entrar no raio da bola: troco o controle de "clicar pra andar" por **controle analógico** (joystick mobile já existe na UI + WASD), com a **câmera terceira pessoa atrás do jogador** (yaw/pitch/zoom por arrasto, como no protótipo).
- Drible: a bola "gruda" levemente à frente do jogador com pequenos toques (lógica do seu protótipo).
- **Chute:** segurar o botão **CHUTE**/Espaço carrega a **barra de força**; soltar dispara — `kickWeak` se carga baixa, `kickStrong` se carga alta — aplicando força/altura proporcional. A bola é liberada do pé e segue física (gravidade, quique, atrito).
- Ao se afastar (raio de saída): volto ao movimento normal de clique e à câmera padrão.
- A posição do jogador no modo futebol continua sincronizada pelo broadcast de movimento já existente (`me.x/me.y/facing/running`), agora atualizado continuamente em vez de por destino.

### 4. Animações de chute
- Adiciono `kickWeak` e `kickStrong` à biblioteca compartilhada (`SHARED_ANIM_LIBRARY`) e aos slots de animação de cada avatar (carregadas/retargeadas sob demanda como as demais).
- Chute toca **uma vez** (LoopOnce, clampWhenFinished) e volta para walk/run/idle ao terminar.
- A animação de chute também é refletida nos outros jogadores (broadcast de evento "kick").

## Detalhes técnicos

- **Sem mudança de schema.** Uso `map_asset_interactions.kind = 'football'` (campo texto livre), com `asset_id` apontando para o `map_assets` da bola e `trigger_radius`/`exit_radius` para ativar/desativar. Bola e física rodam no cliente; sincronização só por realtime (broadcast), sem persistir estado da bola.
- **Arquivos:** bola `.glb` vai pro bucket `map-assets` (fluxo de upload de objeto que já existe); os FBX de chute vão pra `public/assets/animations/` e entram em `SHARED_ANIM_LIBRARY`.
- **Coordenadas:** a bola usa posição em mundo (Three.js); converto para o sistema `worldFromPercent`/`percentFromWorld` só onde precisar interagir com o jogador. Aplico os limites/quiques dentro dos limites do mapa atual.
- **Câmera/colisão:** reuso os raycasts de chão/colisão já existentes para a câmera terceira-pessoa e para manter a bola no chão do mapa.
- **Canal realtime novo:** `ball:<mapId>` (broadcast) para transform da bola, claims de posse e eventos de chute; entra/sai junto com a sala.
- **UI:** barra de força + botões CHUTE/RUN só aparecem no modo futebol (escondidos por padrão; reaproveito estilos do protótipo adaptados ao tema atual).

## Validação

- Admin coloca a bola num mapa; ao entrar perto, modo futebol ativa (joystick/WASD, câmera atrás, barra de força).
- Chutar fraco/forte: animação correta e física da bola coerente.
- Dois navegadores no mesmo mapa: ambos veem a mesma bola; passar/disputar funciona; chute de um aparece pro outro.
- Afastar-se volta ao controle normal sem tela preta.
- Conferir mobile (390px): joystick + botões + barra sem cortar.

## O que NÃO muda

- Login, troca de avatar, troca de mapa, chat, rádio e demais interações (sentar etc.) continuam iguais.
- Mapas sem objeto "Futebol" não têm bola nem modo futebol.
