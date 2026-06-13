# Plano: NPCs mais vivos (voz, animações, rotas, interações)

## 1. Visual: tirar nameplate, prompt sutil

- Remover o `Sprite` com o nome acima da cabeça do NPC (em `public/npc.js > spawnNpc`).
- Trocar o prompt atual "Pressione E para conversar" por um label pequeno e cinza claro **`(E) interagir`** com:
  - Fonte 12px, opacidade ~0.7, sem borda/glow.
  - Só aparece quando o jogador está **bem perto** (raio reduzido de 2.5m → **1.6m**).
  - Suave fade-in/out (150ms).

## 2. Gênero do NPC + 6 vozes sorteadas

- **Schema**: adicionar coluna `gender text check (gender in ('male','female','neutral')) default 'neutral'` em `npc_models`. No painel admin, dropdown obrigatório ao subir o GLB.
- **Pool de vozes** (ElevenLabs, escolhidas da lista oficial):
  - Masculinas: George (`JBFqnCBsd6RMkjVDRZzb`), Liam (`TX3LPaxmHKxFdv7VOQHJ`), Brian (`nPczCjzI2devNBz1zQrb`).
  - Femininas: Sarah (`EXAVITQu4vr4xnSDxMaL`), Laura (`FGY2WhTYpPnrIDTdsKH5`), Alice (`Xb7hH8MSUJpSbSDYk0k2`).
- Ao spawnar um NPC sem `voice_id` definido, escolhe **determinístico por hash do `npc_instances.id`** dentro do pool do gênero (mesmo NPC sempre tem a mesma voz, mas distribuído).
- A edge `npc-chat` retorna esse `voice_id` resolvido para o front (já faz; só usar a lógica acima).

## 3. Voz do jogador: VAD + STT (ElevenLabs Scribe Realtime)

- Quando o jogador entra no raio do NPC, o `npc.js` abre uma sessão STT em background usando `@elevenlabs/react`? Não — `npc.js` é vanilla. Vou usar **WebSocket direto pro `scribe_v2_realtime`** com token gerado por uma nova edge function `npc-stt-token` (single-use token, mesma rotina do connector).
- Microfone com `getUserMedia` + `AudioWorklet` enviando PCM 16kHz, `commitStrategy: vad`.
- Quando o servidor manda `committed_transcript`, dispara o mesmo fluxo de chat (`npc-chat` → `npc-tts`) automaticamente — sem precisar digitar.
- Botão UI: 🎤 no canto inferior central só quando há NPC próximo. Clicar liga/desliga; se ligado, escuta passiva por VAD.
- Se nenhuma fala for detectada por **~25s**, NPC se despede ("Foi bom conversar, até mais!") + animação `wave` + sai andando pela rota (volta a `status='walking'`). Implementado em `npc-tick` checando `last_user_msg_at` em `npc_conversations`.

## 4. Animações: dual source (embutidas + GLBs avulsos)

- Nova tabela `npc_animations`:
  - `slug` (idle, walk, talk, sit, wave, point, social_a, social_b, social_c)
  - `model_url` (GLB com 1 clipe), `gender` (male|female|any), `created_by`.
- Bucket `characters` já existe; subir lá em `npcs/anims/`.
- **Resolução em runtime** (no `npc.js`):
  1. Se o GLB do personagem tem um clipe com nome compatível (regex `idle|walk|talk|sit|wave`), usa ele.
  2. Senão, carrega o GLB genérico mais próximo do gênero e aplica via `SkeletonUtils.retargetClip` (já temos `vendor/utils/SkeletonUtils.js`).
- Aba nova no painel admin: **Animações** — upload + lista + preview.

### Triggers de animação
- `idle` → parado em waypoint/aguardando.
- `walk` → movendo.
- `talk` → SOMENTE durante a fala (recebe evento do TTS: começa ao tocar áudio, para no `ended`). Combina com `lookAt(player)` (rotaciona `group` suave pro jogador) enquanto a conversa está ativa.
- `sit` → ao chegar em `is_sit_spot`.
- `wave` → ao se despedir.
- `social_*` → conversa NPC-NPC (ver §6).

## 5. Editor de rotas visual (drag & drop)

Nova aba **Rotas** no painel admin com modo "Editar":
- Ao entrar no modo, intercepta clique no chão (raycast no mesh `ground` que o `app.js` expõe).
  - **Clique simples** → adiciona waypoint no fim da rota selecionada (`npc_waypoints` insert).
  - **Clique num waypoint existente** → seleciona; aparece HUD com: Mover (drag), 🚸 travessia, 💬 talk_spot, 🪑 sit_spot, ⏱ pausa(ms), 🗑.
  - **Arrastar waypoint** → atualiza `x,z` no `npc_waypoints` via debounce 250ms.
- Renderiza no mundo:
  - Esfera colorida por tipo em cada waypoint (cinza=normal, amarelo=travessia, azul=talk, verde=sit).
  - Linha tracejada (`THREE.Line` com `LineDashedMaterial`) ligando seq → seq+1, e seq_final → seq_0 se `loop_back`.
- Botões: **+ Nova rota**, **Atribuir rota a NPC** (dropdown).
- Tudo client-side via supabase + realtime, sem edge function nova.

## 6. NPC-NPC: encontros sociais (sem texto, sem voz)

- Em `npc-tick`, quando dois NPCs em `status='walking'` ficam a <2m um do outro e ambos rolam `random() < 0.15`:
  - Ambos viram-se um pro outro, entram em `status='socializing'`, anim alterna entre `social_a`/`social_b`/`social_c` a cada 3-6s.
  - `next_decision_at = now + (60-180s)`. Ao expirar, voltam ao caminho.
- Adicionar `'socializing'` aos status válidos. Zero custo de IA/voz (só anim + posição).
- Se um jogador interage com um deles → quebra o social e prioriza o jogador.

## 7. Sentar / usar interações próximas

- Já há `map_asset_interactions` (com tipos). Em `npc-tick`, quando NPC entra em `status='idle'` e não tem próximo waypoint urgente, com prob. 20%:
  - Busca interações dentro de 8m com `type in ('bench','chair','seat')` livres (sem outro NPC ocupando — guardar `occupied_by_npc` em estado local).
  - Cria waypoint temporário até ela, marca `is_sit_spot=true`, ao chegar entra em `sit` por 20-60s.

---

## Mudanças técnicas / arquivos

### Banco (1 migração)
1. `alter table npc_models add column gender text check (...) default 'neutral'`.
2. `create table npc_animations(...)` + GRANT + RLS (admin write, public read).
3. `alter table npc_state` — adicionar `'socializing'` como status válido (drop/add check).
4. `alter table npc_conversations add column last_user_msg_at timestamptz default now()` (pro auto-despedida).
5. Função `pick_voice_for_npc(npc_id, gender)` — opcional, pode ser client-side.

### Edge functions
- **Nova `npc-stt-token`**: gera single-use token do Scribe Realtime usando `ELEVENLABS_API_KEY`.
- **`npc-tick`**: adicionar lógica de social NPC-NPC, auto-sit, auto-goodbye por inatividade.
- **`npc-chat`**: usar pool de vozes por gênero quando `voice_id` ausente; gravar `last_user_msg_at`.

### Frontend (`public/npc.js`)
- Remover sprite-nameplate.
- Reduzir raio de detecção + novo prompt cinza `(E) interagir`.
- Sistema de animação dual-source + retargeting.
- Cliente STT WebSocket (push-to-talk inicial, depois VAD).
- Hook `talk` anim + `lookAt` durante TTS.
- Editor visual de rotas (drag).
- Aba "Animações" no admin.

### Storage
- Reusar bucket `characters` (já público). Pastas `npcs/`, `npcs/anims/`.

---

## Ordem de implementação (commits sugeridos)

1. Migração de schema (gender, npc_animations, status, last_user_msg_at).
2. Visual: remove nameplate + prompt cinza + raio menor.
3. Pool de vozes por gênero.
4. Editor de rotas drag&drop.
5. Upload + retargeting de animações.
6. Talk anim + lookAt durante TTS.
7. STT (push-to-talk → VAD).
8. NPC-NPC social + auto-sit + auto-goodbye.

## Riscos / pontos de atenção
- **Retargeting GLB**: depende dos esqueletos serem compatíveis (Mixamo-style funciona bem; se você usar modelos exóticos pode falhar — fallback é só usar idle estático).
- **STT custa créditos ElevenLabs**: VAD permanente perto de NPC pode estourar. Vou começar com push-to-talk segurando V e oferecer toggle "modo VAD" depois.
- **Realtime de waypoints durante drag**: vou debounce + otimistic local pra não floodear DB.
