# Configuracao minima da Nuvemshop

## Variaveis de ambiente

### OAuth e API

- `NUVEMSHOP_APP_ID`
  - App ID do Partner Portal.
- `NUVEMSHOP_CLIENT_SECRET`
  - Secret da aplicacao. Tambem usado na Billing API (Partner Actions).
- `NUVEMSHOP_APP_URL`
  - URL publica do app, por exemplo `https://seu-dominio.com`.
- `NUVEMSHOP_WEBHOOK_BASE_URL`
  - Base HTTPS usada para registrar webhooks. Normalmente igual a `NUVEMSHOP_APP_URL`.

### Billing (cobranca nativa Nuvemshop)

- `NUVEMSHOP_BILLING_CONCEPT_CODE` (opcional)
  - Identificador da loja na Billing API. Normalmente chega via webhook `subscription/updated`.
  - Use como fallback se a loja ja tiver assinatura mas o webhook ainda nao tiver sido processado.
- `OMAFIT_BILLING_MODE`
  - `auto` (padrao): tenta billing nativo; se `concept_code` estiver ausente, grava plano apenas no Supabase.
  - `nuvemshop`: exige billing nativo — falha ao trocar plano sem `concept_code`.
  - `self`: desativa cobranca na Nuvemshop; plano e uso ficam so no Supabase.
- `USD_TO_BRL_RATE`
  - Taxa de conversao para precificar planos em BRL (padrao: `5.7`).

### Supabase e widget

- `SUPABASE_URL`
  - URL do projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`
  - Chave service role para leitura e escrita resiliente no backend.
- `SUPABASE_ANON_KEY`
  - Opcional, usada como fallback quando service role nao estiver disponivel.
- `OMAFIT_WIDGET_URL`
  - URL publica do widget da Nuvemshop. O formato esperado e `https://seu-dominio.com/widget.html`.
- `OMAFIT_SUPPORT_URL`
  - Link de suporte mostrado no admin.
- `OMAFIT_SUPPORT_EMAIL`
  - Email usado no `User-Agent` da API da Nuvemshop.

## URLs sugeridas no Partner Portal

- Script da loja (storefront NubeSDK):
  - `https://seu-dominio.com/main.min.js`
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

Ative a flag **Uses NubeSDK** no Partner Portal. O storefront nao usa mais scripts legados no DOM.

## Billing no Partner Portal

### Opcao recomendada: Gratis + vendas no aplicativo

Se no Portal voce escolheu **Gratis** com **Possui vendas no aplicativo**, o billing e **proprio do parceiro**:

1. Defina `OMAFIT_BILLING_MODE=self` no Railway (padrao do projeto).
2. Execute `docs/supabase_self_billing.sql` no Supabase.
3. Planos e mensalidades sao geridos no admin Omafit (Supabase).
4. Cada sessao de try-on **excedente** incrementa `pending_overage_amount` e gera linha em `billing_usage_charges`.
5. O `concept_code` da Nuvemshop **nao e necessario** nesse modelo.

### Opcao alternativa: billing nativo Nuvemshop

1. Escolha **Valor mensal** ou **Valor unico** no Portal.
2. O lojista aceita o plano no fluxo de instalacao da Nuvemshop.
3. A Nuvemshop envia `subscription/updated` com `concept_code` e `service_id`.
4. Defina `OMAFIT_BILLING_MODE=nuvemshop` ou `auto`.
5. Excedente de try-ons gera charge via `POST /services/{app_id}/charges`.

### Planos no admin Omafit

| Plano | external_reference | Mensalidade (USD base) |
|-------|-------------------|------------------------|
| On demand | `omafit-ondemand-brl` | $0 + uso |
| Growth | `omafit-growth-brl` | $89 |
| Pro | `omafit-pro-brl` | $300 |
| Enterprise | `omafit-enterprise-brl` | $600 |

Precos em BRL sao calculados com `USD_TO_BRL_RATE`.

## Diagnostico de billing

Use o endpoint de debug para validar a configuracao de uma loja:

```
GET /api/billing/debug?store_id={id}&store_url={dominio}
```

Resposta inclui:

- `effectiveConceptCode` e `effectiveServiceId`
- `subscription` consultada na Billing API
- `webhookState` (incluindo `subscription/updated`)
- `partnerApiProbe` (teste de autenticacao Partner Actions)
- `checks` com `selfBillingReady`, `chargesReady`, `issues` e `recommendations`

Exemplo:

```
https://seu-dominio.com/api/billing/debug?store_id=6994912&store_url=arrascaneta.lojavirtualnuvem.com.br
```

## Fluxo esperado

1. O lojista instala o app e a Nuvemshop redireciona para `/auth/callback`.
2. O backend troca o `code` por `access_token`, salva a sessao e sincroniza a loja.
3. O backend registra webhooks essenciais (`subscription/updated`, `order/paid`, etc.).
   - O evento `order/paid` exige o escopo OAuth `read_orders` (ou `write_orders`) no app.
   - Se o escopo nao estiver ativo no Partner Portal, o sync mostrara falha em `order/paid`.
   - Correcao: Partner Portal > App > Permissoes > ativar `read_orders`, salvar, desinstalar e reinstalar o app na loja, depois **Sincronizar loja** no admin.
4. A Nuvemshop envia `subscription/updated` com o `concept_code` da loja.
5. O admin embutido em `app.html` carrega via Nexo, identifica a loja e consome as APIs internas.
6. Troca de plano no admin atualiza assinatura na Nuvemshop; uso excedente gera charges automaticas.
