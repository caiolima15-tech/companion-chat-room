# Reativar login + sempre escolher personagem + virar admin

## Contexto

Hoje o app tem uma flag `LOGIN_DISABLED_FOR_TEST = true` que pula a tela de email/senha e entra todo mundo como **anônimo** no Supabase. Isso causa três coisas que você está vendo:

- Toda visita cria um usuário "Visitante" novo, sem email — não dá pra logar com `caiovictorlima50@gmail.com`.
- O código força `isAdmin = false` pra todo mundo nesse modo, então o atalho 🛡️ nunca aparece.
- A tela de personagem só abre na primeira vez (depois lembra a escolha e entra direto).

O trigger `handle_new_user` já existe e dá o papel `admin` ao **primeiro** usuário criado. Como a conta "Teste" pegou esse posto, sua conta nova entraria como `user` — vamos promovê-la manualmente.

## Mudanças

### 1. Reativar a tela de login (email/senha)
- Desligar `LOGIN_DISABLED_FOR_TEST` no `public/app.js`.
- Remover o caminho de `signInAnonymously` (não usar mais convidado anônimo).
- Tela de login passa a aparecer no primeiro carregamento, com opção de "Criar conta" / "Já tenho conta".

### 2. Sempre mostrar a seleção de personagem antes de entrar
- Independente de já ter escolhido antes, sempre abrir `openCharacterSelect()` logo após login.
- O personagem anterior fica pré-selecionado pra ser só clicar "Entrar".

### 3. Promover sua conta a admin
- Depois que você criar conta com `caiovictorlima50@gmail.com`, rodo uma migração que adiciona o papel `admin` pra esse user_id na tabela `user_roles`.
- Com isso o botão 🛡️ aparece pra você e o painel "Gerenciar personagens" abre.

### 4. Limpeza opcional
- Posso remover os 25+ usuários "Visitante" criados pelos testes anônimos, pra deixar a base limpa. (Confirmar antes.)

## Como vai funcionar pra você

1. Recarrega a página → vê a tela "Entrar / Criar conta".
2. Cria conta com `caiovictorlima50@gmail.com` + senha (mínimo 6 chars).
3. Eu rodo a migração que te promove a admin.
4. Próximo refresh: você loga, escolhe personagem, entra na sala e o 🛡️ aparece no canto superior direito.

## Detalhes técnicos

- `public/app.js` linha 16: `LOGIN_DISABLED_FOR_TEST = true → false`.
- Bloco `if (LOGIN_DISABLED_FOR_TEST) { ... signInAnonymously ... }` (linhas 280-295) deletado.
- `bootstrapSession` (linha 352): condição `if (!me.character_slug)` removida — sempre chamar `openCharacterSelect()` e deixar o botão "Entrar na sala" disparar `enterRoom()`.
- Migration: `INSERT INTO user_roles (user_id, role) VALUES (<id>, 'admin') ON CONFLICT DO NOTHING;` rodada depois que você criar a conta.
- Mantém os 6 botões de auth atuais (signup/signin/logout) — só o bypass anônimo sai.
