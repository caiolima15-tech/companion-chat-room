# "Ir até onde está" entre salas

## O que muda no popup do jogador

Hoje o botão **📍 Ir até onde está** só move dentro da sala atual. Vou fazer ele detectar em qual sala o outro jogador está e:

- **Mesma sala** → comportamento atual (anda até perto dele).
- **Outra sala** → mostra um popup de confirmação *"Fulano está na sala **X**. Ir até lá?"* com botões **Ir** / **Cancelar**.
- **Sala restrita / oculta / inacessível / peer saiu** → mostra erro inline no popup: *"Não foi possível entrar nessa sala."*

## Como funciona por baixo

1. Ao clicar em "Ir até", leio o `map_id` do peer em `lobbyChannel.presenceState()[peerId]`.
2. Se igual ao `currentMapId` → `moveToWorld` direto (igual hoje).
3. Se diferente:
   - Procuro o mapa em `MAPS` (lista de mapas built-in + customs já carregada).
   - Se não existe, está com `hidden=true`, ou o peer sumiu da presença → erro.
   - Senão, abro mini-confirmação dentro do mesmo popup com o nome da sala.
   - Ao confirmar: chamo `switchRoom(targetMapId)` (já existente — troca presence/chat/voz/cenário).
   - Depois de carregar, **aguardo até 4s** o peer aparecer em `playerEntities` (o presence da nova sala traz a posição dele) e então faço `moveToWorld` com offset de ~1.2u para você surgir ao lado.
   - Se o peer não aparecer no prazo (saiu enquanto carregava) → aviso *"Esse usuário saiu da sala."* e te deixa lá no spawn.

## Arquivos a editar

- `public/app.js` — bloco `setupPlayerPopup` (final do arquivo): expandir o handler do botão `follow-loc` com a lógica acima, e o markup do popup para suportar a etapa de confirmação + mensagem de erro inline.
- `public/styles.css` — pequenos estilos para o estado de confirmação/erro do popup (texto secundário + dois botões lado a lado).

## Edge cases cobertos

- Peer offline / saiu do lobby → erro.
- Mapa do peer não existe na lista local (foi excluído) → erro.
- Mapa marcado como `hidden` e você não é admin → erro.
- `switchRoom` falha (erro de rede) → erro.
- Peer trocou de sala de novo durante a troca → aguarda o timeout e avisa.
