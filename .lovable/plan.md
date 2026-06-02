## Painel admin para excluir usuários

### O que será adicionado

1. **Botão "Painel Admin"** no menu/configurações — visível apenas para quem tem `role = 'admin'` (verificação via tabela `user_roles` existente).

2. **Modal/tela de administração** listando todos os usuários com:
   - Avatar, nickname, email, data de cadastro, último login
   - Botão "Excluir conta" (vermelho) com confirmação dupla ("Tem certeza? Esta ação é irreversível")

3. **Exclusão permanente e imediata** que apaga:
   - Conta em `auth.users` (via service role)
   - `profiles`, `profile_photos`, `user_avatars`, `user_roles`, `follows`, `chat_messages`, `direct_messages` do usuário
   - Arquivos do usuário no storage (`avatars`, `profile-photos`, `characters`) quando aplicável

### Como funciona tecnicamente

- **Server function** `listUsers` (protegida por `requireSupabaseAuth` + checagem `has_role admin`) usando `supabaseAdmin.auth.admin.listUsers()` para juntar dados de auth + profiles.
- **Server function** `deleteUserAccount({ userId })` (mesma proteção admin):
  1. Limpa linhas relacionadas nas tabelas públicas
  2. Limpa arquivos do storage do usuário
  3. Chama `supabaseAdmin.auth.admin.deleteUser(userId)`
  4. Bloqueia auto-exclusão do próprio admin logado para evitar lockout
- **Frontend** em `public/app.js` + `public/index.html` + `public/styles.css`: novo botão no menu, novo overlay/modal de admin com lista + busca + botão excluir.

### Segurança

- Toda a lógica de exclusão roda no servidor com service role — nunca no cliente.
- Dupla checagem do papel admin: middleware de auth + `has_role(auth.uid(), 'admin')` antes de qualquer ação destrutiva.
- Confirmação dupla na UI (texto "EXCLUIR" digitado pelo admin) antes do delete real.

Quer que eu siga com isso?
