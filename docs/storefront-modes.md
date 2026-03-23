# Modos da Storefront Omafit

O storefront da Omafit na Nuvemshop agora funciona em dois modos:

- `Morelia` e outros temas legados:
  usa o bundle `src/storefront-legacy.ts`, que injeta o botão abaixo da compra, abre `widget.html` em modal e conversa com a página via `postMessage` para tentar adicionar o item ao carrinho com o tamanho recomendado.

- `Patagonia`:
  mantém o caminho `src/main.tsx` com `NubeSDK`, mas agora aponta para o mesmo `widget.html`, preservando a experiência do widget exclusivo da Nuvemshop sem depender do widget Shopify.

O novo widget React fica em `src/widget.tsx` e `src/widget-app/`.

- `src/widget-app/WidgetPage.tsx`:
  controla as etapas do fluxo, carrega a configuração pública da loja, usa as tabelas salvas no painel e faz o polling do try-on.

- `src/widget-app/sizeCalculation.ts`:
  reaproveita a lógica de recomendação de tamanho para transformar as tabelas do painel em uma sugestão prática para o cliente.

- `server.js`:
  expõe `widget.html` e faz o proxy dos endpoints `tryon`, `tryon-status` e `validate-size`, para o widget não depender de chaves públicas no navegador.
