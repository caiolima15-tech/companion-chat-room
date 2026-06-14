# Sistema de Empregos / Missões

Objetivo: você cria empregos inteiros pelo painel admin (NPC dador → etapas → recompensa) sem precisar mexer em código. Etapas reutilizam blocos prontos (pegar caixa, ir até ponto, dirigir, falar com NPC, interagir com asset) que podem ser encadeados em grafo com ramificações.

---

## 1. Modelo de dados (novas tabelas)

```text
job_templates
  id, map_id, giver_npc_id (FK npc_instances), title, description,
  payout_cents, xp_reward, cooldown_seconds, min_level, active,
  start_step_id (FK job_steps), created_by, created_at

job_steps                      ← nó do grafo
  id, job_id, kind, label, config (jsonb), dialogue (jsonb),
  position_x, position_y       ← só p/ layout no editor visual

  kind ∈
    talk_to_giver       (abre balão inicial do NPC dador)
    pickup_item         (config: item_slug, spawn_x/y/z OU asset_id)
    deliver_item        (config: target_x/y/z, radius, item_slug)
    goto_point          (config: x/y/z, radius, prompt_text)
    interact_asset      (config: asset_interaction_id, animation_key)
    talk_to_npc         (config: target_npc_id, radius)
    enter_vehicle       (config: car_id OU car_template, spawn_point)
    drive_to            (config: x/y/z, radius, must_be_in_vehicle)
    play_animation      (config: animation_key, duration_ms)
    complete            (terminal — paga recompensa)
    fail                (terminal — cancela)

job_step_transitions           ← arestas do grafo
  id, from_step_id, to_step_id, condition, order_idx
  condition ∈ on_success | on_fail | on_timeout | on_choice:<key>

job_progress                   ← estado por jogador
  id, user_id, job_id, current_step_id, state (jsonb: itens carregados,
  timers, escolhas), started_at, completed_at, status
  unique(user_id, job_id, started_at)

job_cooldowns
  user_id, job_id, available_at
```

`dialogue` por step (jsonb):
```json
{ "on_enter": ["Pega essa caixa ali atrás."],
  "on_progress": ["Tá indo bem!"],
  "on_complete": ["Boa, próxima parada…"],
  "on_fail": ["Deixou cair?"] }
```

Recompensa reaproveita `complete_delivery`-style RPC (`complete_job_step`) que credita `profiles.balance_cents` + `wallet_transactions` + grava `job_cooldowns`.

---

## 2. Painel admin (novo botão no escudo de admin)

Tela "Empregos" com 2 abas:

**a) Lista de templates** — criar / editar / ativar / duplicar.

**b) Editor visual de etapas** (canvas simples, nodes + setas):
- Sidebar com blocos arrastáveis (1 por `kind`).
- Clicar num node abre painel lateral com formulário específico do `kind`:
  - `pickup_item` → seleciona `item_catalog` + botão "definir posição" (clica no mapa 3D pra capturar x/y/z igual já fazemos com hubs).
  - `interact_asset` → dropdown de `map_assets` + `map_asset_interactions` daquele asset.
  - `talk_to_npc` → dropdown de `npc_instances` do mapa.
  - `enter_vehicle` / `drive_to` → dropdown de `map_cars` + capturar ponto.
  - Todos os steps: textarea de falas (1 por linha) para cada gatilho do `dialogue`.
- Setas conectam nodes (`on_success` por padrão; criar segunda saída vira `on_fail` ou `on_choice`).
- Botão "Definir como início" marca `start_step_id`.

NPC dador: dropdown global no topo + ícone aparece flutuando sobre a cabeça dele no mapa (igual hub de entrega, mas em verde com 💼).

---

## 3. Runtime no jogo (`public/jobs.js` — novo arquivo)

Polling 800 ms (igual `delivery.js`):

1. **Detecção do dador**: se player < 3.5 m de um `giver_npc_id` ativo e sem `job_progress` em aberto e sem cooldown → mostra prompt `[J] Falar com {NPC}` + balão de fala (`talk_to_giver` step).
2. **Aceitar** → insere `job_progress` com `current_step_id = start_step_id`, dispara `on_enter` do primeiro step real.
3. **Loop por step ativo** avalia condição de avanço conforme `kind`:
   - `pickup_item`: spawn de mesh no mundo → player < 2 m + tecla [E] → marca item em `state.inventory` + esconde mesh + cola "caixa" nas mãos do avatar (reaproveita item attach existente).
   - `deliver_item`: player < radius + tem item no state → remove item + avança.
   - `goto_point` / `drive_to`: distância < radius (drive_to verifica se está montado num car).
   - `interact_asset`: dispara a interaction existente; ao terminar animação → avança.
   - `talk_to_npc`: distância < radius → balão flutuante sobre o NPC com `on_enter`, botão "Continuar" avança.
   - `enter_vehicle`: detecta que entrou no carro do `car_id`.
   - `play_animation`: toca anim no player, espera `duration_ms`.
4. **HUD lateral** (canto direito, abaixo do dinheiro): título do job + label do step atual + seta indicadora 3D apontando para o alvo (sprite já usado em delivery).
5. **Balões de fala**: componente compartilhado `npc-bubble` (div absoluta posicionada por projeção 3D, fade out 4 s) usado em `on_enter`/`on_progress`/`on_complete` de qualquer step com `target_npc_id` ou no próprio dador.
6. **Terminal**: ao chegar em `complete` chama RPC `complete_job(_progress_id)` → paga + atualiza saldo realtime + escreve `job_cooldowns(available_at = now() + cooldown_seconds)`.

---

## 4. Empregos prontos que você consegue montar no dia 1

Só com os blocos acima, sem código novo:

- **Entregador de padaria**: `talk_to_giver` → `pickup_item(pão)` → `deliver_item(casa cliente)` → `complete`.
- **Mecânico**: `talk_to_giver` → `goto_point(garagem)` → `interact_asset(caixa de ferramenta, anim wrench)` → `talk_to_npc(cliente)` → `complete`.
- **Motorista de táxi**: `talk_to_giver` → `enter_vehicle(taxi)` → `drive_to(passageiro)` → `talk_to_npc` → `drive_to(destino)` → `complete`.
- **Mudança**: `talk_to_giver` → `pickup_item(caixa A)` → `enter_vehicle(van)` → `drive_to(casa nova)` → `deliver_item` → loop ×3 via transição `on_choice:more`.
- **Garçom**: `talk_to_giver` → `talk_to_npc(mesa1)` → `goto_point(cozinha)` → `pickup_item(prato)` → `deliver_item(mesa1)` → `complete`.

Ramificações úteis: `on_fail` em `deliver_item` (item caiu/expirou) → step "voltar e pegar de novo" ou `fail`.

---

## 5. Entregáveis em ordem

1. Migração: 4 tabelas + RPC `complete_job` + RLS (admin escreve templates, jogadores leem ativos e mexem só no próprio `job_progress`/`job_cooldowns`) + GRANTs.
2. `public/jobs-admin.js` + UI dentro do painel admin (lista + editor visual de grafo com `react-flow`-like simples em canvas/SVG vanilla pra ficar no padrão dos outros admins).
3. `public/jobs.js` — runtime, prompts, HUD, balões, attach de item, marcadores no mapa.
4. CSS pros balões e HUD lateral em `public/styles.css`.
5. Registrar `jobs.js` em `public/index.html`.

Pronto pra eu implementar nesta ordem?
