# Cockroach Janta Party Store (CJP)

Dark Indian Gen-Z streetwear eCommerce site with full admin dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — HMAC key for auth

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Framer Motion + Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Fonts: Bebas Neue (display), Geist (body)

## Where things live

- `lib/db/src/schema/` — DB schema (users, categories, products, reviews, orders, cart, coupons, banners, wishlist, newsletter)
- `lib/api-spec/` — OpenAPI spec (source of truth for API contracts)
- `lib/api-client-react/src/generated/api.ts` — all generated React Query hooks and types
- `lib/api-zod/src/generated/` — generated Zod schemas
- `artifacts/api-server/src/routes/` — all 12 Express route files
- `artifacts/api-server/src/lib/auth.ts` — HMAC-SHA256 auth (uses SESSION_SECRET env var)
- `artifacts/store/src/` — React frontend
- `artifacts/store/src/index.css` — brand theme (primary=neon green #39FF14, secondary=deep red, background=near-black)
- `artifacts/store/src/pages/` — 22 pages including 6 admin pages

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval codegen → typed React Query hooks. Never write raw fetch calls in frontend.
- HMAC-SHA256 password hashing using SESSION_SECRET. Token stored in `cjp_token` localStorage.
- Guest cart support via `x-session-id` header stored in localStorage.
- Product routes support both numeric ID and slug (`/api/products/:id` handles both).
- Admin auth guarded client-side (redirect to login) and server-side (requireAdmin middleware).

## Product

- Full eCommerce store: product listing, product detail (with size selector, cart, wishlist, reviews), cart, checkout, orders
- Admin dashboard: products CRUD, orders management, banners, coupons, users, analytics
- Static pages: About, Contact, FAQ, Shipping, Returns, Privacy, Terms
- Newsletter signup, WhatsApp FAB

## Seeded Data

- 8 products across 5 categories (T-Shirts, Hoodies, Caps, Accessories, Limited Drops)
- Admin user: email=`admin@cjp.in`, password=`Admin@CJP2025!`
- Demo coupons: `JANTA20` (20% off, min ₹500), `FIRSTDROP` (₹100 off, min ₹699)

## User preferences

- Brand palette: near-black background (#0a0a0a), neon green primary (#39FF14 / hsl(113 100% 54%)), deep red secondary
- Bebas Neue for display/headlines, Geist for body
- Dark Gen-Z streetwear aesthetic — bold, raw, urban

## Gotchas

- DB column is `password` (not `password_hash`) in users table
- DB column is `min_order_amount` (not `min_order_value`) in coupons table
- Auth hashing uses `SESSION_SECRET` env var — always generate password hashes in server context, not in code_execution sandbox
- Product routes: use `product.id` not variable `id` after the slug/id resolution pattern
- After any API route change, restart the API server workflow (it bundles with esbuild on start)
- `useGetProduct` hook is generated and only accepts `number` — use dual-query pattern in ProductDetail for slug support

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
