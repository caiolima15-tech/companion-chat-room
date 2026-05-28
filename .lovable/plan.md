## Objetivo

Tornar a criação de avatar mais fluida: nada de segundo login visível e um único botão nosso para salvar (em vez do "Next" do Avaturn).

## O que vai mudar

### 1. Esconder a tela de login do Avaturn (`public/index.html` + `public/styles.css`)

O iframe aponta para `hotmapavatar.avaturn.dev?lang=pt`. A tela de login do Avaturn aparece dentro dele. Como não controlamos o conteúdo (cross-origin), vamos fazer best-effort:

- Tentar passar parâmetros conhecidos do Avaturn que pulam autenticação quando disponíveis (ex.: `?lang=pt&hideLogin=1` ou parâmetros documentados do SDK iframe). Testamos via postMessage logando o que o iframe responde.
- Mostrar uma camada de loading nossa por cima do iframe nos primeiros segundos, escondendo qualquer flash de tela de login.
- Se o Avaturn salvar sessão (cookie próprio), a partir da segunda vez o login não aparece — orientar via UI: "Aguarde, abrindo editor…".

Importante avisar: como o iframe é de outro domínio, não conseguimos remover elementos internos via CSS/JS. Se o Avaturn exigir login obrigatório, a única forma 100% confiável de pular é usar a API key deles (opção que você descartou). Vou implementar o melhor que dá sem isso, e deixar comentado o ponto exato onde plugar a API key futuramente.

### 2. Botão "Salvar avatar" nosso (`public/index.html`, `public/app.js`, `public/styles.css`)

- Adicionar um botão fixo no rodapé do overlay do criador (`#avatarCreatorOverlay`): **"Salvar avatar e entrar"**.
- Ao clicar, dispara `iframe.contentWindow.postMessage({ type: 'avaturn_export' }, '*')` (e variações conhecidas: `{ action: 'export' }`, `{ command: 'finish' }`) para forçar o export. O listener atual de mensagens já captura o GLB que vier de volta.
- Estado do botão: desabilitado até o iframe sinalizar que está pronto (`iframeReady`/primeiro postMessage recebido).
- Loader visual no botão enquanto baixa/sobe o GLB. Sucesso → fecha overlay e seleciona o avatar automaticamente (já existe `selectedCharacterSlug = user:${id}` no fluxo).
- Mantemos como fallback escondido o "Importar .glb manualmente" que já existe.

### 3. Validação no preview

- Abrir o criador de avatar logado, confirmar que aparece tela de loading nossa, depois o editor.
- Clicar no nosso botão "Salvar avatar e entrar" e verificar no console se o postMessage de export é aceito pelo iframe (logamos a resposta).
- Se o comando de export não funcionar com nenhuma das variações, voltamos pra você com o log do que o Avaturn aceita — pode ser que essa versão só responda ao botão deles. Nesse caso a alternativa é a API key.

## Detalhes técnicos

- Listener `message` em `app.js` (linhas 866-924) já trata a resposta — não precisa mexer.
- Adicionar handshake: ao receber o primeiro postMessage do Avaturn, habilita nosso botão e esconde o loader.
- Sem mudanças de backend, banco ou auth.
