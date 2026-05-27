## 1. Alcance visível (skybox preto)

Hoje em `public/app.js`:
- `camera = new THREE.PerspectiveCamera(45, 1, 0.1, 90)` — far plane corta tudo a 90 m.
- `scene.fog = new THREE.Fog("#0e1117", 16, 36)` — neblina escurece o skybox antes mesmo de chegar no far.
- `controls.maxDistance = 11` — limita o quanto o usuário pode afastar a câmera.

Mudanças:
- Aumentar `camera.far` para `2000` e chamar `camera.updateProjectionMatrix()`.
- Remover a `Fog` padrão (já existe lógica em `applyLightingForMood` que zera fog em vários moods; vou deixar `scene.fog = null` por padrão e só ativar fog quando o mood explicitamente pedir, com `far` muito maior — ex.: `200`).
- O `maxDistance` do orbit fica controlado pelo item 2 (não mais hardcoded em 11).

Resultado: o skybox carregado pelo admin aparece de ponta a ponta.

## 2. Paredes não somem mais + zoom respeita teto

Hoje:
- `updateCameraOcclusion()` (linha ~2279) deixa qualquer parede entre câmera e jogador transparente.
- `ceilingCutoff = 2.8` em `loadEnvironment` esconde qualquer mesh cuja base esteja acima de 2.8 m — efetivamente apagando tetos.

Mudanças:
- Desligar o fade de paredes: `updateCameraOcclusion()` vira no-op (mantém função para não quebrar chamada no loop, mas só faz `return;`). Sem mais clone de material/`opacity = 0`.
- Remover o `ceilingCutoff`: tetos ficam visíveis e viram colisores normais (`registerCollidable` já cobre).
- Restringir zoom da câmera ao interior do recinto: novo helper `clampCameraToCeiling()` chamado a cada frame após `controls.update()`. Faz um raycast de `controls.target` para cima; se acertar um colisor a uma altura `h`, define `controls.maxDistance` dinamicamente de forma que `camera.position.y` nunca ultrapasse `h - 0.3`. Quando não há teto (ar livre), `maxDistance` volta para um valor amplo (ex.: 60) para permitir afastar bastante. Isso resolve "zoom out não consegue afastar dentro do estabelecimento com teto" porque o limite passa a ser geométrico, não um número fixo.

## 3. Painel "🎯 Interações" não minimiza

O HTML já tem `data-panel-min`, `.panel-head` e `.panel-body`, mas `setupFloatingPanels()` em `public/app.js` (~linha 4619) não registra esse painel — só registra `botsAdminPanel`, `mapAdminPanel`, `lightsAdminPanel` e `layersPanel`.

Mudança: adicionar `makePanel(document.getElementById("interactionsAdminPanel"))` ao final do bloco. Como o painel já segue a convenção `.panel-head` / `.panel-body` / `[data-panel-min]` / `[data-panel-close]`, basta isso para drag + minimizar + fechar funcionarem.

Bônus: faço o mesmo para o `radioAdminPanel` (mesma estrutura — também não está registrado).

## 4. Carregar mapa antes de aparecer dentro

Hoje `enterRoom()` faz:

```text
await Promise.all([loadInitialAssets(), loadInitialChat()]);
await connectRealtime();
await radioEnterRoom / interactionsEnterRoom
hideWorldLoading()
```

Problema: `loadInitialAssets()` chama `renderAssets()`, que dispara `loader.load(...)` para cada GLB **sem await** — resolve imediato e a tela mostra o jogador no vazio enquanto os GLBs ainda baixam. `loadEnvironment(mapId)` também é fire-and-forget.

Mudanças:
- `loadEnvironment(mapId)` vira `async` e retorna uma `Promise` que só resolve quando o `GLTFLoader.load` chama o callback de sucesso/erro (envolver em `new Promise`).
- `renderAssets()` retorna `Promise.all(pendingLoads)` — cada `loader.load` vira uma promise que resolve no sucesso ou no fallback.
- `loadInitialAssets()` passa a aguardar `loadEnvironment(currentMapId)` E `renderAssets(...)`.
- `enterRoom()` e `switchRoom()` aguardam tudo antes de chamar `hideWorldLoading()`. A overlay roxa "Carregando o mundo" só some quando o cenário + GLBs estão prontos. A aba do navegador (favicon/spinner do browser) também para de girar porque não há mais fetches pendentes no momento em que o jogador entra.

## 5. Onde subir animações (sentar / em pé / etc.)

Isso é orientação, não mudança de código. As animações FBX vivem na tabela `bot_animations` e são gerenciadas pelo painel **🤖 Bots** (admin) → seção **"📚 Biblioteca de animações FBX"** → botão de upload. Cada FBX vira uma URL pública no Storage.

Depois, no painel **🎯 Interações** (admin), no campo **"Animação (URL FBX)"** da interação, você cola a URL do FBX da biblioteca (ou deixa em branco para usar `idle`). O mesmo FBX serve para sentar, deitar, encostar, dançar — o que diferencia é a categoria escolhida na interação e o offset/rotação que você ajusta nos sliders.

Fluxo: subir 1x no painel Bots → reutilizar a URL em quantas interações (e objetos) quiser.

## Arquivos afetados

- `public/app.js`:
  - Ajustar `camera.far`, remover/relaxar `scene.fog`, novo `clampCameraToCeiling()` no loop.
  - Neutralizar `updateCameraOcclusion()` e remover `ceilingCutoff` em `loadEnvironment`.
  - Registrar `interactionsAdminPanel` (e `radioAdminPanel`) em `setupFloatingPanels()`.
  - Tornar `loadEnvironment` e `renderAssets` aguardáveis; `enterRoom`/`switchRoom` esperam terminar antes de `hideWorldLoading`.

Sem alterações em HTML, CSS ou banco.
