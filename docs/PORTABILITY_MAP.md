# Mapa de Portabilidade Omafit

Este documento registra o que foi reaproveitado do app Shopify como referencia para a versao Nuvemshop, sem alterar o projeto original em `C:\Users\User\Documents\omafit`.

## Reutilizacao quase direta

- `app/translations/*.json`
  - Base de copy e labels do admin.
  - Adaptado para a camada de i18n do admin Nuvemshop.
- `app/contexts/AppI18n.jsx`
  - A logica de `getNested`, `interpolate` e fallback de idioma foi portada para `src/admin-app/i18n.tsx`.
- Estrutura de modulos do admin
  - Dashboard, billing, widget, analytics e size chart viraram secoes do admin embutido da Nuvemshop.

## Reutilizacao com adaptacao

- `app/routes/app._index.jsx`
  - A ideia de dashboard e cards de resumo foi portada para o dashboard do admin Nuvemshop.
- `app/routes/app.billing.jsx`
  - A visualizacao de plano, uso e orientacao comercial foi adaptada para `billing`.
- `app/routes/app.widget.jsx`
  - As configuracoes do widget foram mantidas como conceito, mas agora usando categorias e contexto da Nuvemshop.
- `app/routes/app.analytics.jsx`
  - As agregacoes de performance, qualidade e inteligencia foram simplificadas e adaptadas para fontes da Nuvemshop e Supabase.
- `app/routes/app.size-chart.jsx`
  - A estrutura de tabelas por colecao e genero foi portada para o admin Nuvemshop.
- `app/routes/api.*`
  - Contratos internos foram reinterpretados como endpoints do `server.js`.

## Reescrita obrigatoria

- `app/shopify.server.js`
  - Substituido por uma camada de OAuth, persistencia de sessao, cliente REST e webhooks da Nuvemshop.
- `auth.*`, `webhooks.*`, `billing-*`
  - Reescritos para o modelo de autenticacao e eventos da Nuvemshop.
- `extensions/omafit-theme/*`
  - O widget de loja foi reimplementado com Nube SDK e dados do contexto `location.page.product`.
- `app/routes/app.jsx`, `root.jsx`, `entry.server.jsx`
  - O shell embedded da Shopify foi trocado por um admin integrado via Nexo em `src/home.ts`.

## Contratos de dados

- O identificador canonicamente usado pela versao Nuvemshop e `nuvemshop/{store_id}`.
- Quando existe compatibilidade com tabelas legadas, esse identificador e salvo em campos historicamente chamados de `shop_domain`.
- A camada de servidor tenta ler e escrever primeiro no modelo Nuvemshop e depois aplica fallback para estruturas legadas do Omafit.

## Objetivo da implementacao

- Manter o projeto Shopify intacto.
- Concentrar a migracao inteira em `omafit-nuvemshop`.
- Preservar o maximo possivel da regra de negocio e da modelagem de dados do Omafit.
