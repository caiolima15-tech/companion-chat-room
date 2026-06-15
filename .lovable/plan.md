## Mudança

No `public/npc.js`, no handler de drop que cria a instância do NPC no mapa (linhas ~822-830):

**Hoje:** ao soltar o NPC, o código cria automaticamente uma `npc_route` com 4 waypoints em quadrado em volta do ponto, e já vincula o `route_id` na `npc_instances`.

**Depois:** pular toda a criação de rota/waypoints e inserir a `npc_instances` com `route_id: null`. Adicionar também `pos_x/pos_y/pos_z` (se a coluna existir no schema atual) para o NPC parar exatamente no ponto onde foi solto. NPC sem rota = fica parado no spawn (comportamento que o runtime já suporta).

Nenhuma mudança na aba "Rotas" — continua funcionando pra quem quiser criar rota manualmente e atribuir depois via edição do NPC.

## Arquivo

- `public/npc.js` (apenas o bloco do drop handler, ~8 linhas)

## Confirmar antes de implementar

O schema de `npc_instances` tem colunas `pos_x/pos_y/pos_z` (ou similar) pra eu gravar a posição de spawn? Se não tiver, o NPC sem rota vai precisar de migration pra guardar onde ele fica parado — me avisa que eu verifico o schema antes.
