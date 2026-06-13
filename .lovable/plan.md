# Correções de animação dos NPCs + base de história

## Problema raiz das animações
A biblioteca de animações (`npc_animations`) está com arquivos **.fbx** (Idle, Walk, Talk do Mixamo), mas o código tenta carregar tudo com `GLTFLoader`. O `GLTFLoader` não consegue ler `.fbx`, então `animLib` fica **vazia**, e o NPC só toca a animação embutida no próprio `.glb` do modelo — que muitas vezes é só um idle. Por isso "nenhuma animação funciona" e os NPCs parecem teleportar sem walk.

Os NPCs **estão** se movendo (confirmado em `npc_state`: posições e status mudando a cada tick), mas sem a clip `walk` na biblioteca o `pickAnimClip` cai no fallback idle.

## Mudanças

### 1. Carregar FBX corretamente (`public/npc.js`)
- Adicionar `FBXLoader` (CDN `three/examples/jsm/loaders/FBXLoader.js`) junto do `GLTFLoader` existente.
- Em `loadAnimationLibrary`: detectar extensão do `model_url` (`.fbx` vs `.glb/.gltf`) e usar o loader certo.
- Ao extrair o clip do FBX, normalizar nomes de tracks Mixamo: remover prefixo `mixamorig` se o modelo destino não tiver esse prefixo (e vice-versa) para retargeting básico por nome de bone.
- Suportar variante por gênero: quando há `idle` male e female, `pickAnimClip` escolhe pela `ent.gender`.

### 2. Aplicar clip da lib com retarget seguro
- Em `pickAnimClip`: clonar o clip (`clip.clone()`) antes de criar a action, e remapear nomes de tracks para casar com bones do modelo destino (heurística simples: igualar prefixo Mixamo).
- Garantir que ao trocar para `walk`, a action faça `setLoop(LoopRepeat)` e `clampWhenFinished = false`.

### 3. UI: base de história (backstory) no painel de edição do NPC
- Na aba **Spawn** (lista de NPCs), por NPC:
  - `<textarea>` "Base da história" (até 2000 chars) lendo/gravando `npc_instances.backstory`.
  - Botão "📄 Subir .txt" que lê arquivo local (`input type=file accept=".txt"`) e preenche o textarea.
  - Botão "Salvar história".
- Quando o admin grava manualmente, o `npc-chat` já respeita (não regenera, pois `backstory` deixa de ser nulo).

### 4. Pequenos ajustes
- Aumentar lerp de posição (linha 115) de `dt * 4` para `dt * 8` para acompanhar o tick do servidor com menos atraso visual.
- Log curto no console quando uma clip da lib é aplicada com sucesso (debug).

## Arquivos
- `public/npc.js` — loader FBX, retarget, seleção por gênero, UI backstory, lerp.
- Nenhuma migração nova (coluna `backstory` já existe).
- Nenhuma alteração em `npc-chat` nem `npc-tick`.

## Observação
Os arquivos atuais são Mixamo, então o retarget por nome de bone funciona para qualquer modelo que também siga o esqueleto Mixamo (caso comum). Modelos com esqueleto totalmente custom continuarão tocando só o idle deles — isso é limitação dos próprios assets, não do código.