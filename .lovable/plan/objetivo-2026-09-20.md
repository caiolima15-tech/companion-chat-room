## Objetivo

Melhorar nitidez e estabilidade visual perto do jogador sem reduzir FPS, aproximando o resultado de engines como Unity dentro dos limites do navegador.

## Mudanças

- Corrigir o antialiasing do pós-processamento: usar MSAA quando o aparelho suporta e manter SMAA como acabamento, evitando serrilhado causado pelo buffer sem amostragem.
- Adicionar qualidade adaptativa de resolução: preservar alta nitidez e reduzir suavemente a resolução apenas quando o FPS cair, com recuperação automática.
- Transformar o corte atual por distância em LOD visual por faixas:
  - perto: modelo, materiais e sombras completos;
  - médio: modelo completo, mas sem projetar sombras caras;
  - longe: apenas geometria visível, sem sombras, até entrar na névoa/corte.
- Manter personagens, carros e elementos importantes visíveis conforme a distância configurada.
- Adicionar controles no painel de luzes para ativar qualidade adaptativa, escolher qualidade gráfica e controlar a distância das sombras.

## Detalhes técnicos

- Reutilizar o cache espacial existente para evitar cálculos caros a cada quadro.
- Atualizar LOD em intervalos, não por frame.
- Limitar pixel ratio entre valores seguros para celular e desktop.
- Não gerar automaticamente versões simplificadas dos GLBs: LOD geométrico verdadeiro exige modelos LOD exportados. Nesta etapa, o ganho vem de sombras e resolução adaptativas, sem alterar a aparência dos modelos próximos.

## Validação

- Verificar sintaxe e compilação.
- Abrir o jogo e confirmar que a cena renderiza, o painel mostra os novos controles e não há erros no console.
