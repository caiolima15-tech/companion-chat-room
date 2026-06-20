## Objetivo

Criar um sistema completo de áudio gerenciável pelo admin, com som 3D posicional (respeitando distância), sons por sala, por carro, por objeto/GLB, e controles finos de volume e timing de passos.

## 1. Banco de dados (Lovable Cloud)

Novas tabelas:

**`audio_clips`** — biblioteca central de arquivos de áudio enviados pelo admin
- `id`, `created_at`, `created_by`
- `name` (texto, ex: "Buzina civic"), `category` (enum: `ambient`, `footstep_walk`, `footstep_run`, `car_engine`, `car_brake`, `car_horn`, `voice_step`, `object`, `ui`, `other`)
- `url` (texto — URL no storage), `storage_path`, `duration_ms`, `size_bytes`, `loopable` (bool)

**`audio_settings`** — singleton/global por escopo
- `id`, `scope` ('global' | `map_id`), `master_volume`, `ambient_volume`, `sfx_volume`, `voice_volume`, `engine_volume`
- `footstep_walk_interval_ms` (default 410), `footstep_run_interval_ms` (default 250)
- `hearing_radius_m` (default 18 — alcance de SFX de outros players/NPCs)
- `falloff_ref_distance` (default 2), `falloff_max_distance` (default 25), `falloff_rolloff` (default 1.4)

**`map_ambient_sounds`** — som de fundo por sala
- `id`, `map_id`, `clip_id`, `volume` (0..1), `enabled`

**`map_object_sounds`** — som anexado a um asset/GLB do mapa
- `id`, `map_id`, `asset_instance_id` (ref `map_assets` ou `map_asset_interactions`)
- `clip_id`, `volume`, `radius_m`, `loop` (bool), `trigger` (enum: `always`, `proximity`, `interaction`)

Novas colunas em **`cars_catalog`**:
- `accel_clip_id` (uuid, nullable, FK `audio_clips`)
- `brake_clip_id` (uuid, nullable, FK `audio_clips`)
- `horn_clip_id` (uuid, nullable, FK `audio_clips`)

Todas com RLS:
- `SELECT` para `authenticated` (todo mundo precisa ler para tocar)
- `INSERT/UPDATE/DELETE` só para `has_role(auth.uid(),'admin')`
- `GRANT`s seguindo o padrão do projeto

Bucket de storage `audio-clips` (público, leitura anônima OK, upload restrito a admin via policy).

## 2. Painel admin (`public/audio-admin.js` novo)

Novo botão `🔊 Áudios` no topbar admin (junto dos outros). Abre overlay modal com abas:

1. **Biblioteca** — upload de arquivos (.mp3/.ogg/.wav, máx 2 MB), lista com categoria, prévia (play), excluir.
2. **Sala atual** — selecionar clip de ambiente para o mapa atual + volume; lista de sons anexados a objetos do mapa (add/edit/remove, com seletor de objeto via clique no asset).
3. **Carros** — para cada carro do catálogo, escolher clips de aceleração, freio, buzina.
4. **Volumes & timing** — sliders salvos em `audio_settings`: master, ambient, sfx, voice, engine; intervalo de passos andando/correndo; raio de audição; curva de atenuação (ref/max/rolloff).

Tudo persistido na hora; updates causam um `audio:settings` event no `window` que o `audio.js` escuta para re-aplicar sem reload.

## 3. Áudio 3D posicional (`public/audio.js` reescrito)

Substituir o `HTMLAudioElement` puro por **Web Audio API** com `AudioContext`:
- `AudioListener` segue posição/orientação da câmera (ou do jogador) a cada frame.
- Cada som posicional usa `PannerNode` (HRTF) com `refDistance`, `maxDistance`, `rolloffFactor` configurados via `audio_settings`.
- Carrega cada clip uma vez como `AudioBuffer` (cache por URL).
- Continua expondo `window.GameAudio` com API ampliada:
  - `playOnce(name, { volume, position? })`
  - `startLoop(name, { volume, position?, follow? })` / `stopLoop(name)`
  - `playAt(clipId, { position, volume, loop, refDistance, maxDistance })` — para sons de objeto e remotos
  - `attachToEntity(entityId, { clipId, ... })` — segue um player/NPC/carro
  - `setMasterVolume`, `setCategoryVolume(cat, v)`, `setHearingRadius(m)`, `setFootstepInterval(walk, run)`
  - `setEngine(carId, throttle, speed01)` — usa o clip definido para o carro
- Master + per-category gain nodes encadeados antes do destination.

## 4. Sons de outros players e NPCs

No tick principal de `public/app.js`:
- Para cada player remoto e cada NPC ativo, manter um `audio_source` posicional persistente por entidade.
- Quando o servidor (ou estado local replicado) dispara um evento (`player_footstep`, `npc_speak`, `car_horn`), chamar `GameAudio.playAt(clipId, { position: entity.position })`.
- Passos de remotos: derivar do estado `walk`/`run` deles + o intervalo configurado em `audio_settings`, igual ao local. Filtragem por distância: só calcula se `distance < hearing_radius`.
- Mesma lógica para NPCs (usa o `npc_state.position`).

## 5. Sons de objeto/GLB

No carregamento do mapa, ler `map_object_sounds` e para cada um:
- `proximity`/`always`: `startLoop` com `position` no centro do asset, `refDistance` e `maxDistance` vindos do registro.
- `interaction`: registra handler no objeto e dispara `playOnce` no clique/uso.

## 6. Sons de carro

Em `enterCar(c)`:
- Buscar `accel_clip_id`/`brake_clip_id`/`horn_clip_id` do catálogo do carro.
- Trocar o loop padrão por esses clips quando existirem; fallback para os defaults atuais.
- `setEngine` modula volume/playbackRate do clip do próprio carro.

## 7. Arquivos tocados

**Novos:**
- `public/audio-admin.js` (painel)
- migrations Supabase (tabelas + bucket + policies + grants)

**Editados:**
- `public/audio.js` — reescrito para Web Audio API + posicional + categorias
- `public/index.html` — botão `🔊 Áudios` + `<script src="audio-admin.js">`
- `public/app.js` — hooks de remotos/NPCs/objetos/carros usando os clips do banco; remover hardcoded URLs e ler de `audio_settings`
- `public/styles.css` — estilos do painel (segue padrão `users-admin-*`)

**Removidos depois:** os 7 `.asset.json` em `src/assets/sfx/` (passam a ser opcionais como "clips iniciais" que o admin pode importar ou substituir).

## 8. Fora do escopo desta fase

- Voz por microfone (proximity voice chat) — só sons pré-gravados.
- Tocar áudio do *próprio* jogador para si mesmo em 3D (continua não-posicional, mais agradável).
- UI de volume para o jogador final (continua sem por enquanto, como antes).

## Estimativa

Mudança grande: ~1 migration, 1 arquivo novo, 3 arquivos editados pesado. Posso quebrar em duas entregas se preferir: (A) painel + biblioteca + sala/objeto/carro no banco; (B) áudio 3D posicional + remotos/NPCs. Se aprovar, faço tudo numa entrega só.
