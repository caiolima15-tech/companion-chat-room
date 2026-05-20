# Tela de entrada com personagens Mixamo animados

## Objetivo

Antes de cair na sala, o usuário vê uma **tela de seleção** com:
1. Campo de apelido.
2. Carrossel/grade com **5 personagens Mixamo** pra escolher.
3. Botão "Entrar na sala".

Dentro da sala, o personagem escolhido roda animações de verdade — idle parado, walk/run quando anda, e emotes (jump/dance/wave) por botão ou tecla.

## Como você entrega os arquivos

Pra cada um dos 5 personagens você sobe um conjunto de FBX do Mixamo:

```text
character-1/
  base.fbx       (personagem com skin + esqueleto, geralmente o "T-Pose" sem animação)
  idle.fbx
  walk.fbx
  run.fbx
  jump.fbx
  dance.fbx
  wave.fbx
character-2/
  ...
```

Eu monto isso num bucket de storage chamado `characters/`, cada personagem numa pasta. Você sobe os arquivos por uma tela de admin nova ("Gerenciar personagens"), só admin enxerga.

Cada personagem na tela de seleção mostra um nome + uma miniatura (PNG que você sobe junto, ou eu gero render fake só com o nome se você não tiver).

## O que muda na sala

- Substituo o personagem geométrico atual (`createCharacter`) pelo modelo escolhido carregado via Mixamo.
- Cada jogador renderiza o personagem que o outro escolheu (a escolha vai no `profiles.character_slug`).
- Animação: idle por padrão; quando posição muda, troca pra walk; mantendo movimento rápido (clique longe → distância grande), entra run; emotes ficam tocando até voltar pra idle.
- Emotes disparam por **botão na HUD** (Pular / Dançar / Acenar) **e por teclado** (Espaço, 1, 2). O estado do emote é sincronizado pelos outros via o canal de movimento que já existe.

## Tela de seleção (visual)

```text
┌─────────────────────────────────────────┐
│           NEON TAP ROOM                 │
│           escolha seu vibe              │
│                                         │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐               │
│  │P1│ │P2│ │P3│ │P4│ │P5│   ← clica    │
│  └──┘ └──┘ └──┘ └──┘ └──┘               │
│  Boxer Dancer Soldier ...               │
│                                         │
│  Apelido: [________________]            │
│                                         │
│         [  Entrar na sala  ]            │
└─────────────────────────────────────────┘
```

Vira o overlay inicial: depois do login (email/senha), em vez de já cair na sala, mostra essa tela. A escolha fica salva no perfil — da próxima vez já abre direto na sala, mas com um botão "Trocar personagem" no canto da HUD.

## Detalhes técnicos

**Storage / Banco**
- Bucket público `characters/` para os FBX + miniaturas.
- Tabela nova `characters` (slug, nome, base_url, idle_url, walk_url, run_url, jump_url, dance_url, wave_url, thumbnail_url). Só admin escreve, todos leem.
- Coluna nova em `profiles.character_slug`.

**Loader**
- Adiciono `FBXLoader` do `three/examples/jsm/loaders/FBXLoader.js` em `public/vendor/`.
- Para cada jogador: carrego o `base.fbx`, extraio o esqueleto, depois carrego os FBX de animação e copio os `AnimationClip` pro mixer do base. Cache por personagem pra não rebaixar pra cada jogador.

**Animação**
- `THREE.AnimationMixer` por jogador.
- Estado: `idle | walk | run | jump | dance | wave`.
- Transição com `crossFadeTo(0.2s)`. Emotes voltam pra idle quando o clip termina.
- Sincronização: hoje o canal `room-movement` manda `{x,z,facing}`. Adiciono `anim` no payload pros outros tocarem o emote certo.

**Tela de seleção**
- Novo overlay HTML/CSS no `index.html`, similar ao `authOverlay`.
- Mostrado quando: usuário logado mas sem `character_slug` no profile, ou clicou em "Trocar personagem".
- Apelido daqui salva direto no `profiles.nickname` (substitui o input que ainda fica no painel de chat — mantenho o do chat também caso queira trocar depois).

**HUD de emotes**
- 3 botões circulares no `world-hud`: 🦘 Pular / 💃 Dançar / 👋 Acenar.
- Teclas: Espaço = jump, 1 = dance, 2 = wave.

## Fora do escopo

- Animações com IK / pés colados no chão (mantém o jeito Mixamo "padrão").
- Mistura de animações simultâneas (ex: andar acenando) — emotes pausam o movimento.
- Trocar de personagem no meio da sala sem voltar pra tela de seleção.

Se aprovar, eu já crio a tabela, o bucket, a tela de admin pra você subir os FBX, e a tela de seleção.
