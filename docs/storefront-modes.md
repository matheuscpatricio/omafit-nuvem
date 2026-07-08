# Modos da Storefront Omafit

O storefront na Nuvemshop usa **apenas NubeSDK** (`src/main.tsx`), conforme exigido para homologacao a partir de junho/2026.

## Arquitetura

- `src/main.tsx`
  - App NubeSDK: renderiza o CTA na PDP, abre o widget em modal (`Iframe`) e integra com o carrinho via `cart:add`.
- `src/shared/nuvemshopStorefront.ts`
  - Configuracao publica da loja, montagem da URL do widget e roteamento roupa vs calçados.
- `src/widget.tsx` + `src/widget-app/`
  - Experiencia do provador virtual dentro do iframe.
- `server.js`
  - Serve `widget.html` / `widget-footwear.html` e faz proxy dos endpoints de try-on.

## Roteamento roupa vs calçados

O SDK escolhe automaticamente:

- `/widget.html` — vestuario e acessorios
- `/widget-footwear.html` — quando o handle da coleção ou do produto bate com tabelas `footwear` do admin

A deteccao usa a URL da pagina (`/collections/{slug}/...`) e o handle do produto exposto pelo NubeSDK — sem scripts legados no DOM.

## Deploy na Nuvemshop

No Partner Portal, o script da loja deve apontar para:

`https://SEU_DOMINIO/main.min.js`

Ative a flag **Uses NubeSDK** no painel do app.

## Carrinho

Quando o cliente confirma o tamanho no widget, o iframe envia `omafit-add-to-cart-request` e o app responde com `nube.send("cart:add")`, sem manipular formularios da tema.
