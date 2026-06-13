Plano de correção:

1. Realtime de NPCs
- Ativar realtime no backend para `npc_instances`, `npc_models`, `npc_animations`, `npc_waypoints` e `npc_routes`, além do `npc_state` que já está ativo.
- Ajustar `public/npc.js` para tratar `INSERT`, `UPDATE` e `DELETE` de `npc_instances` sem depender de recarregar tudo: NPC criado aparece, NPC removido/desativado desaparece imediatamente.
- Atualizar também o painel de Spawn/Rotas quando houver mudanças ao vivo.

2. Pontos de rota como “cliques automáticos”
- Trocar a lógica do `npc-tick` para seguir os waypoints em ordem de `seq`: ponto 0 -> 1 -> 2 -> 3 -> volta para 0, em vez de escolher o ponto mais próximo.
- Quando o NPC for criado ou a rota for trocada, iniciar o estado no ponto inicial e mirar no próximo ponto.
- Remover a lógica que pode fazer o NPC ficar parado por pausas longas ou escolher pontos errados.

3. Altura e chão corretos
- Expor do mapa principal as mesmas funções que o jogador usa para chão e colisão: altura do chão e bloqueio por objetos.
- No editor de rotas, o clique vai bater no chão real/objetos caminháveis, não no plano fixo `y=0`; assim os pontos não ficam “voando” nem enterrados.
- No runtime dos NPCs, ao deslocar visualmente, ajustar o `Y` pelo chão real igual ao jogador.

4. Movimento visual com colisão
- O NPC vai interpolar em pequenos passos até o próximo alvo, usando a mesma checagem de colisão do jogador.
- Enquanto há deslocamento real no mapa, forçar animação `walk`; quando chegar/parar/conversar, trocar para `idle` ou `talk`.
- Se um trecho entre pontos estiver bloqueado, o NPC não atravessa objeto; ele para visualmente, deixando claro que os pontos precisam contornar o obstáculo.

5. Animações FBX por função, não por nome do arquivo
- Garantir que o slug salvo (`idle`, `walk`, `talk`) seja o que manda; o nome interno do FBX pode ser qualquer um.
- Corrigir o retarget das animações Mixamo criando um mapa real dos ossos do modelo e removendo tracks que não existem no personagem, evitando T-pose e erros como `No target node found`.
- Se não existir animação `walk` cadastrada no banco, manter fallback, mas deixar o sistema pronto para tocar qualquer FBX enviado com slug `walk`.

6. Validação final
- Conferir no banco que o estado do NPC está mudando de ponto em ponto.
- Conferir no console que os erros de tracks inválidas sumiram.
- Deploy da função `npc-tick` depois da alteração para a simulação usar a nova lógica.