Vou corrigir o reset de senha do jeito esperado: ao clicar no link do email, a pessoa verá somente o painel “Digite sua nova senha”, sem cair na tela de login.

Plano:
1. Ajustar a detecção do link de recuperação em `public/app.js` para reconhecer todos os formatos que o provedor de autenticação pode retornar: `code`, `type=recovery`, `access_token`, `refresh_token`, `token_hash` e o marcador `?recovery=1`.
2. Impedir que qualquer inicialização automática do app chame `showAuth("signin")` enquanto o modo de recuperação estiver ativo.
3. Trocar a tela dinâmica atual por um estado dedicado de recuperação dentro do próprio overlay de login, reutilizando os campos já existentes como “Nova senha” e “Confirmar nova senha”. Isso evita disputa entre dois overlays.
4. Ao abrir o link, criar/confirmar a sessão de recuperação antes de permitir salvar a nova senha; se o link estiver expirado, mostrar erro na própria tela de nova senha.
5. Ao salvar, chamar `supabase.auth.updateUser({ password })`, limpar os parâmetros do link e só então voltar para o login com a mensagem “Senha atualizada! Entre com sua nova senha.”

Arquivos previstos:
- `public/app.js`