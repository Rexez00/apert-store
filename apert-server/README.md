# APERT server (Vendure)

Headless commerce backend for the APERT single-product store.
SQLite file DB (`vendure.sqlite`) — no Docker or external services needed.

## Run (two terminals, or background)

```powershell
cd apert-server
node dist/index.js        # API + storefront on http://localhost:3002
node dist/index-worker.js # job queue (search index, etc.)
```

- Storefront: http://localhost:3002/ (serves the workspace `index.html`)
- Payment page: http://localhost:3002/checkout.html
- Shop API: http://localhost:3002/shop-api
- Admin API: http://localhost:3002/admin-api
- API explorer: http://localhost:3002/graphiql/shop and /graphiql/admin
- Assets: http://localhost:3002/assets/...
- Admin login: `superadmin` / `superadmin` (change `SUPERADMIN_*` in `.env`)

## Seed / verify

```powershell
node scripts/seed.mjs        # idempotent: channel, tax, free shipping, demo payment, product
node scripts/test-order.mjs  # places a real test order end-to-end (asserts PASS + order code)
```

## Catalog (seeded)

- Product `apert-fisheye-170` — variant `APERT-FISHEYE-170`
- Price $4.99 (499), compare-at $8.99 via `customFields.listPrice`, stock 100
- 4 assets, featured = lens studio shot; USD, tax-included, 0% tax
- Shipping: `free-shipping` ($0, always eligible); payment: `apert-demo-card` (auto-settle)

## Notes

- `synchronize: true` is dev-only convenience; use `npx vendure migrate` + `migrations: [...]`
  for production. (`@vendure/cli` not installed; add it if you want migrations.)
- Never deploy with default superadmin credentials, `COOKIE_SECRET`, permissive dev CORS,
  or the dummy payment handler — switch to Stripe/etc. via `@vendure/payments-plugin`.
- Port: `VENDURE_SERVER_PORT` in `.env` (3002; 3000/3001 were taken on this machine).
