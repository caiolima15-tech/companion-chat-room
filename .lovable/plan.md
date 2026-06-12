
# Plano: NPCs vivos + Emprego de Entregador

## Parte 1 — NPCs que caminham pelo mapa

### 1.1 Painel admin de NPCs (modo edição)
Novo botão no menu admin: **"NPCs"**. Abre painel com:
- **Biblioteca de modelos**: upload em lote de `.glb` / `.fbx` (vai para bucket `characters`, marca `is_npc=true`).
- **Editor de rotas (waypoints)**: clicar no mapa adiciona pontos numerados, ligados em sequência. Suporta:
  - rotas circulares (calçadas) e rotas com travessia (`is_crosswalk=true` faz o NPC parar, olhar dois lados, atravessar mais rápido).
  - pontos especiais: `talk_spot` (NPCs param e conversam entre si por 10–30 s) e `sit_spot` (vincula a um `interaction_template` existente — "sentar").
- **Áreas de spawn**: retângulos onde NPCs nascem; configura quantos NPCs por área e quais modelos podem aparecer.

### 1.2 Simulação servidor‑side
Edge function `npc-tick` roda a cada 1 s via `pg_cron` e:
- Lê NPCs ativos do mapa, avança posição ao longo do waypoint atual (velocidade caminhada/parada/atravessando).
- Decide aleatoriamente: parar pra conversar, sentar num `sit_spot`, mudar de rota.
- Grava `npc_state` (posição, rotação, animação, estado, alvo) em tabela com `REPLICA IDENTITY FULL` e publicação realtime.
- Clientes apenas interpolam — não decidem comportamento. Garante consistência.

### 1.3 Renderização no cliente (`public/app.js`)
- Subscribe em `npc_state` via realtime; cada NPC é uma entity Three.js com retargeting nas animações existentes (idle, walk, sit, drink, talk).
- Interpolação suave entre ticks (1 s) para movimento fluido.
- Quando o jogador chega a < 2 m de um NPC, aparece prompt **"E — Conversar"**.

### 1.4 Conversa com IA (texto + voz)
- Modal de chat ao apertar E. NPC tem `persona` (nome, idade, ocupação, humor) salva na linha do NPC.
- Backend: edge function `npc-chat` chama **Lovable AI** (`google/gemini-3-flash-preview`) com a persona + histórico curto da conversa para gerar resposta em PT‑BR coloquial.
- Voz: resposta passa pela função `npc-tts` que usa **ElevenLabs** (conector padrão `elevenlabs`) com voz mapeada por persona (Sarah, Brian, Liam, etc.). Áudio retornado como MP3, tocado no browser; texto exibido em balão simultaneamente.
- Histórico salvo em `npc_conversations` (limpa após 24 h por trigger, como `chat_messages`).

## Parte 2 — Emprego de entregador

### 2.1 Saldo do jogador
- Coluna `balance_cents` em `profiles` + tabela `wallet_transactions` (audit).
- HUD novo no canto superior direito: **"R$ 0,00"** sempre visível, atualizado em realtime via subscription em `profiles`.
- Tabela `delivery_stats` com `xp`, `level`, `deliveries_completed`, `best_time_ms`.

### 2.2 Postos de emprego (admin)
Mesmo painel admin ganha aba **"Empregos"**: clica no mapa para criar um **delivery hub** (ponto de retirada). Cada hub tem:
- localização da caixa (onde pegar)
- lista de locais de entrega (clica em N pontos = portas de casas).
- pagamento base por km + bônus de velocidade + nível mínimo desbloqueado.

### 2.3 Loop de gameplay da entrega
1. Jogador chega ao hub → prompt "Aceitar entrega". Sorteia destino e calcula tempo limite a partir da distância (ex.: 90 s + 8 s/100 m).
2. Anima **pegar caixa** (animação existente de "drink" reaproveitada como "carregar", ou nova FBX se disponível). Caixa aparece presa à mão.
3. Vai até o carro mais próximo. Animação de **abrir mala → colocar caixa → fechar mala** (sequência de interações; caixa some da mão e aparece presa ao carro).
4. Dirige até o destino. Barra de tempo no HUD.
5. Sai do carro, animação **abrir mala → pegar caixa → entregar na porta**.
6. Tela mostra **"✅ Entrega concluída — R$ 12,40 +35 XP"** (verde, fade‑in/out). Saldo atualiza.

Fórmula: `pay = base + bonus * max(0, (time_limit - tempo_real) / time_limit)`; XP proporcional. Sobe de nível a cada N XP (curva escalonada), desbloqueando hubs/distâncias maiores.

### 2.4 Cancelamento / falha
- Estourou o tempo: paga 30 % do valor, sem XP, toast "⚠ Atrasado".
- Sair do carro com caixa longe do destino: marca como abandonada após 60 s.

## Detalhes técnicos

### Banco (uma migração)
- `npc_models` (referência aos GLB/FBX em `characters`, persona padrão, voz ElevenLabs).
- `npc_routes`, `npc_waypoints` (com `is_crosswalk`, `is_talk_spot`, `is_sit_spot`).
- `npc_spawn_areas`.
- `npc_instances` (estático: id, modelo, persona, rota inicial).
- `npc_state` (dinâmico: pos, rot, anim, estado, target_waypoint) — REPLICA IDENTITY FULL + publicação realtime.
- `npc_conversations` (user_id, npc_id, role, text, created_at) com trigger de limpeza 24 h.
- `delivery_hubs`, `delivery_destinations`, `delivery_jobs` (estado por jogador).
- `wallet_transactions`, `delivery_stats`.
- Coluna `balance_cents` em `profiles`.
- Todas com RLS: leitura pública para o que precisa renderizar; escrita restrita a admin ou ao próprio dono; pagamento só via função `SECURITY DEFINER` `complete_delivery(job_id)` para impedir trapaça.

### Edge functions
- `npc-tick` — simulação periódica (pg_cron a cada 1 s).
- `npc-chat` — Lovable AI Gateway, resposta de texto.
- `npc-tts` — ElevenLabs (precisa do connector `elevenlabs` linkado; pergunto antes de criar).
- `complete-delivery` — valida tempo/posição, credita saldo + XP via função SQL `SECURITY DEFINER`.

### Frontend (`public/app.js` + `public/styles.css`)
- Módulo `npc_admin.js` (painel + waypoints).
- Módulo `npc_runtime.js` (subscribe realtime, render, conversa).
- Módulo `delivery.js` (HUD R$, fluxo de jobs, toast de conclusão).
- Estilos: HUD saldo (canto sup. direito), balão de chat NPC, toast de entrega.

### Dependências externas
- **ElevenLabs**: preciso linkar o connector padrão `elevenlabs` (sem custo extra de setup; usa a conta do workspace). Confirmo antes de seguir.
- **Lovable AI** (`LOVABLE_API_KEY`) — já configurado.

## Ordem de execução
1. Migração do banco (todas as tabelas + RLS + função `complete_delivery`).
2. Conectar ElevenLabs.
3. Edge functions (`npc-chat`, `npc-tts`, `npc-tick`, `complete-delivery`) + cron.
4. Painel admin NPCs (modelos, rotas, áreas).
5. Runtime NPCs no cliente + chat com voz.
6. HUD R$ + painel admin de hubs de entrega.
7. Loop de entrega completo + toast de conclusão.
8. XP/nível e desbloqueios.
