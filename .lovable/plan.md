
# Interações em objetos: sentar + animações por objeto

Hoje os objetos vivem em `map_assets` (GLBs posicionados pelo admin) e os personagens já têm `mixer` com clips (idle/walk/run/wave/dance/jump). Vou adicionar uma camada de **"interações"** anexada ao objeto: ao chegar perto, aparece um botão flutuante; ao clicar, o avatar trava na pose definida (sentar, encostar, etc.) em cima do objeto, com offset/rotação/altura ajustáveis pelo admin e salvos no banco.

## 1. Banco — nova tabela `map_asset_interactions`

Uma linha = um "ponto de interação" preso a um asset.

Campos:
- `id`, `asset_id` (FK lógica p/ `map_assets.id`), `map_id` (denormalizado p/ realtime/filtro rápido)
- `label` (texto do botão, ex: "Sentar", "Encostar", "Dançar aqui")
- `icon` (emoji curto, ex: "💺")
- `kind` (`sit` | `pose` | `animation`) — define comportamento padrão
- `animation_key` (`idle` | `sit` | `wave` | `dance` | `custom`) — qual clip rodar
- `animation_url` (opcional, FBX/GLB extra carregado por demanda — reaproveita o pipeline de `bot_animations`)
- `loop` (bool, default true)
- Pose-offset (relativa ao asset, em coords locais):
  - `offset_x`, `offset_y`, `offset_z`
  - `rotation_y` (graus)
  - `scale_mul` (default 1, raramente usado)
- `trigger_radius` (metros, default 1.5 — distância para o botão aparecer)
- `exit_radius` (default `trigger_radius + 0.5`)
- `occupancy` (`single` | `multi`) — se single, só 1 avatar por vez; vai usar canal de presença
- `created_by`, `created_at`, `updated_at`
- RLS: leitura para todos os autenticados, escrita só para admin (mesmo padrão de `map_assets`).

Sem migração extra de animação: adiciono `sit` ao enum de animações por slug do personagem reaproveitando `bot_animations` (admin cadastra URL de um FBX "sentado" e marca como `sit`) — ou usa o `animation_url` direto da interação se quiser uma animação única por objeto.

> Para `characters`, vou aproveitar a coluna já existente e cadastrar um `sit_url` opcional via migration adicional (pequena) ou via fallback: se o personagem não tiver clip de sentar, usa `animation_url` da própria interação (sempre tem fallback).

## 2. Pipeline 3D (`public/app.js`)

### Carregar interações
- `loadInteractions(currentMapId)` em `loadInitialAssets`; cache em `interactionsByAssetId`.
- Realtime: `postgres_changes` em `map_asset_interactions` filtrado por `map_id=currentMapId`.

### Detecção de proximidade
- No loop de animação, a cada ~150ms checar distância do avatar local até cada interação. Calcula posição mundial: `asset.matrixWorld * (offset)`.
- Se `dist < trigger_radius` → mostra o botão HTML flutuante daquela interação (3D→2D projetado, igual aos `plate` de nickname).
- Se já sentado e `kind===sit` → ignora outras interações até levantar.

### Botão flutuante
- HTML `<button class="interaction-prompt">{icon} {label}</button>` posicionado por `position:fixed` + projeção do `vector3.project(camera)`.
- Clique → entra no estado sentado (ver abaixo).
- Estilo: pílula glassmorphism roxa pequena, com leve flutuação/glow.

### Estado "sentado"
- Novo modo do player local: `sittingAt = { interactionId, assetId, animKey }`.
- Movimento WASD bloqueado enquanto sentado; aparece prompt "Levantar (E)" no mesmo botão.
- Calcula world-pose do offset e faz:
  - `entity.group.position.copy(worldPos)`
  - `entity.group.rotation.y = assetRotY + interactionRotY`
- Toca clip (`sit`/custom) em loop; se não houver, fica em `idle` parado.
- Broadcast via canal de presence: `{ sittingAt: interactionId, animKey }` — outros clients reproduzem a mesma pose no avatar remoto (sem rede de física, só "fixa no offset").

### Levantar
- `E` ou clique no botão "Levantar" → restaura controle, volta `idle`, dist mínima `> exit_radius` antes de re-trigger.

## 3. Painel admin (escondido em "Ferramentas")

Novo botão `🎯 Interações` na barra admin (junto com `📻 Rádio`, `💡 Luzes`, etc.), classe `admin-only`.

Abre `#interactionsAdminPanel` (mesmo estilo glass dos outros painéis), com 2 modos:

### Modo lista
- Lista interações da sala atual agrupadas por asset (nome do GLB).
- Cada linha: ícone, label, kind, botão "Editar", "Excluir", "Testar (Sentar aqui)".

### Modo edição (form)
- Seletor de asset:
  - Dropdown com `map_assets` da sala (mostra nome + thumbnail se houver).
  - OU "Selecionar no mundo" → entra em modo "clique no objeto"; raycast no canvas resolve o asset clicado.
- Campos:
  - Label, ícone, kind, animação (dropdown: idle/sit/wave/dance/custom + URL),
  - **Painel de ajuste em tempo real** com sliders/inputs numéricos:
    - `offset_x/y/z` (−3 a +3, step 0.05)
    - `rotation_y` (−180 a 180, step 5)
    - `trigger_radius` (0.5 a 5)
  - Toggle `loop`, `occupancy`.
- Enquanto edita, o avatar do admin **fica em pré-visualização sentado** no offset atual em tempo real (sem salvar). Mexer no slider move o avatar imediatamente — exatamente como o "Pose Debug" já faz para o offset do personagem.
- Botões: **Salvar**, **Cancelar**, **Excluir**.
- Salvar → `supabase.from("map_asset_interactions").upsert(...)`; realtime propaga.

## 4. Animações importadas para objetos / personagens

- O admin cadastra clips extras em `bot_animations` (já existe) ou cola URL direto no campo `animation_url` da interação.
- Loader: reaproveitar `loadCharacterAssets` / `FBXLoader` já presente. Adicionar helper `loadExternalClip(url)` com cache.
- Quando o avatar entra em interação com `animation_url`, baixa o FBX/GLB, extrai `AnimationClip`, faz `mixer.clipAction(clip).play()` (com retarget já existente em `SkeletonUtils`).

## 5. Arquivos afetados

- **Migration**: nova tabela `map_asset_interactions` + RLS + índice por `map_id`. Opcional: `ALTER TABLE characters ADD COLUMN sit_url text`.
- `public/index.html`: botão admin `🎯 Interações`, `#interactionsAdminPanel`, `#interactionPrompt` flutuante.
- `public/styles.css`: estilo do botão flutuante, painel admin, highlight do asset selecionado.
- `public/app.js`:
  - `loadInteractions()`, cache, realtime.
  - Loop de proximidade + projeção do botão.
  - Estado `sittingAt`, broadcast via presence, render remoto.
  - Raycaster "selecionar asset no mundo".
  - Painel admin CRUD + sliders em tempo real.
  - Helper `loadExternalClip` com cache.

## 6. Detalhes técnicos

- **Sincronização entre clients**: presence payload já existe; só adiciono `sittingAt` e `animKey`. Avatares remotos: se vier `sittingAt`, busca interação no cache, posiciona no offset e toca clip. Sem dead-reckoning de movimento enquanto sentado.
- **Performance**: checagem de proximidade só contra interações da sala atual (poucas), e apenas a 6–8 Hz. Botão só re-renderiza quando a interação ativa muda.
- **Conflito com múltiplos pontos próximos**: escolhe o mais próximo; se empate, o de menor `id`.
- **Occupancy=single**: usa o canal de presence pra ver se outro `sittingAt===id` já está ativo; bloqueia clique com tooltip "Ocupado".
- **Edge cases**: sair da sala / logout / trocar de sala → força `standUp()` e limpa estado; HUD do prompt some.

## 7. Fora de escopo (deixar pra depois)

- IK real para alinhar mãos/pés no objeto (vamos só posicionar o avatar; o ajuste fino fica nos sliders do admin).
- Animações de transição (entrar/sair da cadeira); por ora cross-fade simples de 0.2s entre idle ↔ sit.
- Interações multi-usuário coordenadas (ex: dois sentando no mesmo sofá em slots diferentes) — possível adicionar depois com `slot_index` na tabela.
