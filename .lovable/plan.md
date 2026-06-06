## Plano de correção

1. **Ajustes de angulação das animações para todos em tempo real**
  - Ao salvar no painel admin, continuar gravando em `animation_tunings`, mas também enviar um broadcast imediato para a sala atual.
  - Nos outros clientes, ao receber esse evento ou uma mudança realtime da tabela, atualizar `window.__animTunings`, limpar valores locais antigos quando necessário e reaplicar a pose no mesmo frame.
  - Garantir que jogadores remotos e o jogador local em interações/poses também usem o tuning salvo, não apenas o dispositivo do admin. essa confi
2. **Rádio no mobile/iPhone com volume inicial em 20%**
  - Trocar o controle principal de volume para uma camada de ganho via Web Audio API (`GainNode`), porque iPhone/Safari frequentemente ignora `audio.volume` em `<audio>`.
  - Manter `audio.volume` como fallback para desktop/Android e usar o slider para controlar o `GainNode` quando disponível.
  - Ajustar o volume inicial para 20% no mobile e desktop, salvar localmente, e garantir que o slider do topo reflita esse valor.
  - Melhorar o gesto touch do slider para iPhone, evitando conflito com scroll/drag da interface.
  - Observação técnica: se uma rádio externa bloquear CORS, o navegador pode impedir roteamento por Web Audio; nesse caso o fallback continua funcionando onde o browser permite.
3. **GLBs importados com animações**
  - Ao carregar GLBs em `map_assets`, detectar `gltf.animations`.
  - Criar `THREE.AnimationMixer` para o GLB e tocar automaticamente a primeira animação em loop.
  - Atualizar esses mixers no loop principal do jogo.
  - Remover/parar mixer quando o GLB for excluído ou recarregado para evitar vazamento de memória.
4. **Preview visual do item da interação, com setinhas para arrastar**
  - No editor de interações do tipo `Garçom (bot serve item)`, quando escolher o item (`whisky`, bebida etc.), carregar o GLB como preview fantasma no local onde ele vai aparecer.
  - Atualizar o preview em tempo real ao mexer nos sliders `Spawn offset X/Y/Z`.
  - Conectar o gizmo de setas já existente ao preview do item, permitindo arrastar nos eixos X/Y/Z diretamente no mapa.
  - Ao arrastar, converter a posição para os offsets corretos da interação e sincronizar os inputs do painel.
  - Ao salvar, persistir os offsets em `map_asset_interactions` como já existe hoje.

## Arquivos principais previstos

- `public/app.js`: lógica de realtime/broadcast de animações, Web Audio da rádio, mixers de GLB animado, preview e gizmo do item.
- `public/styles.css`: pequenos ajustes de touch/slider e aparência do preview se necessário.

## Validação

- Testar salvamento de tuning e recebimento imediato em outra sessão/dispositivo.
- Testar slider da rádio em viewport mobile, especialmente iPhone/Safari quando possível.
- Importar um GLB com animação e confirmar autoplay no mapa.
- Editar uma interação de garçom, escolher item, arrastar pelas setas e salvar mantendo a posição correta.