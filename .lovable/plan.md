# Migrar para GLB + biblioteca de animações compartilhada

## Objetivo

- Trocar todos os personagens de FBX para GLB (arquivos bem menores).
- Usar **uma única biblioteca de animações em GLB sem skin** (só esqueleto + clips), compartilhada por todos os personagens.
- Cada personagem carrega apenas o próprio mesh; as animações vêm da biblioteca comum.

## Como vai funcionar

1. Você sobe os GLBs dos personagens (mesh + rig, sem precisar de animação embutida) e atualiza `base_url` no banco apontando para o `.glb`.
2. Você sobe um conjunto fixo de GLBs de animação em `public/assets/animations/`:
   - `idle.glb`
   - `walk.glb`
   - `run.glb`
   - `jump.glb`
   - `dance.glb`
   - `wave.glb`
   
   Cada arquivo tem só o esqueleto animado (export "skeleton only" do Mixamo/Blender, sem mesh).
3. Ao carregar um personagem, o app:
   - Carrega o GLB base.
   - Para cada slot de animação, usa o GLB da biblioteca compartilhada como fonte.
   - Se o personagem tiver um `*_url` específico no banco, esse tem prioridade (override).
   - Se o GLB base já tiver animação embutida com o nome do slot, também tem prioridade.

## Mudanças técnicas

Arquivo: `public/app.js`

- **Nova constante** `SHARED_ANIM_LIBRARY` com os slots → `/assets/animations/<slot>.glb`.
- **`loadCharacterAssets()`**: depois de carregar o `base`, para cada slot em `["idle","walk","run","jump","dance","wave"]`:
  1. Se `base.animations` já tem clip com o nome do slot → usa.
  2. Senão, se `character[slot+"_url"]` está definido → carrega esse.
  3. Senão → carrega `SHARED_ANIM_LIBRARY[slot]` (cacheado entre personagens).
- **Cache de clips compartilhados**: um `Map<url, Promise<AnimationClip>>` para que cada GLB de animação seja baixado uma única vez por sessão, independente de quantos personagens entrarem na cena.
- **Retargeting mais robusto**: trocar o atual `retargetClipToBones` (rename só) por `SkeletonUtils.retargetClip` (já existe em `public/vendor/utils/SkeletonUtils.js`), que faz bake de pose por frame e resolve diferenças de bind pose / escala entre esqueletos. Mantém o rename de `mixamorig:` como pré-passo.
- **Remover** o caminho `borrow_animations` (catálogo emprestando de outros personagens) e a entrada hardcoded `test-glb` em `loadCharactersCatalog`, já que a biblioteca compartilhada cobre o caso.
- **Manter** o suporte a FBX como fallback para `*_url` legados (mas o caminho principal será GLB).

## O que você precisa subir

- GLBs novos dos personagens em `public/assets/characters/` (ou via Cloud Storage, atualizando `base_url`).
- 6 GLBs de animação em `public/assets/animations/` com os nomes acima. Pode ser o mesmo rig Mixamo exportado como GLB "skeleton only".

Depois disso, posso atualizar as linhas do banco para apontar `base_url` para os novos `.glb` e limpar os `*_url` antigos (deixando a biblioteca compartilhada cuidar).
