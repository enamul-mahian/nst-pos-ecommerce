# NST Stable Merge Report — 2026-10-08

## Baseline decision

Production backend is the authoritative baseline because it contains stable production-only Attendance/ADMS, EMI, Chatbox/WhatsApp, Custom Reports, migrations, and Composer dependencies. Local frontend source is the authoritative baseline for the recent UI/branding work.

## Backend

Production versions preserved for critical files including:

- `app/Http/Controllers/Api/SaleController.php`
- `app/Models/SalePayment.php`
- `app/Services/InvoiceDocumentService.php`
- `app/Http/Controllers/Api/PublicChatboxController.php`
- `app/Http/Controllers/Api/ZktecoAttendanceController.php`
- `app/Services/ZktecoAttendanceService.php`
- `app/Console/Commands/NstAttendanceRebuild.php`
- `app/Services/NstAttendanceActionService.php`
- `routes/api.php`
- `composer.json`
- `composer.lock`

Production-only migrations/services for Attendance, Custom Reports, EMI sale-payment fields and Chatbox/WhatsApp are present.

Reviewed local backend changes merged:

- `app/Http/Controllers/Api/SettingsController.php` — central `ui_brand` public settings and timezone options/validation.
- `app/Providers/AppServiceProvider.php` — applies saved business timezone at runtime with safe fallback behavior.

Production `config/app.php` remains unchanged, retaining `APP_TIMEZONE` / `Asia/Dhaka` fallback.

## Admin/POS frontend

Local newer source retained:

- `src/main.tsx` lightweight login bootstrap
- `src/LoginApp.jsx`
- `src/pages/Login.jsx`
- `src/components/system/NstBrand.jsx`
- central branding/favicons and current UI source

Compatibility additions:

- `src/pages/sales/SaleForm.jsx` restores production EMI transaction metadata at source level.
- `src/pages/settings/ChatToolsSettings.jsx` provides Chatbox + WhatsApp Business admin controls.
- `src/pages/settings/SettingsPage.jsx` integrates Chat Tools.
- `vite.config.js` isolates React runtime from manually split product chunks.

## Customer/storefront frontend

Local newer source retained, including:

- redesigned customer login
- redesigned supplier login
- `src/hooks/useNstCentralLogo.ts`
- `src/cms/favicon.ts`
- iPhone 18 Pro Max login artwork/assets

Production Chatbox/WhatsApp widget source copied to:

- `public/chatbox/nst-imessage-chatbox.js`
- `public/chatbox/nst-imessage-chatbox.css`

## Validation completed

- Frontend changed files: TypeScript compiler parser reports no syntax errors.
- Backend: all 374 PHP source files pass `php -l`.
- Critical production backend files were SHA-256 compared against the supplied production archive and remain unchanged.
- Non-empty environment secrets were not found in the repository; only `.env.example` files are included.

## Build note

A full local `npm ci` build could not be completed in the preparation environment because access to the npm registry timed out. The repository includes GitHub Actions CI to run clean `npm ci` + build for both frontends after push. Do not deploy a newly built frontend until that CI is green.

## Deployment rule

Treat `deployment/production-public-reference/` as a reference/rollback snapshot, not editable source. Source changes belong in `frontend-admin/`, `frontend-customer/`, or `backend/`.
