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

## `storefront_sdk_enabled`

`GET /api/storefront/widget-config` retorna `storefront_sdk_enabled` para o cliente NubeSDK (`main.min.js`) saber se deve renderizar o CTA:

| Parametro `theme` | Resultado |
|-------------------|-----------|
| `patagonia` (case-insensitive) | `true` |
| qualquer outro tema (ex.: `morelia`) | `false` |
| ausente | `false`, exceto lojas em `OMAFIT_STOREFRONT_SDK_STORE_IDS` (whitelist de homolog) |

O script legado envia `theme` via `window.LS.theme.name`. O `main.min.js` limpa os slots do NubeSDK e nao renderiza o CTA quando `storefront_sdk_enabled` e `false`, evitando botao duplicado em temas como Morelia.
