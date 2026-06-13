## Objetivo
Deixar os NPCs com fala mais natural e curta no começo, soltando-se ao longo da conversa.

## Mudanças em `supabase/functions/npc-chat/index.ts`

### 1. System prompt mais restritivo por "fase" da conversa
Contar quantas mensagens o usuário já trocou com aquele NPC (`hist.length` já é buscado) e injetar regras de tamanho no `system`:

- **Mensagens 1–2** (primeiro contato): MÁX 3–6 palavras. Tipo `"oi, fala"`, `"e aí?"`, `"opa, tudo?"`. Nada de se apresentar, nada de contar o que está fazendo. Pode ser só uma interjeição.
- **Mensagens 3–5** (esquentando): 1 frase curta, até ~12 palavras. Pode responder o que foi perguntado mas sem floreio.
- **Mensagens 6+** (à vontade): até 2 frases, ainda coloquial. Só conta detalhes da própria história (backstory) se o usuário perguntar ou se vier muito a propósito.

### 2. Regras gerais de estilo (sempre)
Adicionar ao system prompt:
- Falar como brasileiro real numa rua: gírias leves, contrações ("tô", "tá", "pra", "cê"), pode usar "kkk" raramente.
- **Proibido**: parágrafos, listas, emojis em excesso, frases tipo "Acabei de sair do trabalho e tô só aproveitando a brisa antes de ir pra casa" no primeiro "oi".
- **Proibido** narrar ações entre asteriscos.
- Não puxar assunto sozinho nas duas primeiras trocas — responder e parar.
- Variar abertura: nem todo "oi" precisa virar "Oi! Tudo bem?". Pode ser só "fala", "e aí", "opa".

### 3. Parâmetros do modelo
Na chamada pro `ai.gateway.lovable.dev`, adicionar:
- `temperature: 0.9` (mais variedade nas respostas curtas)
- `max_tokens` dinâmico baseado na fase: 30 / 60 / 120

### 4. Pós-processamento defensivo
Depois de receber `reply`, se a fase for 1–2 e o texto tiver mais de ~10 palavras ou mais de 1 frase, cortar na primeira frase. Isso garante que mesmo se o modelo escapar, o usuário não recebe um textão no "oi".

## Não muda
- Geração de nome/backstory (continua igual, só não é "despejado" na conversa).
- TTS, STT, balões, lógica de proximidade.
- Frontend.

## Resultado esperado
- Usuário: "oi" → NPC: "opa, e aí?"
- Usuário: "qual a boa" → NPC: "to por aqui, e tu?"
- Depois de 4–5 trocas, NPC começa a soltar mais sobre quem é, o que faz, etc.
