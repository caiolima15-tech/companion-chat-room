# Bar 3D Multiplayer — porte para a web

## Objetivo

Subir o seu app local (Three.js + chat + GLBs no mapa) pra web mantendo o frontend HTML/JS puro que você já tem, e substituir o servidor `localhost:3000` por um backend gerenciado, com persistência de mapas, upload de avatar e papel de admin.

## Decisões já tomadas

- Frontend: continua em HTML/JS puro com Three.js (sem reescrever em React).
- Backend: Lovable Cloud (substitui o `localhost:3000`).
- Avatar: cada usuário sobe seu próprio `.glb`.
- Mapa: admin importa GLBs e posiciona ao vivo; tudo fica salvo.

## O que vou fazer

### 1. Servir o app estático
- Copio `index.html`, `styles.css`, `app.js` e a pasta `vendor/` (three.module.js, OrbitControls, GLTFLoader, GLTFExporter, BufferGeometryUtils, TextureUtils) para `public/`.
- A rota raiz do projeto serve o `index.html` direto, sem React. O template TanStack fica só pra ter um servidor estático rodando.
- O `.glb` de exemplo (`fantasy_game_inn`) vai pra `public/assets/` como mapa inicial.

### 2. Backend com Lovable Cloud
Substitui o `localhost:3000` por:

- **Auth**: login por email (ou anônimo) só pra ter um `user_id` estável.
- **Tabela `profiles`**: nickname, `avatar_url` (link pro .glb do usuário).
- **Tabela `user_roles`** + função `has_role`: define quem é `admin`.
- **Tabela `map_assets`**: GLBs colocados no mapa (url, posição, rotação, escala, quem colocou). Só admin pode escrever.
- **Tabela `chat_messages`**: histórico do chat.
- **Realtime**:
  - Presence: quem está online + posição atual dos jogadores (substitui o broadcast de movimento).
  - Broadcast/Postgres changes: chat ao vivo e mudanças no mapa.
- **Storage**:
  - bucket `avatars` (público) — `.glb` dos usuários.
  - bucket `map-assets` (público) — `.glb` que o admin importa pro mapa.

### 3. Reescrita do `app.js` (transport)
Troco a camada de comunicação (o que hoje fala com `localhost:3000`) por chamadas ao Supabase JS client carregado via CDN no `index.html`:
- `source = new EventSource(...)` → canal Realtime com presence.
- `fetch('/move')`, `/chat`, `/place`, etc. → `supabase.from(...).insert()` e `channel.track()`.
- Carrega `map_assets` na entrada e escuta mudanças.
- Upload de avatar/GLB usa `supabase.storage.from(...).upload()`.

O resto do `app.js` (Three.js, OrbitControls, raycaster, nameplates, câmera) fica igual.

### 4. Admin e UI
- Quem tem role `admin` no `user_roles` recebe `body.classList.add('is-admin')` — sua CSS `.admin-only` já cuida do resto.
- Primeiro usuário cadastrado vira admin automaticamente (pra você conseguir entrar). Depois você promove outros pela tabela.

## Detalhes técnicos

```text
public/
  index.html         (com <script src="…supabase-js…"> via CDN)
  styles.css
  app.js             (transport trocado p/ Supabase)
  vendor/
    three.module.js
    OrbitControls.js
    GLTFLoader.js
    GLTFExporter.js
    utils/BufferGeometryUtils.js
    utils/TextureUtils.js
  assets/
    fantasy_game_inn.glb
```

Tabelas (resumo):

```text
profiles(id uuid pk → auth.users, nickname text, avatar_url text)
user_roles(user_id uuid, role app_role) + has_role()
map_assets(id, name, url, pos_x/y/z, rot_y, scale, created_by, created_at)
chat_messages(id, user_id, nickname, text, created_at)
```

RLS:
- `profiles`: cada um lê todos, edita o próprio.
- `map_assets`: todos leem; só admin insere/atualiza/deleta.
- `chat_messages`: autenticados leem todos e inserem só com o próprio `user_id`.
- Buckets `avatars` e `map-assets`: leitura pública, upload autenticado.

## Fora do escopo desta etapa

- Múltiplas salas/mapas paralelos (fica fácil de adicionar depois trocando `map_assets` por `room_id`).
- Voz/áudio.
- Animações esqueléticas no avatar (carrego o GLB estático por enquanto).

Se aprovar, eu já habilito o Lovable Cloud, crio as tabelas/buckets e portoo o app.
