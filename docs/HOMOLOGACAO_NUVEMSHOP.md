# Homologação Nuvemshop — Omafit (App 23607)

Checklist operacional para enviar o app à homologação e publicação na App Store Nuvemshop.

**Produção:** `https://omafit-nuvem-production.up.railway.app`  
**Loja demo atual:** `6994912` — `arrascaneta.lojavirtualnuvem.com.br`

---

## 1. Partner Portal (obrigatório)

No [Partner Portal](https://partners.nuvemshop.com.br), app **23607**:

| Campo | Valor |
|-------|-------|
| **App URL** | `https://omafit-nuvem-production.up.railway.app/app.html` |
| **Redirect URL** | `https://omafit-nuvem-production.up.railway.app/auth/callback` |
| **Preferences URL** | `https://omafit-nuvem-production.up.railway.app/app.html?section=widget` |
| **Support URL** | `https://omafit-nuvem-production.up.railway.app/app.html?section=dashboard` |
| **Store redact webhook** | `https://omafit-nuvem-production.up.railway.app/api/webhooks/nuvemshop` |
| **Customer redact webhook** | `https://omafit-nuvem-production.up.railway.app/api/webhooks/nuvemshop` |
| **Customer data request** | `https://omafit-nuvem-production.up.railway.app/api/webhooks/nuvemshop` |
| **Script storefront (NubeSDK)** | `https://omafit-nuvem-production.up.railway.app/main.min.js` |
| **Uses NubeSDK** | Ativado |
| **Billing no Portal** | Grátis + **Possui vendas no aplicativo** |

### Permissões OAuth

- `read_products`, `read_content`, `read_orders`, `write_scripts` (já ativas na loja teste).

Após alterar permissões: **desinstalar e reinstalar** o app na loja demo, depois **Sincronizar loja** no admin Omafit.

---

## 2. Loja demo para homologação

A loja demo está no tema **Morelia**. O NubeSDK desenha o CTA nesse tema: o HTML da PDP já tem `data-nubesdk-slot`. Patagonia não é obrigatório.

O código liga `storefront_sdk_enabled` para qualquer tema com nome (`lib/storefront-sdk-mode.js`). O script legado só entra quando a API devolve a flag falsa.

### Scripts do Partner Portal

Na vitrine de `arrascaneta` (nov/2026) a Nuvemshop injetava **dois** scripts `onfirstinteraction`:

| URL vista na loja | O que é | Ação |
|-------------------|---------|------|
| `https://apps-scripts.tiendanube.com/omafit/omafit/3.js?versionId=dqXkLfeTQuyyR6M1E2Rmt3v1Ct0CiuQ9` | Cópia congelada do bundle legado (`OmafitLegacyStorefront`). Não consulta `/api/storefront/product-categories`, zera `excluded_collections` no render em cache e, no Morelia, continua clicando em Comprar. | **Remover** (ou substituir). Provável candidato: `Omafit #8130` ou um upload antigo marcado como NubeSDK. |
| `https://omafit-nuvem-production.up.railway.app/storefront-legacy.min.js?v=20260323-legacy1` | Legado servido pelo app. Some quando o Railway está no ar e soma um segundo add ao carrinho se o SDK também estiver ativo. | **Remover** do portal. |

Deixar **um** script NubeSDK, fora do modo dev, com src exatamente:

`https://omafit-nuvem-production.up.railway.app/main.min.js`

| Script no portal | Ação |
|------------------|------|
| `WIdget Omafit #8546` (NubeSDK, produção) | **Manter** se o src for `main.min.js`. Se o src for o `3.js` da Tiendanube, trocar a URL e republicar. |
| `WIdget Omafit 2 #8548` (NubeSDK dev) | **Remover**. Um segundo app SDK também dispara `cart:add` (2 unidades). |
| `Omafit #8130` | **Remover** se apontar para `storefront-legacy.min.js` ou para o `3.js`. |
| `Widget Calçados #5578` | **Remover**. Bundle de calçados sem checagem de categoria e com ponte de carrinho própria. |

O dono confirma o src de cada linha no portal; os ids acima são os nomes enviados na revisão, não um campo que a vitrine devolve.

### Passos na loja demo

1. Manter o tema **Morelia**.
2. No portal, deixar só `main.min.js` (tabela acima) e **Uses NubeSDK** ativo.
3. Ter **pelo menos 1 produto de vestuário** e **1 de calçado** (ex.: tênis na coleção `tenis`) com fotos e variantes de tamanho.
4. No admin Omafit:
   - **Sincronizar loja**
   - Configurar **Widget** (CTA ativo, texto “Assistente inteligente”)
   - Excluir a categoria **Acessórios** (o admin grava id, handle e nome)
   - Criar **tabela de medidas** vinculada à coleção

### Teste na PDP (Morelia)

- [ ] Um único botão Omafit (sem segundo botão legado ou de calçados)
- [ ] Produto da categoria excluída (e de subcategoria dela) **não** mostra o widget
- [ ] Produto de outra categoria mostra o botão
- [ ] Modal abre com widget (`widget.html` ou `widget-footwear.html`)
- [ ] Adicionar ao carrinho entra **1** unidade

O legado `storefront-legacy.min.js` continua no repositório só para loja sem tema na requisição e fora da whitelist. Não registrar esse arquivo no portal da homologação.

---

## 3. Variáveis Railway (produção)

| Variável | Valor esperado |
|----------|----------------|
| `NUVEMSHOP_APP_URL` | `https://omafit-nuvem-production.up.railway.app` |
| `OMAFIT_BILLING_MODE` | `self` |
| `OMAFIT_SUPPORT_URL` | `https://omafit-nuvem-production.up.railway.app/app.html?section=dashboard` |
| `OMAFIT_WIDGET_URL` | `https://omafit-nuvem-production.up.railway.app/widget.html` |
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_PRICE_*` | Price IDs **live** (não teste) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret do webhook **live** |
| `OMAFIT_WHATSAPP_PROXY_SECRET` | Igual ao secret no Supabase Edge Functions |
| `WHATSAPP_CRON_SECRET` | Igual ao Supabase + Netlify (cron worker e bill-pending) |
| `OMAFIT_STOREFRONT_SDK_STORE_IDS` | `6994912` (whitelist homolog se tema ainda não for Patagonia) |

Validação rápida:

```
GET https://omafit-nuvem-production.up.railway.app/api/health
GET https://omafit-nuvem-production.up.railway.app/api/billing/debug?store_id=6994912&store_url=arrascaneta.lojavirtualnuvem.com.br
```

Esperado: `hasStoreRecord: true`, `selfBillingReady: true`, `webhooksReady: true`.

---

## 4. Stripe (live)

1. Dashboard Stripe → modo **Live** → Webhooks.
2. Endpoint: `https://omafit-nuvem-production.up.railway.app/api/webhooks/stripe`
3. Eventos: `checkout.session.completed`, `customer.subscription.*`, `invoice.*` (conforme `lib/stripe-billing.js`).
4. Copiar **Signing secret** para `STRIPE_WEBHOOK_SECRET` no Railway.

---

## 5. Diagrama de arquitetura (anexar na submissão)

```mermaid
flowchart TB
  subgraph Loja["Loja Nuvemshop"]
    PDP[PDP Morelia]
    Admin[Nuvemshop Admin iframe]
  end

  subgraph Omafit["Omafit App Railway"]
    AppHTML[app.html + home.min.js]
    MainJS[main.min.js NubeSDK]
    Widget[widget.html]
    API[server.js APIs]
  end

  subgraph Ext["Serviços externos"]
    Supabase[(Supabase)]
    Stripe[Stripe Checkout]
    Meta[Meta WhatsApp API]
  end

  Admin --> AppHTML
  AppHTML --> API
  PDP --> MainJS
  MainJS --> API
  MainJS --> Widget
  Widget --> Supabase
  API --> Supabase
  API --> Stripe
  API --> Meta
```

---

## 6. Roteiro de vídeo (2–4 min)

1. Instalar app na loja demo (OAuth).
2. Abrir admin Omafit → Dashboard → **Sincronizar loja**.
3. Aba **Widget**: ativar, escolher posição e texto do CTA.
4. Aba **Tabelas**: mostrar tabela de medidas.
5. Aba **Plano**: assinar Growth (redirect Stripe) ou On-Demand.
6. Abrir PDP no tema Morelia → clicar **Assistente inteligente**.
7. Usar provador / tamanho recomendado → adicionar ao carrinho.
8. (Opcional) Analytics e Try On Marketing.

---

## 7. FAQs

O documento no formato exigido pela Nuvemshop está em `docs/FAQ_NUVEMSHOP_TEMPLATE_PREENCHIDO.md` e `docs/FAQ_NUVEMSHOP_TEMPLATE_PREENCHIDO.docx` (template “Marketing e demais categorias” + Guia Tutorial de Instalação). Campos que o repositório não confirma estão marcados como `[PREENCHER]`.

Resumo para o portal:

**O que o Omafit faz?**  
Provador virtual e recomendação de tamanho na página do produto, reduzindo devoluções e aumentando conversão.

**Preciso de conhecimento técnico?**  
Não. Instale o app, configure widget e tabelas de medidas no painel Omafit.

**Como é a cobrança?**  
Modelo freemium: plano On-Demand gratuito com sessões incluídas; planos pagos (Growth, Pro) via Stripe no painel do app.

**Quais temas são suportados na vitrine?**  
NubeSDK em qualquer tema que envie o nome, incluindo **Morelia** (loja demo). O script legado só cobre o caso em que a API desliga o SDK.

**O app acessa dados sensíveis?**  
Apenas dados necessários: produtos, pedidos (para billing de uso) e configurações da loja via OAuth. Imagens do try-on são processadas para recomendação de tamanho.

**Como cancelar?**  
Desinstale o app na Nuvemshop ou cancele a assinatura no portal Stripe (aba Plano).

**Suporte**  
`contato@omafit.co` — painel em `app.html?section=dashboard`.

---

## 8. Política de privacidade (resumo)

Publicar em `https://omafit.co/privacidade` (ou URL indicada no Portal):

- Dados coletados: store_id, domínio, produtos, configurações do widget, métricas de uso de try-on, dados de billing.
- Finalidade: operar provador virtual, billing e suporte.
- Compartilhamento: Supabase (infra), Stripe (pagamentos), Meta (WhatsApp Marketing opcional).
- Retenção: conforme contrato e obrigações legais; webhooks LGPD (`store/redact`, `customers/redact`) implementados.
- Contato: `contato@omafit.co`.

---

## 9. O que enviar na homologação

- [ ] Link da loja demo (Patagonia, app instalado)
- [ ] Vídeo do fluxo completo
- [ ] Screenshots: admin (Dashboard, Widget, Plano) + PDP com botão Omafit
- [ ] Diagrama de arquitetura (seção 5)
- [ ] FAQs (seção 7)
- [ ] URL de política de privacidade
- [ ] Credenciais de teste (se solicitado): login loja demo + nota de que billing usa Stripe test/live conforme ambiente

---

## 10. Status técnico (última verificação)

| Item | Status |
|------|--------|
| OAuth + webhooks | OK |
| Admin Omafit | OK |
| Billing self + Stripe live | OK |
| `nuvemshop_stores` sincronizado | OK (após Sincronizar loja) |
| Tema Morelia + um script `main.min.js` | **Ação manual no portal** |
| Artefatos Portal (vídeo, FAQs, privacidade) | **Preencher no Portal** |
