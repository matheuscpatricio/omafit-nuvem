# Omafit Nuvemshop

Este projeto e a adaptacao do app Omafit da Shopify para a Nuvemshop, mantendo o app Shopify original intacto como referencia.

## O que existe aqui

- `server.js`
  - Camada backend local com OAuth da Nuvemshop, sessoes, webhooks, APIs internas, sync de loja e integracao com Supabase.
- `src/home.ts`
  - Entrada do admin embutido via Nexo.
- `src/admin-app/`
  - Shell React do admin com dashboard, billing, widget, analytics e tabelas de medidas.
- `src/main.tsx`
  - Integracao storefront via Nube SDK usando contexto real de produto.
- `docs/PORTABILITY_MAP.md`
  - Mapa do que foi reaproveitado do app Shopify.
- `docs/NUVEMSHOP_SETUP.md`
  - Checklist de configuracao da plataforma.

## Setup local

1. Copie `.env.example` para `.env.local`.
2. Preencha pelo menos:
   - `NUVEMSHOP_APP_ID`
   - `NUVEMSHOP_CLIENT_SECRET`
   - `NUVEMSHOP_APP_URL`
   - `NUVEMSHOP_WEBHOOK_BASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Instale dependencias:
   - `npm install`
4. Rode em desenvolvimento:
   - `npm run dev`
5. Se precisar de URL publica:
   - `npm run dev:public`

O servidor carrega automaticamente `.env.local` e `.env` quando presentes.

## Fluxo principal

1. O lojista instala o app.
2. A Nuvemshop redireciona para `/auth/callback`.
3. O backend troca `code` por `access_token`, sincroniza a loja e registra webhooks.
4. O admin embutido em `app.html` consome as APIs internas para operar o painel.
5. O storefront usa `src/main.tsx` para exibir o CTA do Omafit na PDP.

## Scripts

- `npm run dev`
  - Build em watch + servidor local.
- `npm run start`
  - Sobe apenas o servidor.
- `npm run build`
  - Gera os bundles e os assets HTML.
- `npm test`
  - Executa os testes.
- `npm run test:watch`
  - Executa os testes em watch mode.
- `npm run test:coverage`
  - Gera cobertura de testes.
- `npm run format`
  - Formata os arquivos em `src`.
- `npm run lint`
  - Roda o Biome em `src`.

## Observacoes

- O projeto Shopify em `C:\Users\User\Documents\omafit` nao deve ser alterado.
- Os dados locais de sessao ficam em `.omafit-data/`.
- Para usar webhooks de verdade, a URL publica precisa ser HTTPS.