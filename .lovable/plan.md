## Objetivo

Adicionar uma camada de áudio no jogo para deixá-lo mais vivo, com ambiente urbano em loop e efeitos sonoros pontuais para personagem e veículo.

## Sons que serão incluídos

| Evento | Tipo | Comportamento |
|---|---|---|
| Ambiente da cidade | loop contínuo | Inicia ao entrar no mundo, baixinho (~0.25 vol) |
| Passo andando | one-shot | A cada N passos enquanto anda |
| Passo correndo | one-shot | Mais rápido / mais grave, enquanto corre |
| Entrar no carro | one-shot | Bater de porta + ignição leve, ao chamar `enterCar` |
| Acelerar | loop modulado | Liga quando `throttle > 0`, volume/pitch sobem com `state.vel` |
| Freio | one-shot | Dispara quando o jogador segura freio ou faz curva fechada (steer alto + vel) |
| Batida | one-shot | Dispara quando uma tentativa de movimento do carro é bloqueada por colisor |

Sem música, sem controle de volume visível por enquanto (conforme escolhido).

## Origem dos arquivos

Vou usar clipes royalty-free curtos do Pixabay (licença permissiva, sem atribuição) baixados durante a build e re-hospedados como Lovable Assets (`.asset.json`) para termos URLs estáveis e cache de CDN. Nada de chamadas externas em runtime.

Lista provisória (todos < 200 KB, mp3):
- city_ambience.mp3 (loop ~30s)
- footstep_walk.mp3, footstep_run.mp3
- car_enter.mp3, car_accel_loop.mp3, car_brake.mp3, car_crash.mp3

## Implementação técnica

1. **Novo módulo `public/audio.js`** carregado no `index.html` depois do `app.js`.
   - `AudioManager` simples baseado em `HTMLAudioElement` (pool de instâncias para one-shots, evita "audio cortado") e um `Audio` dedicado para o loop de ambiente e o loop de aceleração.
   - API exposta em `window.GameAudio`:
     - `playOnce(name, { volume })`
     - `startLoop(name, { volume })` / `stopLoop(name)`
     - `setEngine(throttle, speed)` ajusta volume/playbackRate do loop de motor
     - `unlock()` chamado no primeiro clique/tecla (política de autoplay dos navegadores)

2. **Ambiente urbano**
   - Inicia o loop em volume baixo quando `body.classList.contains('world-ready')` (já existe, observado por MutationObserver, mesmo padrão do `room-mobile.js`).
   - Pausa quando sair do mundo.

3. **Passos**
   - Em `public/app.js`, dentro do tick que atualiza animações dos players locais (já tem `setPlayerAction(... 'walk' | 'run')`), adicionar um contador de tempo: a cada `walkInterval` (≈ 420ms) ou `runInterval` (≈ 260ms) tocar o respectivo passo, apenas para o jogador local (`entity.player?.id === myId`).

4. **Veículo** (em `public/app.js`, no bloco do controlador iniciando em ~10087):
   - `enterCar(c)` → `playOnce('car_enter')` e `startLoop('car_accel_loop', { volume: 0 })`.
   - `exitCar` → `stopLoop('car_accel_loop')`.
   - No tick de física do carro (~10278): chamar `GameAudio.setEngine(inp.throttle, c.state.vel)`. Volume = `clamp(|vel|/maxVel, 0, 0.6)`, playbackRate = `0.8 + 0.7 * |vel|/maxVel`.
   - Freio: quando `inp.brake` passar de 0→1 **e** `|vel| > limiar`, `playOnce('car_brake')`. Curva fechada (mesmo som): quando `|steer| > 0.7 && |vel| > 0.5 * maxVel`, com cooldown de 600ms.
   - Batida: já existe a verificação de colisão antes de aplicar o passo do carro; quando o movimento é rejeitado e `|vel| > limiar`, `playOnce('car_crash')` com cooldown de 400ms.

5. **Autoplay**
   - `audio.js` escuta o primeiro `pointerdown`/`keydown` no documento e chama `unlock()` que dá `play().catch()` em um `Audio` silencioso para destravar o contexto antes do ambiente começar.

## Arquivos tocados

- **Novo**: `public/audio.js`, `src/assets/sfx/*.mp3.asset.json` (7 ponteiros gerados pelo `lovable-assets`).
- **Editado**: `public/index.html` (1 `<script src="audio.js">`), `public/app.js` (hooks de passo, enterCar, tick do carro, colisão do carro).

Nada de mudanças no backend, schema, ou de áudio de outros jogadores remotos nesta fase — só do jogador local, para evitar poluição sonora e custo de rede zero.
