# Modos da Storefront Omafit

## Temas Nuvemshop

| Tema | Script | Modelo |
|------|--------|--------|
| **Patagonia** | `main.min.js` | NubeSDK (obrigatorio na homologacao) |
| **Morelia e demais** | `storefront-legacy.min.js` | Script legado ate a plataforma liberar SDK em todos os temas |

A documentacao oficial do NubeSDK indica que o storefront via SDK funciona no tema **Patagonia**. Lojas em outros temas precisam do bundle legado (sem manipulacao direta no admin — script apontando para o app).

## NubeSDK (`src/main.tsx`)

- CTA nos slots `before_product_detail_add_to_cart` / `after_product_detail_add_to_cart`
- Modal com `Iframe` + `cart:add`
- Config via `GET /api/storefront/widget-config` na URL publica do app

URL no Partner Portal (Patagonia):

`https://SEU_DOMINIO/main.min.js`

## Legado (`src/storefront-legacy.ts`)

- Injeta botao na PDP para temas sem suporte ao NubeSDK (ex.: Morelia)
- Usa `postMessage` e formulario da loja para carrinho

URL no campo de scripts da loja / tema (Morelia):

`https://SEU_DOMINIO/storefront-legacy.min.js`

## Homologacao

Para homologacao Nuvemshop: loja demo com tema **Patagonia** + `main.min.js` + flag **Uses NubeSDK**.

O legado permanece apenas para compatibilidade com temas antigos em producao.
