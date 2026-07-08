# Stripe — billing Nuvemshop (Omafit)

Integração segura com **Stripe Checkout** (hosted) para planos pagos e **faturas** para excedente de try-on.  
Apenas lojas Nuvemshop (`shop_domain = nuvemshop/{storeId}`, `platform = nuvemshop`) são alteradas no Supabase.

## 1. Pré-requisitos

1. Conta Stripe (modo teste para desenvolvimento).
2. `docs/supabase_self_billing.sql` já executado.
3. `docs/supabase_stripe_billing.sql` executado no Supabase.
4. `OMAFIT_BILLING_MODE=self` (padrão — billing próprio do parceiro).

## 2. Produtos e preços no Stripe

No [Dashboard Stripe](https://dashboard.stripe.com/products), crie **um produto por plano** com preço recorrente mensal em **BRL**:

| Plano   | Variável de ambiente           | Sugestão |
|---------|--------------------------------|----------|
| Growth  | `STRIPE_PRICE_GROWTH_BRL`      | R$ 89/mês |
| Pro     | `STRIPE_PRICE_PRO_BRL`         | R$ 300/mês |
| On demand | `STRIPE_PRICE_ONDEMAND_BRL` | Grátis (opcional) |

Copie o **Price ID** (`price_...`) de cada preço.

> **Enterprise** não usa checkout automático — ative manualmente no admin.

## 3. Variáveis de ambiente

Adicione no Railway / Netlify (nunca no frontend):

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

STRIPE_PRICE_GROWTH_BRL=price_...
STRIPE_PRICE_PRO_BRL=price_...
# Opcional — ondemand é grátis e ativa direto no Supabase
STRIPE_PRICE_ONDEMAND_BRL=
STRIPE_PRICE_ENTERPRISE_BRL=
```

Chaves públicas **não** são necessárias no cliente — o checkout é hospedado pelo Stripe.

## 4. Webhook

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. URL: `https://SEU_DOMINIO/api/webhooks/stripe`
3. Eventos recomendados:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copie o **Signing secret** para `STRIPE_WEBHOOK_SECRET`.

### Teste local

```bash
stripe listen --forward-to localhost:8080/api/webhooks/stripe
```

Use o `whsec_...` exibido pelo CLI como `STRIPE_WEBHOOK_SECRET` local.

## 5. Fluxo do lojista

1. Admin Omafit → **Plano** → escolhe Growth ou Pro.
2. Redirecionamento para **Stripe Checkout** (cartão seguro, sem dados no servidor).
3. Após pagamento, webhook ativa o plano no Supabase (`billing_mode=stripe`).
4. **Gerenciar pagamento** abre o **Customer Portal** Stripe.
5. Try-ons excedentes: fatura automática se houver método de pagamento cadastrado.

## 6. Excedente (overage)

- Cada sessão extra acumula `pending_overage_amount` no Supabase.
- Com `billing_mode=stripe` e `stripe_customer_id` válido, o servidor tenta cobrar via **invoice** Stripe.
- Se a cobrança falhar, o saldo pendente permanece para nova tentativa ou cobrança manual.

## 7. Segurança

| Item | Implementação |
|------|----------------|
| Dados de cartão | Nunca no servidor — Stripe Checkout |
| Secret keys | Apenas `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` no backend |
| Webhook | Verificação de assinatura `stripe.webhooks.constructEvent` |
| Supabase | PATCH apenas em `shop_domain=nuvemshop/{storeId}` |
| Shopify | Linhas `.myshopify.com` **nunca** são alteradas |

## 8. Checklist de deploy

- [ ] SQL `supabase_stripe_billing.sql` executado
- [ ] Produtos/preços criados no Stripe
- [ ] Env vars configuradas no Railway
- [ ] Webhook apontando para `/api/webhooks/stripe`
- [ ] Teste: assinar Growth → retorno `?billing=success` → plano ativo
- [ ] Teste: portal de pagamento abre corretamente
- [ ] Teste: try-on excedente gera invoice (modo teste)

## 9. Troubleshooting

| Sintoma | Ação |
|---------|------|
| "Stripe não configurado" | Defina `STRIPE_SECRET_KEY` |
| "Price ID ausente" | Configure `STRIPE_PRICE_*_BRL` |
| Webhook 401 | Verifique `STRIPE_WEBHOOK_SECRET` |
| Plano não ativa após pagamento | Confira logs do webhook; metadata `store_id` no checkout |
| Excedente não cobrado | Cliente precisa de método de pagamento no Stripe |
