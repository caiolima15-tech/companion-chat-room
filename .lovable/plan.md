Plano para estabilizar a troca de personagem em tempo real:

1. Centralizar a troca de personagem em uma única rotina
- Criar uma função única para aplicar a troca local, salvar no perfil, atualizar presença e enviar broadcast.
- Evitar que partes diferentes do código façam a mesma atualização em ordens diferentes.

2. Enviar estado completo no broadcast de troca
- Além de `character_slug`, enviar também posição atual (`x`, `y`), direção, nome, cor e um `version/timestamp` da troca.
- Assim, quem recebe não volta o jogador para dados antigos nem depende só do `presence`.

3. Impedir eventos antigos de sobrescreverem o personagem novo
- Guardar uma versão local da última troca por jogador.
- Ignorar updates atrasados de `presence` ou `profiles` quando eles trouxerem personagem antigo.
- Isso resolve o problema “funciona de um lado mas no outro volta/troca errado”.

4. Melhorar o carregamento assíncrono do modelo 3D
- `applyCharacter` já tem `pendingCharacterSlug`, mas vou reforçar para limpar loading/spinner quando uma troca é abortada ou falha.
- Manter o personagem anterior até o novo estar pronto quando possível, evitando boneco sumir ou ficar preso em loading.

5. Reenviar estado real ao entrar na sala
- Quando alguém novo entra, além da posição, reenviar também o personagem atual completo.
- Isso evita que usuários recém-chegados vejam personagem antigo ou padrão.

6. Revisar pontos de conflito encontrados
- `presence sync` hoje mescla posição antiga, mas pode trazer `character_slug` antigo.
- `profiles` update e broadcast `character` podem chegar fora de ordem.
- `renderPlayers` atualiza `me` com dados vindos do presence, o que pode reverter a escolha local se a presença antiga chegar depois.

Resultado esperado:
- Troca de personagem aparece para todos imediatamente.
- O próprio usuário não volta para personagem antigo.
- Usuários novos entram vendo o personagem e posição reais de todos.
- Eventos atrasados deixam de quebrar a sincronização.