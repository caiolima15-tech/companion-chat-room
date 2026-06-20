# Tráfego de carros (NPC vehicles)

Sistema novo, espelhado no de NPCs a pé que já existe, mas adaptado para veículos: traçado de rotas por cliques, IA de seguimento de faixa, paradas em semáforos, anti-colisão simples, áudio 3D e renderização controlada por raio.

## 1. Banco de dados (Lovable Cloud)

Novas tabelas (todas com RLS: `SELECT` para `authenticated`, `INSERT/UPDATE/DELETE` só admin via `has_role`, mais GRANTs):

**`traffic_routes`** — uma rota traçada no mapa
- `id`, `map_id`, `name`, `direction` ('forward'|'backward'|'both'), `lane_offset` (m, deslocamento lateral pra mão/contramão), `loop` (bool), `created_at/by`

**`traffic_waypoints`** — pontos do traçado, conectados na ordem por cliques
- `id`, `route_id`, `seq`, `x`, `y`, `z`
- `speed_mps` (limite de velocidade no segmento que sai dali, default 8)
- `is_stop` (bool — sinal de parada/semáforo), `stop_duration_ms` (default 3000)
- `is_yield` (bool — dar preferência)

**`traffic_signals`** — semáforos opcionais, ligados a um waypoint
- `id`, `waypoint_id`, `cycle_red_ms`, `cycle_green_ms`, `cycle_yellow_ms`, `phase_offset_ms`
  (estado calculado client-side a partir do `now()` para todos verem igual sem realtime)

**`traffic_vehicles`** — definição de "carro NPC" do admin
- `id`, `map_id`, `route_id`, `car_catalog_id` (FK `cars_catalog` — pega GLB, sons, escala)
- `color_hex` (override opcional), `max_speed_mps`, `active`

**`traffic_state`** — estado em runtime (1 linha por veículo, atualizado pelo `traffic-tick`)
- `vehicle_id` (PK), `x,y,z`, `rot_y`, `speed`, `segment_index` (entre wp N e N+1), `t` (0..1 ao longo do segmento), `stopped_until` (timestamp), `updated_at`

Configurações em `game_settings` (mesma tabela já existente):
- `traffic_load_radius` (default 60m — quanto antes spawnar visualmente)
- `traffic_hearing_radius` (default 30m — áudio)
- `traffic_min_gap_m` (default 6 — distância mínima entre veículos na mesma rota)

## 2. Edge function `traffic-tick`

Mesma forma do `npc-tick` que já existe:
- Loop de ~1s, até 55 iterações por invocação, mantido vivo por cron.
- Para cada `traffic_vehicles.active=true`:
  - Lê waypoints da rota em ordem.
  - Avança ao longo do segmento atual usando `speed_mps` do wp atual.
  - Em waypoint com `is_stop`: para por `stop_duration_ms`.
  - Em waypoint com semáforo: consulta fase (vermelho/amarelo = para antes da linha).
  - Curvas: interpola posição com **Catmull-Rom** entre wps (wp-1, wp, wp+1, wp+2) para curva suave; `rot_y` = atan2 da derivada da curva. Isso é o "fazer curva como carro".
  - Mão/contramão: offset lateral fixo (`lane_offset`) aplicado perpendicular à direção do segmento, então rotas opostas ficam nas faixas certas.
  - **Anti-colisão**: antes de avançar, calcula distância pro veículo da frente na mesma rota (segment_index maior ou mesmo segment + t maior). Se < `traffic_min_gap_m`, ajusta velocidade pra ficar atrás (ou para).
- Upsert em `traffic_state`.

## 3. Render no cliente (`public/traffic.js` novo)

- Subscreve Realtime em `traffic_state` (mesmo padrão de `npc_state`).
- Para cada veículo dentro de `traffic_load_radius` do jogador:
  - Carrega GLB do `cars_catalog` (usa cache de GLBs que já existe pra carros do usuário).
  - Aplica `color_hex` se vier.
  - Interpola posição/rotação suavemente entre ticks (mesmo lerp dos NPCs).
- Fora do raio: desmonta a mesh (libera memória).
- Registra fonte de áudio 3D via `GameAudio.registerRemote("car:" + id, { getState })` — usa os clips do `cars_catalog` (accel/brake/horn). Volume cai com distância respeitando `traffic_hearing_radius` (mais alto que NPC).
- Colisão com jogador/carro do jogador: trata localmente — se a hitbox AABB do veículo intersecta a do jogador/carro, dispara `car_crash` (som da categoria nova) e empurra o jogador.

## 4. Painel admin (`public/traffic-admin.js` novo)

Botão `🚦 Trânsito` no topbar admin. Abas:

1. **Rotas** — lista de rotas do mapa atual; criar/editar/excluir. Botão **"Traçar rota"** entra em modo de captura:
   - Cada clique no mapa adiciona um waypoint conectado ao anterior (linha desenhada com `THREE.Line` em overlay).
   - Atalhos: `S` marca último wp como stop, `Y` como yield, `Enter` finaliza, `Esc` cancela.
   - Botão "Fechar laço" liga o último wp ao primeiro.
2. **Semáforos** — selecionar um wp da lista e ligar/desligar semáforo + ajustar ciclos.
3. **Veículos** — para a rota selecionada, adicionar veículos (escolhe carro do `cars_catalog`, cor opcional, velocidade máx).
4. **Visualização** — slider `traffic_load_radius` (persistido em `game_settings`, igual ao de NPCs, com realtime pra todos os usuários).

## 5. Integração com `app.js`

- `import` do `traffic.js` no `index.html`.
- No `loadMap()`: pedir ao `traffic.js` pra (re)inicializar para o novo `map_id`.
- No `animate()`: nada novo — `traffic.js` cuida do próprio loop de render + áudio (já temos `GameAudio.setListener` rodando por frame).
- Colisão: chamar `Traffic.collideWith(playerAABB)` no tick local.

## 6. Cron

Adicionar entrada no pg_cron que dispara `traffic-tick` a cada minuto (a função roda por ~55s, então fica contínuo), mesmo modelo do `npc-tick`.

## 7. Arquivos

**Novos:**
- migration: tabelas + RLS + grants + chaves em `game_settings`
- `supabase/functions/traffic-tick/index.ts`
- `public/traffic.js`
- `public/traffic-admin.js`

**Editados:**
- `public/index.html` — incluir os 2 scripts + botão `🚦 Trânsito` no topbar admin
- `public/app.js` — hook de `loadMap` e colisão
- `public/styles.css` — estilos do painel (padrão `users-admin-*`)

## 8. Fora do escopo desta fase

- Cruzamentos com prioridade real entre rotas diferentes (só `is_stop`/`is_yield` por wp; cruzamentos ficam coordenados pelos semáforos).
- Pedestres atravessando faixa interagindo com semáforo de carro.
- IA de mudança de faixa / ultrapassagem.
- Acidentes persistentes / amassado visual.

## Pontos para você decidir antes de eu codar

1. **Quantidade**: limite máximo de veículos simultâneos por mapa? Sugiro 20 (limita custo da edge function e tráfego de realtime).
2. **Curva**: ok com Catmull-Rom (suave automática) ou prefere curvas Bézier com pontos de controle explícitos no admin?
3. **Faixa/contramão**: `lane_offset` único por rota (mais simples) está bom, ou quer múltiplas faixas na mesma rota?
4. **Colisão com jogador**: empurrar e tocar som de batida, ou também aplicar dano/penalidade?
