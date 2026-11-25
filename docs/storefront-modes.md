# Modos da Storefront Omafit

## O que o código faz hoje

`lib/storefront-sdk-mode.js` liga o NubeSDK em **qualquer tema que envie o nome** (`Morelia`, `Patagonia` ou outro). A loja demo de homologação está no tema **Morelia**, e o HTML desse tema já traz os slots `data-nubesdk-slot` (por exemplo `before_product_detail_add_to_cart`).

| Situação | Quem desenha o botão | Carrinho |
|----------|----------------------|----------|
| `storefront_sdk_enabled === true` (tema informado, ou loja na whitelist com tema vazio) | `main.min.js` (NubeSDK) | `cart:add`, quantidade 1 |
| flag falsa (requisição sem tema e loja fora de `OMAFIT_STOREFRONT_SDK_STORE_IDS`) | `storefront-legacy.min.js` | `LS.addToCartEnhanced` uma vez |

O script de calçados (`storefront-legacy-footwear.min.js`) só existe como fallback antigo. Com o SDK ligado ele não deve renderizar nem escutar o carrinho. Na homologação, **um único script** deve ficar ativo no Partner Portal: `main.min.js`.

Patagonia não é mais um requisito separado. Morelia não depende do bundle legado.

## NubeSDK (`src/main.tsx`)

- CTA nos slots `before_product_detail_add_to_cart` / `after_product_detail_add_to_cart`
- Modal com `Iframe` + `cart:add`
- Config via `GET /api/storefront/widget-config` na URL publica do app

URL no Partner Portal (um script só):

`https://SEU_DOMINIO/main.min.js`

## Legado (`src/storefront-legacy.ts`)

- Só injeta o botão quando `storefront_sdk_enabled` é falso
- Carrinho via `LS.addToCartEnhanced` (uma vez), com trava compartilhada entre scripts

Não registrar esta URL na homologação:

`https://SEU_DOMINIO/storefront-legacy.min.js`

## Homologacao

Loja demo no tema **Morelia** + um único script `main.min.js` + flag **Uses NubeSDK**. Não publicar `storefront-legacy.min.js` nem o bundle de calçados no portal.

## `storefront_sdk_enabled`

`GET /api/storefront/widget-config` retorna `storefront_sdk_enabled`:

| Parametro `theme` | Resultado |
|-------------------|-----------|
| qualquer nome (`morelia`, `patagonia`, …) | `true` |
| vazio e loja em `OMAFIT_STOREFRONT_SDK_STORE_IDS` | `true` |
| vazio e loja fora da whitelist | `false` — aí o legado injeta o CTA |

O `main.min.js` envia `theme` via `window.LS.theme.name`. Com a flag verdadeira ele renderiza o CTA em qualquer tema que tenha slot de PDP e remove o botão legado do DOM. O legado (e o de calçados) não injeta e não escuta o carrinho quando a flag é verdadeira ou quando `window.__omafitSdkActive` já foi marcado pelo SDK.
