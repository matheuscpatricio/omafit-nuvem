# Omafit — Nuvemshop Integration

Nuvemshop application layer for **Omafit**, an AI SaaS platform for fashion e-commerce.

This project adapts Omafit's commerce infrastructure to Nuvemshop while preserving the same product experience across merchant administration, storefront integration, analytics and sizing workflows.

## What this repository demonstrates

- OAuth-based Nuvemshop application installation
- embedded merchant admin experience
- storefront integration through Nube SDK
- store and product synchronization
- webhook handling
- billing, analytics and merchant configuration workflows
- Supabase-backed application data
- portability of a production SaaS across commerce platforms

## Architecture

```text
Nuvemshop
   │
   ├── OAuth / Webhooks ─────► Node.js Backend
   │                              │
   │                              ├── Store synchronization
   │                              ├── Internal APIs
   │                              └── Supabase
   │
   ├── Embedded Admin ───────► React Admin App
   │
   └── Storefront ───────────► Nube SDK Integration
                                  │
                                  ▼
                              Omafit UX
```

## Main components

### `server.js`
Backend layer responsible for Nuvemshop OAuth, sessions, webhooks, internal APIs, store synchronization and Supabase integration.

### `src/home.ts`
Entry point for the embedded admin experience.

### `src/admin-app/`
React admin application covering dashboard, billing, widget configuration, analytics and sizing tables.

### `src/main.tsx`
Storefront integration using Nube SDK and real product context to expose Omafit inside the product-detail experience.

### `docs/PORTABILITY_MAP.md`
Documents how functionality from the Shopify implementation maps to Nuvemshop.

### `docs/NUVEMSHOP_SETUP.md`
Platform configuration and integration checklist.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required configuration includes Nuvemshop application credentials, public application/webhook URLs and Supabase credentials. Never commit production secrets.

## Application flow

1. Merchant installs Omafit from Nuvemshop.
2. Nuvemshop redirects to the OAuth callback.
3. The backend exchanges the authorization code, synchronizes the store and registers required webhooks.
4. The embedded admin consumes internal APIs for merchant configuration and analytics.
5. The storefront integration uses product context to expose the Omafit experience on product pages.

## Development commands

```bash
npm run dev
npm run start
npm run build
npm test
npm run test:coverage
npm run lint
npm run format
```

## About Omafit

Across its production platform, Omafit supports 20+ fashion stores and approximately 30K virtual try-ons per month. Its engineering stack spans TypeScript/JavaScript, Python, React, Node.js, PostgreSQL/Supabase, computer vision, LLM integrations and AWS infrastructure.

- Product: https://omafit.co
- Engineer: https://github.com/matheuscpatricio
