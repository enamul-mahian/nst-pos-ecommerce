# New Singapur Telecom (NST) — Stable Combined Source

This repository is the stable combined baseline prepared on 2026-10-08 from:

- the current VPS/production archive (stable backend and deployment behavior), and
- the newer local frontend source (latest login/branding/UI work).

## Source of truth

- `backend/` — production Laravel backend, with only two reviewed local updates merged: central UI settings cleanup and runtime business-timezone support.
- `frontend-admin/` — newer local admin/POS source, plus source-level restoration of production EMI sale metadata and Chatbox/WhatsApp settings.
- `frontend-customer/` — newer local storefront/customer/supplier source, with the production Chatbox/WhatsApp widget copied into `public/chatbox/`.
- `deployment/production-public-reference/` — read-only snapshot of the production web root from the supplied VPS archive. Do not edit compiled JS here as source.

## Protected production functionality

The following remain production versions and must not be replaced by older local backend copies:

- ZKTeco / ADMS attendance ingestion and rebuild logic
- sale/EMI backend and invoice payment metadata
- Chatbox + WhatsApp backend
- Custom Reports backend/migrations
- production API routes
- production Composer dependencies

## Newer local functionality retained

- lightweight admin login split
- redesigned customer login
- redesigned supplier login
- central `ui_brand.logoUrl` branding flow
- dynamic favicon logic
- newer product chunk strategy
- latest local customer/admin UI source

## Additional source-level compatibility work

- POS `SaleForm.jsx` now sends `emi_bank_name`, `emi_months`, and `emi_reference` to the preserved production backend.
- Admin Settings now has Chatbox + WhatsApp Business controls compatible with the preserved production backend.
- Customer `public/chatbox/` uses the newer production widget/CSS supporting separate NST live chat and WhatsApp buttons.
- Admin Vite config keeps React framework code out of product chunks so the login entry does not need a product-page chunk for React runtime code.

## Local development

Backend:

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

Admin/POS:

```bash
cd frontend-admin
npm ci
npm run dev
```

Customer/storefront:

```bash
cd frontend-customer
npm ci
npm run dev
```

## Production paths

Current production layout:

- Laravel app: `/opt/newsingapurtele/nst_app`
- Web root: `/opt/newsingapurtele/public_html`
- Main site: `https://newsingapurtele.com`
- POS: `https://newsingapurtele.com/pos/`

Do not deploy by copying the whole local backend over production. Build/test this combined source and deploy only a reviewed release.

## Git workflow

Recommended:

- `main` = this stable combined baseline
- `develop` = ongoing integration
- `feature/*` = individual changes

GitHub Actions in `.github/workflows/ci.yml` validates PHP and builds both frontends after push/PR.
