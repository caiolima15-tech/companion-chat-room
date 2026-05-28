## Objetivo

Transformar a tela "Escolha seu vibe" num **preview 3D estilo Avaturn**: um personagem por vez na tela, com fundo/base atrás, animação idle do próprio GLB, câmera que dá zoom e gira ao redor (sem andar), navegação para o lado (1 por vez) e o botão "Entrar" embaixo. Além disso, um botão "Editar personagem" que leva ao editor do Avaturn e atualiza o avatar no nosso vibe ao reexportar.

## Como vai ficar

```text
┌───────────────────────────────┐
│   Escolha seu vibe            ✕ │
│  ┌─────────────────────────┐   │
│  │   (fundo gradiente)     │   │
│  │       ╭─────╮           │   │
│  │  ‹    │ GLB │    ›       │   │  ← gira/zoom com o dedo/mouse
│  │       │idle │           │   │  ← ‹ › troca de personagem (1 por vez)
│  │       ╰──┬──╯           │   │
│  │      (base/plataforma)  │   │
│  └─────────────────────────┘   │
│   • • ●  (indicador)            │
│   [ Editar personagem ]         │
│   Apelido: [__________]         │
│   [      Entrar na sala      ]  │
└───────────────────────────────┘
```

## O que vai mudar

### 1. Preview 3D no lugar da grade (`public/index.html`, `public/styles.css`, `public/app.js`)
- Substituir a grade `#characterGrid` por um **palco de preview**: um `<canvas>` ocupando o card, com fundo em gradiente escuro e uma base/plataforma sob o avatar (visual parecido com o do Avaturn).
- Criar um mini-renderer Three.js dedicado (cena + câmera + luz + `OrbitControls`) só para a seleção, reaproveitando `loadCharacterAssets()` que já normaliza o GLB e carrega a animação **idle**.
- O avatar selecionado entra com o `AnimationMixer` tocando **idle** em loop.
- `OrbitControls` configurado para **girar e dar zoom**, com **pan desabilitado** e limites de distância/ângulo — a pessoa olha ao redor mas não "anda".
- O loop de animação do preview só roda enquanto a tela está aberta (para não pesar), e é destruído ao entrar na sala.

### 2. Navegação 1-por-vez (`public/app.js`, `public/index.html`)
- Setas ‹ › e **swipe** (arrastar na horizontal) trocam o personagem atual; cada troca carrega o próximo GLB no palco com um fade.
- Indicador de pontinhos mostrando posição na lista.
- A lista é a mesma de hoje: personagens do catálogo + os avatares do próprio usuário (`userAvatars` do usuário logado) + um item final "Criar meu avatar" (abre o criador do Avaturn, como já faz).
- O botão **"Entrar na sala"** e o campo de **apelido** continuam embaixo; "Entrar" usa o personagem atualmente no palco.
- Manter a ação de **excluir** avatar próprio (hoje no tile) como um ícone discreto no canto do palco quando o item for um avatar do usuário.

### 3. Botão "Editar personagem" → Avaturn + sincronizar de volta (`public/index.html`, `public/app.js`)
- Mostrar "Editar personagem" apenas quando o item atual for um **avatar do usuário** (não nos personagens do catálogo).
- Ao clicar: abre o criador do Avaturn (mesmo overlay de hoje) em **modo edição**: ao reexportar (clicar "Next"), em vez de criar um avatar novo, **atualizamos o avatar atual** — substitui o `.glb` no storage e atualiza `base_url`/thumbnail do registro em `user_avatars`, limpando o cache do preview para recarregar a nova versão no palco.
- Resultado: a alteração feita no Avaturn passa a refletir no nosso vibe (mesmo slug `user:<id>`), inclusive para quem já está na sala (o realtime de `user_avatars` já existe).

> **Limitação (sem API key):** o editor do Avaturn **não** consegue abrir já carregado exatamente aquele avatar para ajustes — isso exige a API do Avaturn (sessão `edit_existing`), que você optou por não usar. Por isso, "Editar" abre o editor e o que for reexportado **substitui** o avatar atual. Se um dia quiser a edição que já abre o avatar existente, é só ativar a API key.

### 4. Validação no preview
- Abrir "Escolha seu vibe": ver um personagem por vez com fundo/base, idle rodando, girar e dar zoom (sem pan/andar).
- Trocar com setas e swipe; conferir indicador e o botão Entrar usando o atual.
- "Editar personagem" num avatar próprio: editar no Avaturn, reexportar e ver o avatar atualizado no palco e na sala.
- Conferir desempenho no mobile (390px) e que o renderer é destruído ao entrar/sair.

## Detalhes técnicos

- Reaproveita `loadCharacterAssets(character)` → `{ base, clips, scale }`, `cloneSkeleton`, `THREE.AnimationMixer` e `/vendor/OrbitControls.js` (já importados em `public/app.js`).
- Novo renderer isolado para o preview (não interfere no renderer da sala). `OrbitControls`: `enablePan=false`, `minDistance/maxDistance` e `min/maxPolarAngle` limitados; alvo na altura do tronco.
- Edição/sync: substitui o objeto no Storage (bucket `characters`) e dá `update` em `user_avatars` (mesmo `id`/slug), depois `characterCache.delete('user:<id>')` para recarregar.
- Sem mudanças de schema. Usa as tabelas/colunas atuais (`user_avatars.base_url`, `thumbnail_url`) e o realtime já existente.
- A imagem enviada (avatar com fundo desfocado) é só referência visual do estilo de preview; não será embutida.

## O que NÃO muda

- Fluxo de login e a galeria compartilhada do Avaturn permanecem como estão.
- Catálogo de personagens do admin continua disponível na mesma navegação.
