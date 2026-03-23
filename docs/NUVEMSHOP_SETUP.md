# Configuracao minima da Nuvemshop

## Variaveis de ambiente

- `NUVEMSHOP_APP_ID`
  - App ID do Partner Portal.
- `NUVEMSHOP_CLIENT_SECRET`
  - Secret da aplicacao.
- `NUVEMSHOP_APP_URL`
  - URL publica do app, por exemplo `https://seu-dominio.com`.
- `NUVEMSHOP_WEBHOOK_BASE_URL`
  - Base HTTPS usada para registrar webhooks. Normalmente igual a `NUVEMSHOP_APP_URL`.
- `SUPABASE_URL`
  - URL do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`
  - Chave service role para leitura e escrita resiliente no backend.
- `SUPABASE_ANON_KEY`
  - Opcional, usada como fallback quando service role nao estiver disponivel.
- `OMAFIT_WIDGET_URL`
  - URL do widget externo Omafit. Se nao informado, usa `https://omafit.netlify.app`.
- `OMAFIT_SUPPORT_URL`
  - Link de suporte mostrado no admin.
- `OMAFIT_SUPPORT_EMAIL`
  - Email usado no `User-Agent` da API da Nuvemshop.

## URLs sugeridas no Partner Portal

- Redirect URL:
  - `https://seu-dominio.com/auth/callback`
- App URL:
  - `https://seu-dominio.com/app.html`
- Preferences URL:
  - `https://seu-dominio.com/app.html?section=widget`
- Support URL:
  - `https://seu-dominio.com/app.html?section=dashboard`
- Store redact webhook:
  - `https://seu-dominio.com/api/webhooks/nuvemshop`
- Customer redact webhook:
  - `https://seu-dominio.com/api/webhooks/nuvemshop`
- Customer data request webhook:
  - `https://seu-dominio.com/api/webhooks/nuvemshop`

## Fluxo esperado

1. O lojista instala o app e a Nuvemshop redireciona para `/auth/callback`.
2. O backend troca o `code` por `access_token`, salva a sessao local e sincroniza a loja.
3. O backend registra webhooks essenciais.
4. O admin embutido em `app.html` carrega via Nexo, identifica a loja e consome as APIs internas.
