## Escopo

Integrar os packs `movimentacao_pistola.zip` (20 clips) e `movimentacao_rifle.zip` (49 clips), os modelos `ak47_psx.glb` e `pistola_9mm.glb`, e os áudios `recargarifle.mp3` / `efeitosonororecargarifle.mp3` ao sistema de armas existente — de forma que a locomoção do jogador troque automaticamente para as animações de arma quando um rifle ou pistola estiver equipado.

## Entregas

### 1. Upload dos assets ao CDN
- 20 FBX de pistola → `public/anims/pistol/*.fbx.asset.json`
- 49 FBX de rifle → `public/anims/rifle/*.fbx.asset.json`
- 2 GLB de armas → `public/models/weapons/*.glb.asset.json`
- 2 MP3 de recarga → registrados em `audio_clips` (categoria `weapons`)

### 2. Novo módulo `public/weapon-animation.js`
- **Loader lazy**: baixa cada FBX na primeira vez que é necessário e cacheia o `AnimationClip` (Map por url).
- **Overlay de locomoção**: quando `equippedSlug !== null`, intercepta o `playPlayerAnimation`/loop de idle-walk-run do `app.js` e troca a AnimationAction do jogador local pela correspondente do pack (idle, walk fwd/back/left/right, run, sprint, jump up/loop/down, strafe).
- **Blend/crossfade** de 0.15 s entre estados; volta ao idle quando parado.
- **Direção**: usa `moveDir` (vetor) já usado no `app.js` para escolher entre walk_forward/backward/left/right (rifle) ou walk/strafe (pistola).
- **Retarget**: usa `SkeletonUtils.retargetClip` (já presente em `public/vendor/utils/`) para adaptar os clips Mixamo ao esqueleto do avatar do jogador.

### 3. Attach do modelo da arma à mão
- Substitui a "box" atual em `weapons.js` por um GLB carregado do `weapon.model_url`.
- Faz parent no bone `mixamorigRightHand` (ou fallback `RightHand`) com offset/rot configuráveis por arma.
- Ao desequipar, remove e cancela overlay de anim.

### 4. Ciclo de tiro/recarga com anim
- `fire()` → toca `pistol shoot` (usaremos `pistol idle` como base + kick manual já que não veio anim de tiro no pack; para rifle, um recuo curto no braço).
- `reload()` → toca clip `recargarifle.mp3` (rifle) e um som curto para pistola (fallback existente).
- Bloqueia locomoção-overlay durante a janela de recarga.

### 5. Banco de dados
Migration que:
- Adiciona colunas `weapons.anim_pack` (`'pistol'|'rifle'|null`), `weapons.hand_offset` (jsonb), `weapons.hand_bone` (text, default `mixamorigRightHand`).
- Faz UPSERT de duas armas: `pistol_9mm` (slot 2, pack=pistol) e `ak47` (slot 3, pack=rifle) já com `model_url`, `icon_url` opcional, `sfx_reload` apontando para os `audio_clips` criados.
- Insere `audio_clips` para os 2 mp3 de recarga.

### 6. Painel admin
- Novo select no `weapons-admin.js`: **Pack de animação** (`nenhum | pistol | rifle`).
- Campo **Bone da mão** e **Offset (x/y/z + rot)** — assim você calibra a posição visual da arma sem editar código.

## Detalhes técnicos

- FBXs são grandes (~19 MB rifle pack, ~7 MB pistol pack). O loader carrega **sob demanda** — só quando o jogador equipa a arma pela primeira vez.
- Cache global em `window.__weaponClipCache`; um único `FBXLoader` reutilizado.
- Se o avatar do jogador não tiver bones Mixamo compatíveis, cai no comportamento anterior (locomoção padrão + arma na mão fixa).
- Sem quebrar o sistema atual de emotes/dance: overlay só ativa quando `equippedSlug` está setado.

## Fora do escopo agora (posso adicionar depois se pedir)
- Death animations (5 clips do pack rifle) — hoje NPCs só somem.
- Crouching / aiming pose (tem clips prontos, mas exigem novo botão/tecla).
- Blend tree 8-direções com pesos — vou usar seleção discreta por direção para performance mobile.

## Confirmação
Se ok, executo tudo. Se quiser recortar (ex.: só rifle, ou pular retarget e usar avatar padrão), me diga antes que eu suba os ~70 FBX ao CDN.