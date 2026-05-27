
## 1. Não mostrar nenhum mapa antes de entrar na sala

Hoje `buildMap()` chama `loadEnvironment(currentMapId)` na linha 2051, então o "Bar" (ou o último `localStorage.neon-tap-room-map`) começa a carregar logo no boot e fica visível atrás da tela de login/seleção.

Mudanças em `public/app.js`:
- Remover a chamada `loadEnvironment(currentMapId)` de `buildMap()`. O cenário só começa a carregar dentro de `enterRoom()` / `switchRoom()`.
- Adicionar uma classe `pre-world` no `<body>` enquanto o usuário ainda não entrou. CSS esconde o `#scene` (canvas), `#hud`, rádio, etc., deixando só a UI de overlays (auth, seleção de personagem, seleção de mapa).
- `enterRoom()` remove `pre-world` só depois que `loadEnvironment` resolve, garantindo que o mundo apareça pronto.

Resultado: ao logar não aparece nenhum cenário de fundo; o usuário vai direto para "escolher personagem → escolher sala → carregar → entrar".

## 2. Excluir mapas de verdade (builtins inclusos)

Hoje, quando o admin "exclui" um builtin (Bar, Bar Antigo, Milk Bar, etc.), o código só insere `hidden=true` em `custom_maps`. Mesmo assim, `currentMapId` no `localStorage` pode continuar apontando para `"bar"`, e `loadEnvironment("bar")` ainda carrega a GLB builtin (`/assets/maps/bar.glb`).

Mudanças em `public/app.js`:
- `loadCustomMaps()`: depois de calcular `hiddenBuiltins` e `MAPS`, se `currentMapId` não estiver mais em `MAPS`, limpar `localStorage.neon-tap-room-map` e setar `currentMapId = MAPS[0]?.id || null`.
- `loadEnvironment(mapId)`: se `MAPS.find(m=>m.id===mapId)` não existir (mapa foi excluído), abortar sem chamar `loader.load`, e em vez de cair no fallback `"bar"`, voltar para o `MAPS[0]` disponível (ou nenhum, se a lista estiver vazia).
- O delete continua marcando builtin como `hidden=true` (não dá pra apagar uma linha que não existe), MAS na UI ele some 100%: do menu, do default de boot e do `currentMapId`. Para o usuário é "excluído de verdade".
- Bônus: ao excluir builtin, também apagar `map_thumbnails`, `map_transforms`, `map_lights`, `map_radios`, `map_assets`, `map_bots`, `map_asset_interactions` daquele `map_id` (cleanup completo dos registros associados). Para non-builtins, mesma limpeza antes do `delete from custom_maps`.

## 3. Barra de progresso real (sem orb)

Hoje `#worldLoadingOverlay` mostra um orb animado sem percentual, e o `hideWorldLoading` espera 250ms.

Mudanças:
- `public/index.html`: substituir o bloco `.world-loading-orb` por uma barra: `<div class="world-loading-bar"><div class="world-loading-bar-fill" id="worldLoadingBarFill"></div></div>` mais um `<span id="worldLoadingPercent">0%</span>`.
- `public/styles.css`: estilos da barra (trilho escuro, fill com gradiente, transição `width 200ms`).
- `public/app.js` em `setupWorldLoading`:
  - Adicionar `window.setWorldLoadingProgress(loaded, total)` que atualiza largura do fill e o `%`.
  - Reset para 0% em cada `showWorldLoading`.
- Usar um `THREE.LoadingManager` único compartilhado pelo `loader` (GLTF) e pelo `FBXLoader` durante o boot/entrada. O manager tem `onProgress(url, loaded, total)` que será encaminhado para `setWorldLoadingProgress`. `enterRoom()` e `switchRoom()` ligam o manager antes do `Promise.all` e desligam depois.
- Para transições de tela (escolher mapa → trocar sala), a mesma barra é reutilizada com label "Trocando de sala…".

## 4. Carregando o mundo nunca sumindo / mapa não aparece

Causa provável: hoje `loadEnvironment` é disparado **duas vezes** na primeira entrada — uma vez em `buildMap()` (linha 2051) e outra em `enterRoom()`. As duas concorrem em `clearEnvironment()` e `currentEnvRoot`, e se o primeiro `loader.load` termina depois do segundo, o cenário fica num estado inconsistente e a promise que `enterRoom` espera pode ficar pendurada se o segundo `assetsPromise` ainda estiver in-flight.

Mudanças:
- Item 1 já remove a chamada duplicada de `buildMap()`.
- `loadEnvironment` ganha guarda de concorrência: variável `__envLoadToken` incrementada a cada chamada; callbacks só aplicam resultado se ainda forem o token atual. Caso contrário, só resolvem.
- Branch de erro em `loadEnvironment` (linha 2174-2178) tem bug: chama `loadEnvironment("bar").then(resolve)` mas `resolve` é do escopo do `new Promise` interno — funciona, mas se "bar" também falhar entra em loop. Trocar por: se `MAPS[0]` existir e for diferente, tentar uma única vez; senão `resolve()` direto (sem cenário, ainda valida o `enterRoom`).
- Garantir que `hideWorldLoading()` é chamado mesmo se `loadEnvironment` lançar (já está em `finally` no `enterRoom`, mas conferir o `switchRoom` em ~1748 — falta `try/finally` igual).

Resultado: a barra carrega até 100% e some; o cenário aparece pronto.

## 5. Thumbnail de mapa por upload de imagem

Já existe a tabela `map_thumbnails (map_id, thumb_url)` e o bucket público `map-assets`. Hoje só usamos o campo `thumb` (emoji) em `custom_maps`.

Mudanças:
- `public/app.js`, no modal de `openMapEdit`:
  - Adicionar um bloco "Thumbnail (imagem)" com `<input type="file" accept="image/*">` mais preview da imagem atual e botão "Remover imagem".
  - Ao salvar com arquivo: upload em `map-assets/thumbs/{slug}-{ts}.{ext}`, pegar `getPublicUrl`, `upsert` em `map_thumbnails` por `map_id = slug`. Ao remover: `delete from map_thumbnails where map_id = slug` (sem mexer no Storage para não quebrar caches).
- `loadCustomMaps()`: também buscar `map_thumbnails` e juntar `thumbUrl` em cada item de `MAPS`.
- `renderMapTiles()`: se `m.thumbUrl` existir, renderizar `<img src=...>` no `.char-tile-thumb` em vez do emoji. Caso contrário, manter o emoji `m.thumb` como fallback.
- Modal "criar novo mapa" ganha o mesmo campo opcional (idêntico fluxo).

## Resumo dos arquivos afetados

- `public/app.js`:
  - Remover `loadEnvironment` do boot inicial.
  - Adicionar classe `pre-world` no body e remover após `enterRoom`.
  - `loadCustomMaps`: limpar `currentMapId` se mapa sumiu; juntar `thumbUrl` de `map_thumbnails`.
  - `openMapEdit` / criar mapa: campo de upload de thumbnail.
  - Delete completo: cascata em todas as tabelas `map_*` ligadas ao `map_id`.
  - `loadEnvironment`: token de concorrência, fallback seguro sem loop.
  - `switchRoom`: envolver em `try/finally` para garantir `hideWorldLoading`.
  - `setupWorldLoading`: `setWorldLoadingProgress`, integração com `THREE.LoadingManager`.
  - `renderMapTiles`: usar `<img>` quando houver `thumbUrl`.
- `public/index.html`: substituir orb por barra de progresso + `%`.
- `public/styles.css`: estilos da barra + regra `body.pre-world #scene, body.pre-world #hud, body.pre-world #radioHud { display: none }`.

Sem migrations: `map_thumbnails` já existe.
