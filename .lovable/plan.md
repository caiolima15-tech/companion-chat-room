# Captura automática do .glb do Avaturn

## Objetivo

Quando o usuário clicar em "Save Avatar" dentro do Avaturn (embutido no nosso app), o `.glb` deve ir direto pro nosso Storage e aparecer na lista de personagens — sem o usuário precisar baixar no PC e arrastar de volta.

## Por que hoje não funciona

O Avaturn está num `<iframe>` apontando direto pra `hub.avaturn.me`. Quando o botão deles dispara um download, o navegador trata como download normal e abre o "Salvar como" do sistema operacional. Nada disso passa pelo nosso app, então a gente não tem acesso ao arquivo gerado.

Pra interceptar, precisamos colocar um servidor nosso no meio (proxy reverso) que repassa tudo do Avaturn pro usuário e, na hora que o `.glb` for baixado, manda uma cópia pro nosso Storage antes de devolver pro navegador.

## O que vai ser construído

### 1. Rota de proxy `/avatar-studio/*`
Server route em TanStack (`src/routes/api/public/avatar-studio.$.ts`) que:
- Repassa qualquer requisição (`GET`/`POST`/`OPTIONS`) pra `https://hub.avaturn.me/...`
- Remove headers `X-Frame-Options` e `Content-Security-Policy` da resposta (pra deixar embutir no iframe)
- Reescreve URLs absolutas no HTML/JS/CSS (`https://hub.avaturn.me/` → `/avatar-studio/`) pra navegação interna continuar dentro do proxy
- Cuida de cookies do Avaturn (repassa nos dois sentidos) pra a sessão deles funcionar

### 2. Interceptação do download do `.glb`
Quando a resposta tem `Content-Type: model/gltf-binary` ou `Content-Disposition: attachment; filename=*.glb`:
- O servidor lê o buffer do `.glb`
- Sobe pro bucket `characters` em `user-avatars/<user_id>/<timestamp>.glb`
- Insere uma linha em `user_avatars` (`base_url`, `name = "Avatar Avaturn"`, `user_id`)
- Devolve o mesmo `.glb` pro navegador (pra UX continuar igual, caso o usuário queira o arquivo)

A chamada precisa saber QUEM é o usuário. Como o iframe não manda o Bearer token, vamos passar o `user_id` numa query string assinada (`/avatar-studio/...?u=<userId>&s=<hmac>`) que o app injeta na URL do iframe. O servidor valida o HMAC com um secret (`AVATAR_PROXY_SECRET`).

### 3. Ajustes no frontend
- `public/index.html`: trocar `src="https://hub.avaturn.me/create/proceed"` por `src="/avatar-studio/create/proceed?u=...&s=..."`
- `public/app.js`:
  - Antes de abrir o overlay, pedir ao servidor a URL assinada (server fn nova `signAvatarStudioUrl`)
  - Escutar mensagens do servidor via realtime (`postgres_changes` em `user_avatars` filtrado por `user_id = me.id`) e, quando aparecer linha nova, mostrar toast "Avatar salvo!" + recarregar lista + fechar overlay
  - Manter o dropzone como fallback (se a captura automática falhar, o usuário ainda consegue arrastar manualmente)

### 4. Secret novo
- `AVATAR_PROXY_SECRET` — usado pra assinar/validar a URL do iframe

## Detalhes técnicos

```text
[Browser]
   │  iframe src="/avatar-studio/create/proceed?u=...&s=..."
   ▼
[TanStack server route /api/public/avatar-studio/$]
   │   1. valida HMAC, extrai user_id
   │   2. fetch upstream https://hub.avaturn.me/<path>
   │   3. se body é .glb:
   │        - upload pro Storage (supabaseAdmin)
   │        - insert user_avatars (supabaseAdmin)
   │   4. strip X-Frame-Options / CSP
   │   5. reescreve URLs no HTML/JS pra apontar pro proxy
   ▼
[hub.avaturn.me]
```

Pontos de risco que o usuário precisa saber antes de aprovar:

1. **Termos de uso do Avaturn** — re-embalar o serviço deles num proxy provavelmente viola o ToS. Eles podem bloquear nosso IP/origin a qualquer momento.
2. **Login Google** — o Avaturn usa OAuth do Google. Dentro do proxy, o redirect pra `accounts.google.com` provavelmente vai sair do nosso domínio (Google bloqueia OAuth em iframes/proxies de terceiros). Resultado provável: a tela de login abre em popup novo OU quebra. Sem o login deles funcionando, o resto não roda.
3. **Fragilidade** — se o Avaturn mudar o nome do endpoint de download ou o `Content-Type`, a interceptação para de funcionar até a gente atualizar.
4. **Banda no Cloudflare Worker** — todo o tráfego do Avaturn (modelos 3D, texturas, JS) passa pelo nosso servidor. Pode ficar lento e consumir banda.

## Caminho alternativo (mais simples, sem proxy)

Se você quiser evitar o risco do proxy: manter o iframe direto no `hub.avaturn.me`, mas adicionar um botão grande "Já baixei o .glb, clique aqui" que abre o seletor de arquivos diretamente — sem dropzone, sem etapa de "arrastar". É só 1 clique a mais que a versão automática, sem nenhum risco de ToS/quebra.

## Arquivos que serão tocados

- `src/routes/api/public/avatar-studio.$.ts` (novo) — proxy + captura
- `src/lib/avatar-studio.functions.ts` (novo) — server fn que gera URL assinada
- `public/index.html` — iframe aponta pro proxy
- `public/app.js` — busca URL assinada, escuta realtime de `user_avatars`
- Secret `AVATAR_PROXY_SECRET` (pedido ao usuário)

## Decisão pendente

Antes de implementar, confirmar:
- Aceita o risco do proxy (item 1 e 2 acima)?
- Ou prefere o caminho alternativo (botão "já baixei, importar agora")?
