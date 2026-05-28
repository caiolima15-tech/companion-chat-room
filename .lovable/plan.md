## Objetivo

Deixar o modo futebol funcional e simples, reaproveitando as animações que os avatares já usam (idle/walk/run). As únicas animações novas são os chutes — que hoje fazem o personagem **afundar** no chão. Além disso, a **bola não aparece** e precisa ter **física**. A bola passa a ter um **ponto de spawn fixo** definido pelo painel admin.

## O que vai mudar

### 1. Bola com ponto de spawn fixo (painel admin)
Hoje a bola é "presa" a outro objeto colocado no mapa (offset relativo), e por isso não aparece quando não há objeto válido. Vamos trocar para um **ponto fixo**:

- No editor de interações, quando o tipo for **⚽ Bola de futebol**, em vez de escolher um objeto, aparece o botão **"Colocar bola aqui"**, que grava a **posição atual do seu avatar** no mapa como spawn da bola (com sliders finos de X / Altura / Z e tamanho da bola para ajustar depois).
- A bola nasce nesse ponto, e **volta automaticamente** pra lá quando para de se mover, sai dos limites do mapa, ou ninguém está com ela há um tempo.
- Pode colocar em quantos mapas quiser (1 bola por mapa), como já era planejado.

### 2. Bola volta a aparecer + física
- A bola passa a ser posicionada pelas coordenadas de spawn fixas (não depende mais de um objeto existir).
- Garantir que o modelo `ball.glb` carregue, fique **visível** e com tamanho coerente.
- Física da bola no cliente dono: gravidade, quique no chão (usando a altura real do piso), atrito e rolagem (giro visual). Proteções contra "sumir": se a posição virar inválida (NaN) ou sair dos limites, a bola **reseta no spawn**.
- Condução (drible): a bola gruda levemente à frente do jogador; ao chutar, é liberada e segue a física. Sincronização multiplayer continua pelo canal `ball:<mapId>` já existente.

### 3. Andar/correr com as animações atuais
- Movimento analógico (joystick + WASD) e câmera atrás do jogador continuam, mas usando **somente** as animações que já existem: `idle`, `walk`, `run`. Nada novo aqui — só garantir que o modo futebol chame essas mesmas ações.
- HUD do modo futebol: **joystick**, botão **CORRER**, botão **CHUTE** (com barra de força) e **SAIR**.

### 4. Chute sem afundar + Pose Debug ajustável
O afundamento vem das animações do Mixamo: o osso raiz (Hips) carrega um deslocamento de posição embutido que, na escala do avatar, puxa o corpo pra baixo.

- **Correção principal:** ao preparar os clipes `kickWeak`/`kickStrong`, remover a faixa de **posição do osso raiz** (mantendo só as rotações). Assim o chute toca "no lugar", com os pés no chão.
- **Pose Debug do chute (ajustável e salvável):** um pequeno painel (visível para admin) com sliders para **Altura (Y)**, **Frente/Trás**, e **Rotação**, aplicados enquanto o chute toca. Você ajusta vendo o personagem chutar e clica em **Salvar**; os valores ficam guardados (no navegador, como o Pose Debug atual) e são reaplicados sempre.

## Detalhes técnicos

- **Migração (1 ajuste):** tornar `map_asset_interactions.asset_id` **nullable**, para permitir uma bola com spawn fixo sem objeto associado. Os campos existentes são reaproveitados: `offset_x/offset_y/offset_z` = posição **absoluta** de spawn no mundo, `scale_mul` = tamanho da bola, `trigger_radius` = raio que ativa o modo futebol. Sem novas tabelas.
- **`public/app.js`:**
  - `retargetClipToBones`: novo parâmetro para **descartar a faixa de posição do osso raiz** nos slots de chute (resolve o afundamento).
  - `footballModule`: spawn lido das coordenadas absolutas; remoção da dependência de `interWorldPos`/asset; reset de segurança da bola; aplicação do Pose Debug do chute durante `kickWeak`/`kickStrong`.
  - Editor de interações (`football`): botão "Colocar bola aqui" (grava posição do avatar) + sliders de ajuste + tamanho da bola.
  - Pequeno painel de Pose Debug do chute (reuso do padrão do `poseDebug` já existente, em `localStorage`).
- **`public/index.html` / `public/styles.css`:** ajustes pontuais no HUD e no painel de Pose Debug do chute (o HUD de futebol já existe).

## Validação

- Admin coloca a bola num mapa pelo botão "Colocar bola aqui"; a bola **aparece** naquele ponto.
- Ao chegar perto: entra o modo futebol (joystick + correr + barra de força), usando idle/walk/run atuais.
- Chutar fraco/forte: o personagem **não afunda**; Pose Debug ajusta e salva.
- Bola tem física (quique/atrito/rolagem) e **reseta no spawn** se parar ou sair do mapa.
- Dois navegadores no mesmo mapa veem a mesma bola; passar/chutar aparece para o outro.
- Afastar-se volta ao controle normal (clicar pra andar) sem tela preta.
- Conferir no mobile (~390–440px): HUD sem cortar.

## O que NÃO muda

- Login, troca de avatar, troca de mapa, chat, rádio, sentar e demais interações continuam iguais.
- Mapas sem a bola de futebol não têm modo futebol.
