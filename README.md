# Ozon Seller Studio on Next.js

This migration keeps the existing dashboard workflows working while Next.js takes over the application entry point and same-origin API boundary. The existing local Node service remains a compatibility backend during the first migration stage; its route handlers and business rules are unchanged.

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open `http://127.0.0.1:3000`.
4. Configure Ozon credentials through **API 设置** in the dashboard.

The Next.js app listens on `127.0.0.1:3000`. Its local compatibility API listens on `127.0.0.1:8788` by default to avoid colliding with an existing dashboard; `HOST` and `PORT` can be set in `legacy-api/.env`. `LEGACY_API_ORIGIN` can point the Next.js proxy to a different local backend address.

## Data and safety

Only application source, UI assets, and automated tests were migrated. Existing credentials, registered stores, caches, reminder history, and diagnostic data were not copied. New credentials and operational state are stored under `legacy-api/` and excluded from version control. The service binds to loopback by default.

The UI still contains workflows that can modify Ozon data or contact buyers. Read-only startup and test checks are safe; any manual use of write actions continues to require the existing in-app confirmations.

## Migration status

The first stage establishes a Next.js App Router shell and a same-origin, origin-checked API proxy while preserving all existing business behavior. The dashboard is hosted as a legacy asset for now; its screens and API handlers can be migrated incrementally with the existing Node tests as regression coverage.

Run `npm run test:legacy` to execute the migrated backend tests.
