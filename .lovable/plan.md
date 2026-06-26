## Objetivo

Tornar a criação de missões e mecânicas 100% sem código: formulários por tipo de etapa, uploads direto pelo painel, novo painel "Mecânicas" com construtor visual (gatilho → condições → ações) e estado por jogador. Também: corrige seletor de NPC dador e baixa o ícone de câmera.

---

## 1. UI: ícone de câmera abaixo do escudo admin

`public/styles.css` — mover o botão de troca de câmera para `top: 116px` (abaixo do escudo em `64px`) e garantir `z-index` consistente. Verificar mobile.

## 2. Painel de Empregos — reescrita do `jobs-admin.js`

Substituir todos os `prompt()`/`confirm()`/`alert()` por modais HTML reais. Toda janela tem botão ✕ no canto e fecha clicando no backdrop ou Esc.

### 2.1 Selecionar NPC dador agora aparece no formulário de criação
Hoje, se a lista de NPCs vier vazia o seletor é pulado e o campo nunca aparece na edição. Mudanças:
- Form de criação/edição com `<select>` populado por `npc_instances` do mapa atual + opção "Nenhum (auto-aparecer ao chegar perto)".
- Botão "Atualizar lista" ao lado.
- Animação ociosa via `<select>` populado por `npc_animations`.

### 2.2 Editor de etapas com formulário por `kind`
Em vez do `prompt("Config JSON...")`, cada `kind` abre um form dedicado:

| kind | campos |
|---|---|
| talk_to_giver | falas (textarea por linha) |
| pickup_item | select item_catalog + botão "📍 capturar posição", raio (slider) |
| deliver_item | select item, x/y/z (capturar), raio |
| goto_point | x/y/z (capturar), raio, texto do prompt |
| enter_vehicle | select map_cars |
| drive_to | select map_cars, x/y/z, raio |
| park_vehicle | select map_cars, x/y/z, raio, checkbox "despawn ao concluir" |
| deliver_to_spawned_npc | select npc_models, raio spawn aleatório, "anda embora após entregar?", distância |
| talk_to_npc | select npc_instances, raio |
| interact_asset | select map_asset_interactions, select animação |
| play_animation | select animação, duração (ms) |
| complete/fail | só rótulo |

Cada form tem aba "Avançado" expansível com JSON cru pra quem quiser (fallback).

### 2.3 Uploads diretos no painel
Botão "📦 Itens" no toolbar do painel principal abre um modal pra:
- Subir GLB → cria registro em `item_catalog` (slug auto a partir do nome).
- Definir bone de anexo, offset e rotação com inputs numéricos.

Botão "🎵 Áudios" do passo abre upload de mp3 → `audio_clips` (categoria `job_step`), e amarra ao step via `config.sound_clip_id`.

Botão "🖼️ Capa" do emprego sobe imagem pro bucket `map-assets/jobs/` e salva em `job_templates.cover_url` (coluna nova).

Botão "🚩 Marcador" permite trocar o cone padrão de destinos por GLB.

### 2.4 Transições editadas visualmente
Em vez de digitar "on_success", lista das etapas existentes em cada step row com setas → pra escolher destino e tipo.

## 3. Novo painel **Mecânicas**

Botão novo no admin dock: 🧩 Mecânicas. Estrutura geral:

```
Mecânica
 ├── Trigger (1)
 ├── Conditions (N - AND/OR)
 └── Actions (N, em sequência, com await)
```

### 3.1 Schema (nova migração)

```sql
CREATE TABLE public.mechanics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean DEFAULT true,
  trigger jsonb NOT NULL,        -- { kind, params }
  conditions jsonb DEFAULT '[]', -- [{ kind, params }]
  actions jsonb NOT NULL,        -- [{ kind, params, delay_ms }]
  cooldown_seconds int DEFAULT 0,
  per_player boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.player_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  map_id text,
  key text NOT NULL,
  value jsonb,
  expires_at timestamptz,
  PRIMARY KEY (user_id, map_id, key)
);

CREATE TABLE public.mechanic_cooldowns (
  mechanic_id uuid REFERENCES public.mechanics(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  available_at timestamptz NOT NULL,
  PRIMARY KEY (mechanic_id, user_id)
);
```

+ GRANTs + RLS (leitura/escrita só com `has_role('admin')` para mechanics; player_state só do próprio user).

### 3.2 Blocos disponíveis

**Triggers**
- `zone_enter` / `zone_exit` (x,y,z,radius)
- `key_press` (tecla, opcional `requires_proximity_to: {x,y,z,r}` ou `requires_npc_id`)
- `proximity_to_npc` / `proximity_to_asset`
- `interval` (a cada N segundos)
- `vehicle_enter` / `vehicle_exit` (opcional `car_id`)
- `on_join_map`
- `manual` (chamado por outra mecânica)

**Conditions**
- `has_item` (item_slug, qty)
- `has_money` (cents)
- `time_of_day` (entre H:M e H:M)
- `is_admin`
- `inside_vehicle`
- `variable_equals` (key, value)
- `variable_gte` (key, n)

**Actions**
- `give_item` / `remove_item`
- `play_sound` (clip_id, 2d ou 3d local)
- `play_animation` (no player, slug, duração)
- `spawn_npc` (model_id, x/y/z, walk_to opcional, lifetime)
- `spawn_vehicle` (car_id, x/y/z)
- `teleport_player` (x/y/z, map_id opcional)
- `add_money` (cents) / `remove_money`
- `damage_player` (hp)
- `show_message` (texto, duração, ícone)
- `set_variable` / `inc_variable`
- `trigger_mechanic` (id) — encadeia
- `wait` (ms)
- `start_job` (job_template_id)

### 3.3 Runtime cliente

Novo `public/mechanics.js`:
- Carrega mechanics do mapa via realtime.
- Hooks no loop principal: checa zonas/proximidade.
- Handlers de tecla / entrada-de-veículo.
- Executa ações chamando helpers já existentes (`window.GameAudio`, `window.spawnNpc`, etc).
- Estado por jogador via tabela `player_state` (cooldown/contadores).

### 3.4 UI do painel
Mesma linguagem do jobs-admin reescrito:
- Lista de mecânicas (cards: nome, ativo, último trigger).
- "+ Nova" → modal step-by-step (1. nome, 2. gatilho, 3. condições, 4. ações).
- Cada action/condition é um card com form específico ao seu `kind`.
- Reordenar ações com drag (HTML5 nativo).
- Botão "▶ Testar" simula a mecânica no próprio admin.

## 4. UX comum dos modais
- Backdrop escurecido + scroll travado no body.
- ✕ no header + click-fora + tecla Esc fecham.
- Empilháveis (modal sobre modal com z-index dinâmico).
- Toasts (não `alert`) pra sucesso/erro.

## 5. Bug atual em `jobs-admin.js` (linkCar)
A função `linkCar` está com chaves quebradas (faltou `}` antes da `linkNpc` e o `await sb.from("job_steps")...` aparece duas vezes). Reescrita do arquivo já corrige.

---

## Detalhes técnicos
- Buckets: usar `map-assets` (já existe, público) pra GLBs/itens/capas; `audio-clips` (privado) pra áudios — com signed URL pra player.
- Não tocar em `client.ts`, `types.ts`.
- Realtime em `mechanics` pra refletir mudanças entre jogadores.
- Sem dependências novas: tudo em JS vanilla nos arquivos `public/`.

## Arquivos tocados
- `public/styles.css` — botão câmera, classes de modal.
- `public/jobs-admin.js` — reescrita.
- `public/jobs.js` — adicionar suporte a `cover_url`, `walk_away_after_deliver`, `repeat`, `sound_clip_id`.
- `public/mechanics.js` — **novo** (runtime).
- `public/mechanics-admin.js` — **novo** (painel).
- `public/index.html` — incluir os dois scripts.
- `public/app.js` — registrar botão Mecânicas no dock admin + hooks de loop.
- Migração SQL — 3 tabelas + grants + RLS + `cover_url` em `job_templates`.

## Fora de escopo (proposto pra próxima rodada)
- Editor visual de zonas no mapa (por enquanto: capturar posição do player + raio).
- Importar/exportar mecânicas como JSON.
- Versionamento/histórico de edições.