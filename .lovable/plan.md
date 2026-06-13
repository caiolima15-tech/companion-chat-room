## O que muda

### 1. Tamanho dos NPCs (escala) — painel admin
Na aba **Modelos** (`renderModelsTab` em `public/npc.js`):
- adicionar um input numérico `scale` por linha (0.1–5, passo 0.05), lendo/escrevendo `npc_models.scale_mul`.
- ao salvar, atualizar no banco e re-aplicar nos NPCs já spawnados (re-escala `ent.group.children[0]` sem precisar recarregar GLB).
- A coluna `scale_mul` já existe e já é lida no `spawnNpc` (linha 233), só falta UI.

### 2. NPCs estão parados (não andam)
Causa confirmada no banco: 2 dos 3 NPCs estão com `route_id = NULL` (foram criados antes do sistema de rotas amarrar automaticamente). O `npc-tick` pula qualquer NPC sem rota.

Correções:
- Na aba **Spawn**, adicionar um `<select>` por NPC com as rotas da sala atual para reatribuir/trocar a rota. Botão "Salvar" grava `route_id`.
- Quando o NPC ganha rota, apagar o `npc_state` antigo dele (assim o tick recria o state no 1º waypoint e ele começa a andar).
- Mostrar aviso visual ("sem rota — não anda") nos NPCs com `route_id = NULL`.

### 3. Animação de "talk" durante chat de texto
Hoje só roda `setAnim(ent, "talk")` quando a resposta vem em áudio (linha 505). No modo texto, o NPC fica em idle.

Correção em `sendNpcText` (`public/npc.js` ~488):
- ao mostrar o balão (`showBubble`), tocar `setAnim(ent, "talk")` e voltar pra `idle` depois de uma duração proporcional ao tamanho do texto (ex: ~60 ms por caractere, mínimo 1.5s, máx 6s).
- limpar timer anterior se nova mensagem chegar.

### 4. Editor de rotas não adiciona pontos com clique
Possíveis causas no `onEditorUp` (linha 886):
- threshold `Date.now() - downTime > 350` é curto demais (descarta cliques "normais" que demoram 400–500 ms);
- não há feedback quando o raycast falha (ex: clicou fora do plano y=0 ou em cima de outro mesh).

Correções:
- aumentar threshold de clique pra 700 ms.
- adicionar pequeno toast/log quando insere ("✔ ponto adicionado #N") e quando descarta (motivo).
- garantir que o evento de clique no canvas não está sendo bloqueado por overlay (verificar `pointer-events` do painel admin durante o editor — se necessário, dar `pointer-events:none` no painel enquanto edita).

## Arquivos tocados
- `public/npc.js` — UI de escala em Modelos, dropdown de rota em Spawn, `talk` no modo texto, ajustes no editor.
- (sem migrations: `scale_mul` e `route_id` já existem.)

## Não muda
- `npc-chat` / fase de conversa / TTS.
- LOD, cron, schema do banco.
