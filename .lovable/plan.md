# Sistema de Bots Interativos + Itens Coletáveis

## Visão

Hoje os bots em `map_bots` são apenas avatares decorativos com uma animação em loop. A ideia é transformá-los em **atendentes**: o jogador chega na bancada, aperta E numa interação ligada ao bot, o bot toca uma animação de "servir", spawna um **item GLB** (a bebida) numa superfície de destino, e o item fica persistente no mundo até alguém pegar (do jogador que pediu OU de outro).

A arquitetura proposta reaproveita tudo que já existe (`map_asset_interactions`, sistema de pré-carregamento FBX, occupancy realtime, `map_bots` realtime, `assetObjects` para pose mundial) e adiciona apenas o necessário: catálogo de itens, instâncias spawnadas no mapa, e um novo `kind` de interação que dispara o bot.

## Viabilidade

Tudo é viável com o stack atual. Pontos verificados:

- `map_asset_interactions.kind` já é texto livre — basta adicionar `kind='bot_service'` sem alterar schema dos kinds existentes.
- Pose mundial via `computeSeatPose` já entrega ponto exato (`worldPos` + `objectTopY`) onde podemos spawnar a bebida — reutilizável.
- Realtime já está ativo em `map_bots` e `map_asset_interactions`. Bastam dois canais novos: `map_item_instances` (persistência) + Realtime broadcast leve para a animação de servir (não precisa persistir cada gesto).
- Bots já têm `mixer`/`actions` — só falta um helper `playBotActionOnce(botId, animationUrl)` que dispare a animação e retorne ao idle.
- Itens coletáveis ficam em uma tabela nova com RLS: qualquer autenticado lê/insere/deleta (delete = "pegou"). Sem servidor extra.

Risco baixo. Maior cuidado: **race condition** quando dois jogadores tentam pegar o mesmo item ao mesmo tempo — resolvido com `DELETE ... RETURNING` (o primeiro vence) + `holder_user_id` opcional pra animação de "carregando".

## Mudanças

### 1. Banco (uma migration)

**Catálogo de itens (admin cadastra GLBs e seus tunings):**

```text
item_catalog
  id, slug (unique), name, glb_url,
  scale (default 1), offset_y (default 0),  -- ajuste no spawn
  hold_bone (default 'RightHand'),          -- bone para "carregar"
  hold_offset_x/y/z, hold_rot_x/y/z,        -- ajuste fino ao segurar
  created_by, created_at
```

**Estende `map_asset_interactions**` (admin liga a interação ao bot e ao item):

```text
ADD COLUMN bot_id uuid REFERENCES map_bots(id) ON DELETE SET NULL
ADD COLUMN bot_animation_url text     -- animação que o bot toca (ex.: "servir")
ADD COLUMN item_slug text             -- referência a item_catalog.slug
ADD COLUMN item_spawn_offset_x/y/z double precision DEFAULT 0
ADD COLUMN service_duration_ms int DEFAULT 3500  -- tempo até spawnar item
```

Continua compatível: interações antigas (`sit`, etc.) ignoram esses campos.

**Instâncias de itens no mapa (persistente, realtime):**

```text
map_item_instances
  id, map_id, item_slug,
  x, y, z, rotation_y,
  spawned_by_user_id,    -- quem pediu
  spawned_at,
  source_interaction_id  -- opcional, pra debug
```

RLS: read all auth · insert auth · delete auth (qualquer um pega). Publicação realtime ativada.

### 2. Cliente (`public/app.js`)

**a. Catálogo de itens (admin):**
Painel novo no admin (igual ao de bot_animations): lista, upload GLB pro bucket `map-assets/items/`, formulário pra `scale`/`hold_bone`/offsets. Cache em `window.__itemCatalog`.

**b. Editor de interação (estender o painel existente):**
Quando o admin escolhe `kind=bot_service`, mostrar:

- Dropdown "Bot atendente" (lista `map_bots` do mapa)
- Dropdown "Animação do bot ao servir" (lista `bot_animations`)
- Dropdown "Item a entregar" (lista `item_catalog`)
- Sliders "Spawn offset X/Y/Z" (relativo ao asset alvo, com preview)
- Slider "Duração do serviço (ms)"

**c. Loop de proximidade — já existe.** `enterSit` é estendido: se `inter.kind === 'bot_service'`, chama `runBotService(inter)` em vez do fluxo de sentar.

**d. `runBotService(inter)`:**

1. Marca interação como ocupada (occupancy `single` por ~`service_duration_ms`) — reaproveita` presencePayload`+`isInteractionOccupied`.
2. Olha pro bot: rotaciona o bot pro jogador (slerp em ~300ms).
3. Toca `inter.bot_animation_url` no mixer do bot via `playBotActionOnce` (clipAction com `LoopOnce` + `clampWhenFinished=false` voltando pro idle no `finished`).
4. Broadcast `bot-service-start` no canal do mapa pros outros clientes verem a animação (não persiste — efêmero).
5. Após `service_duration_ms`, calcula `worldPos` do spawn (= `computeSeatPose` do asset + `item_spawn_offset_*`) e insere `map_item_instances`. Realtime entrega pra todos.
6. Libera occupancy.

**e. Render dos itens spawnados:**

- `loadMapItems(mapId)` no boot + Realtime subscriber: INSERT → carrega GLB (cache por `item_slug`) e adiciona ao mundo no `worldPos`; DELETE → remove do mundo.
- Cada item tem `userData.itemInstanceId` pra lookup.

**f. Pegar item (qualquer jogador):**

- Loop de proximidade global checa distância pro player local; se < 1.2m mostra prompt "Pegar (E)".
- Ao pressionar: `DELETE FROM map_item_instances WHERE id=... RETURNING id`. Se a linha voltar (vencemos a corrida), anexa item ao bone `hold_bone` do meu avatar via `entity.character.getObjectByName(bone).add(itemMesh)` com os offsets do catálogo.
- "Carregar" é local (não persistido) — quando o jogador desconecta ou anda muito longe, simplesmente some. Se quiser persistir "inventário" depois, é uma tabela extra — fora de escopo agora.

**g. Largar / consumir (mínimo viável):** Botão "Soltar" no painel de interações (ou tecla) que insere de volta em `map_item_instances` na posição atual do jogador. Permite que outro pegue.

### 3. Não muda

- Schemas `auth`, `storage`, `realtime` intocados.
- `map_bots` schema intacto (só ganha referência via `map_asset_interactions.bot_id`).
- Sistema de sentar, joystick, presence, futebol — não mexem.

## Arquivos afetados

- **Migration nova**: `item_catalog`, `map_item_instances`, alterações em `map_asset_interactions`, GRANTs, RLS, publicação realtime.
- `**public/app.js**`: novo módulo "items" (catálogo + instâncias + pegar/largar), helper `playBotActionOnce`, extensão de `enterSit` pra rotear `bot_service`, novo painel admin de itens, campos extras no editor de interação.
- `**public/index.html**`: painel admin "Itens" (igual ao de bots/animações).
- `**public/styles.css**`: pequeno styling do prompt "Pegar".

## Fora de escopo (pode virar fase 2)

- Inventário persistente / múltiplos itens carregados.
- Bot caminhar até a mesa pra entregar (hoje: spawna direto no destino — bot fica fixo).
- Fila de pedidos / múltiplos jogadores em sequência (hoje: occupancy bloqueia 1 por vez).
- Beber/consumir o item com animação.

## Pergunta antes de implementar

Confirma que o **bot fica parado** (anima "servir" no lugar) e a bebida **aparece já em cima da mesa** após o tempo configurado? Ou você quer que o bot caminhe até a mesa carregando o item? A versão "fica parado + spawna no destino" é muito mais simples e robusta — recomendo começar por ela. 

Quero que inicialmente os garcons fiquem parados mesmo, mas com animacao do IDLE, e so tocam animacao de servir quando tiver interação e voltam pra idle. e por fim o objeto como bebida pode ser largada ou com o tempo  1 min ela some.. certifique de que eu possa posicionar o objeto no local que eu quero que apareça e na animacao que fique na mao do personagem ( que eu possa ajusar tambem de todas as formas ) e que essa animacao de bebendo vai ta inclusa quando avatar tiver com bebida na mao. e que essa animacao de bebendo pode acontecer enquanto o personagem anda, senta, deita.. a mao continua bebendo junto com a cabeca e partes que envolvem.