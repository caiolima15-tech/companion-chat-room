Vou corrigir a duplicação pela raiz, sem criar mais ferramentas novas.

1. Centralizar o controle dos painéis admin
- Criar uma lista única dos painéis antigos: luzes, camadas, bots, rádio, interações e editar mapa.
- Adicionar uma função única para fechar todos eles e limpar os estados do painel lateral.
- Usar essa função ao entrar na sala, sair da sala, trocar personagem/mapa e fechar/minimizar o dock.

2. Impedir que painel antigo abra sozinho
- Remover qualquer estado persistido ou efeito inicial que possa reabrir o dock/painéis depois do login.
- Garantir que, ao entrar na sala, só apareça o escudo novo; o painel lateral começa fechado.
- Nenhum painel antigo deve aparecer até clicar no escudo e depois clicar na ferramenta.

3. Corrigir conflito de CSS que está vencendo o hidden
- Ajustar as regras `.admin-only` / `.is-admin` para não forçarem `display` em elementos com `hidden`.
- Manter os botões antigos invisíveis no topo e no HUD, mas ainda clicáveis por código via painel lateral.
- Reforçar que `[hidden]` sempre ganha, especialmente para painéis com `style="display:flex"` inline.

4. Melhorar o comportamento do painel lateral
- Quando abrir uma ferramenta pelo dock, abrir apenas aquela ferramenta e fechar as outras, evitando sobreposição.
- Quando minimizar ou fechar uma ferramenta, ela some de volta e fica acessível só pelo dock.
- Sincronizar o destaque da linha no dock com o painel realmente aberto.

5. Validar no preview
- Entrar na sala como admin e confirmar visualmente que não há painéis antigos abertos.
- Confirmar que o escudo novo aparece, abre o dock, e cada ferramenta só abre após clique.