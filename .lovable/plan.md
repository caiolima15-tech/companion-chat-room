# Corrigir T-pose e pose residual nas interações

## Diagnóstico

No `enterSit` (`public/app.js:7366`):

1. **T-pose antes de carregar**: o código faz `fadeOut(0.2)` da ação atual e seta `entity.currentAction = null` imediatamente. Em seguida `await loadFbxClip(inter.animation_url)` baixa o FBX da rede. Durante esse intervalo (centenas de ms na primeira vez) **nenhuma ação está tocando no mixer** → o esqueleto volta para a bind pose (T-pose). Só depois do await é que a nova clipAction começa.

2. **Pose residual "deitado no chão"**: quando a animação é `LoopOnce` + `clampWhenFinished` (deitar), o personagem trava no último frame. Se o jogador entra rapidamente em outra interação OU se a primeira ação ainda está em fade-out quando a segunda começa, a `mixerAction` antiga não é parada (`.stop()`) — só `fadeOut`. O mixer continua avaliando o clip antigo com peso > 0 e a pose deitada "vaza" para a nova interação. Mesmo problema acontece quando o usuário sai da interação por movimento: `standUp` reseta `character.position/rotation`, mas se a `mixerAction` da interação ainda estiver com weight residual, o esqueleto volta a deitar no próximo frame.

3. **Pré-carregamento ausente**: o FBX só é baixado no momento do `E`. Mesmo com cache, a primeira interação por URL sempre passa pelo intervalo T-pose.

## Mudanças (todas em `public/app.js`, função de interações)

### 1. Pré-carregar o clip quando o prompt aparece
Em `showPromptForSit(inter)` disparar `loadFbxClip(inter.animation_url).catch(()=>{})` em background. Quando o jogador apertar E, o clip já está no `_animClipCache` e o await resolve no mesmo frame, sem T-pose.

### 2. Manter idle tocando até o novo clip estar pronto
Refatorar a sequência dentro de `enterSit`:

- NÃO chamar `fadeOut` da ação atual antes do await.
- Carregar o FBX, retargetar e só então: criar a nova `clipAction`, fazer crossfade (`oldAction.crossFadeTo(newAction, 0.25, false)` ou `fadeOut(0.2)` + `newAction.fadeIn(0.2)`) **no mesmo frame**.
- Se nenhuma `animation_url` (interação "manual"), manter idle como hoje, sem janela morta.

### 3. Parar de verdade a ação anterior de interação
Guardar referência `previousSitAction` e ao iniciar uma nova `enterSit` (ou em `standUp`) chamar:
```
prev.fadeOut(0.2);
setTimeout(() => { try { prev.stop(); mixer.uncacheAction(prev.getClip()); } catch {} }, 260);
```
Isso garante peso 0 e remove o clip do mixer — elimina o "vazamento" da pose deitada.

### 4. Reset robusto em `standUp`
Antes de iniciar idle, forçar `mixer.stopAllAction()` se `currentSit.mixerAction` existir, e só então `idle.reset().fadeIn(0.2).play()`. Resetar `character.position/rotation` **depois** do `stopAllAction`, não antes, para que o reset não seja sobrescrito pelo último frame do clip clamped.

### 5. Cancelamento da carga em curso
Adicionar um token (`currentSit.loadToken = Symbol()`) e comparar dentro do `.then` do `loadFbxClip` — se mudou, descartar o resultado. Hoje só compara `window.__sittingInteraction !== currentSit`, o que falha quando o jogador entra em outra interação do mesmo objeto.

### 6. Pré-carregar todos os clips do mapa ao entrar
Em `interactionsEnterRoom` (linha 7470), iterar todas as interações com `animation_url` única e disparar `loadFbxClip(url).catch(()=>{})` em paralelo (limitar a ~4 concorrentes). Custo de banda baixo, elimina T-pose para sempre depois do load inicial do mapa.

## Fora de escopo
- Não mexer em retargeting, tunings, presença/realtime, joystick, ou pose dos bots.
- Não tocar em `client.ts`, `types.ts`, `.env`, `styles.css`.

## Arquivos afetados
- `public/app.js` apenas (funções `enterSit`, `standUp`, `showPromptForSit`, `interactionsEnterRoom`).
