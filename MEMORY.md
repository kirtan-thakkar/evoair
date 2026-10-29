# EvoAir (Evoluir) — Project Memory & Architecture Context

> **Purpose of this Document**:  
> This file is the single source of truth for the **EvoAir** system. Any AI assistant or developer working on this codebase must read this file to understand the project architecture, chronological progress, security guardrails, route protection rules, and specific user preferences/rejections.

---

## 1. Project Overview & Business Domain
* **Product**: Evo-Air by Evoluir — a luxury cordless micro-mist skincare air pressure device with modular pods (Evo-Fills and Evo-Bottles).
* **Target Experience**: High-end luxury cosmetics e-commerce, gallery-grade aesthetics, 3D interactive model preview, seamless mobile and desktop purchasing experience.
* **Currency & Region**: India (INR `₹`), phone numbers formatted with `+91`, 5 business days delivery window across India.

---

## 2. Repository & Workspace Structure
Monorepo hosted under `c:\ideakicks\Evoair`:

```
Evoair/
├── .github/
│   └── workflows/deploy.yml          # GitHub Actions CI/CD
├── backend/                          # Express 5 REST API & Server
│   ├── config/
│   │   ├── db.js                     # PostgreSQL connection pool (pg + Drizzle)
│   │   └── env.js                    # Strict Zod environment variable validation
│   ├── controllers/                  # Route handler controllers (auth, cart, order, analytics, catalog)
│   ├── db/
│   │   ├── schema.js                 # Drizzle ORM schema (UUID primary & foreign keys)
│   │   └── seed.js                   # Database seed script (refuses to run in production)
│   ├── middleware/
│   │   ├── authenticate.js           # JWT verify (HS256 pinned, validates UUID sub claims)
│   │   ├── requireAdmin.js           # Live DB role check (requires role === 'admin')
│   │   ├── errorHandler.js           # Centralized JSON error format
│   │   └── notFound.js               # 404 handler
│   ├── routes/
│   │   ├── authRoutes.js             # /api/v1/auth (login, register, google, refresh, me, logout)
│   │   ├── cartRoutes.js             # /api/v1/cart (CRUD + sync)
│   │   ├── catalogRoutes.js          # /api/v1/catalog (products, variants)
│   │   ├── orderRoutes.js            # /api/v1/orders (create, get mine)
│   │   └── analyticsRoutes.js        # /api/v1/analytics (KPIs, guarded by requireAdmin)
│   ├── services/                     # Business logic (authService, orderService, cartService, cacheService)
│   ├── utils/                        # Logging (pino), helpers
│   ├── validators/                   # Zod schemas (commonValidators, auth, cart, order, catalog)
│   ├── app.js                        # Express app: rate limiting, static frontend serving, routes
│   ├── server.js                     # Server entrypoint with graceful shutdown
│   └── package.json
└── frontend/                         # React 19 + Vite Multi-Page Application
    ├── dist/                         # Compiled production distribution (HTML, JS bundles, 3D assets, fonts)
    │   ├── assets/                   # Bundled CSS, JS chunks, wasm decoders, images
    │   ├── audio/                    # Ambient site audio (derek-carr-destiny.mp3)
    │   ├── cart/index.html           # /cart/ entrypoint for clean static hosting
    │   ├── products/index.html       # /products/ entrypoint for clean static hosting
    │   ├── 404.html                  # Fallback router for static hosts
    │   ├── cart.html                 # Direct /cart.html
    │   ├── index.html                # Direct /index.html (Home page)
    │   ├── products.html             # Direct /products.html (Shop page)
    │   ├── favicon.svg & icons.svg
    │   └── HEER_AS-10-1000010.glb    # 3D product model
    ├── public/                       # Static public assets
    ├── src/                          # React JSX source code
    │   ├── assets/                   # Media, 3D models, Satoshi fonts
    │   ├── components/               # React components (AuthModal, Cart, Checkout, Products, 3D viewer)
    │   ├── context/
    │   │   └── AuthContext.jsx       # In-memory access token, silent refresh, auth state provider
    │   ├── data/
    │   │   └── productOptions.js     # Formulas and shades data
    │   ├── utils/
    │   │   ├── api.js                # Centralized fetch wrapper with 401 silent refresh retry
    │   │   └── cart.js               # Cart hook, localStorage sync, server sync
    │   ├── App.jsx                   # Home page component
    │   ├── cart.jsx                  # Cart page entrypoint
    │   ├── main.jsx                  # Home page entrypoint
    │   ├── products.jsx              # Products page entrypoint
    │   └── index.css                 # Global CSS (luxury typography, modal styling, mobile nav blur)
    ├── vite.config.js                # Vite config (multi-page inputs, proxy to backend:5000, preview config)
    └── package.json
```

---

## 3. Technology Stack & Key Libraries
* **Backend**: Node.js (ES Modules), Express 5.2.1, PostgreSQL 15/16, Drizzle ORM, Zod 4.4, Pino / Pino-HTTP, `google-auth-library`, `express-rate-limit`, `helmet`, `cookie-parser`, `bcrypt`, `jsonwebtoken`.
* **Frontend**: React 19, Vite 8, GSAP 3.15 + ScrollTrigger, Lenis smooth scrolling, `@google/model-viewer`, Three.js + `@react-three/fiber`, Motion.
* **Deployment Model**: Unified single-container architecture. Express serves both the REST API (`/api/v1/*`) and the frontend static assets (`/`, `/products`, `/cart`) so it can be deployed directly to an **AWS EC2 Free Tier (t2.micro / t3.micro)** or a single Docker container with zero CORS issues.

---

## 4. Chronological Milestones & Progress
1. **Milestone 1 — Core Architecture & Database Migration**:
   - Replaced integer IDs across all tables with PostgreSQL standard `UUIDv4`.
   - Updated Drizzle schema (`users`, `products`, `variants`, `orders`, `order_items`, `carts`, `cart_items`).
   - Created safe seed script that strictly forbids execution in `NODE_ENV=production`.
2. **Milestone 2 — Authentication Hardening (Security Fix Batch 1)**:
   - Migrated token verification to `google-auth-library` (`OAuth2Client.verifyIdToken`).
   - Completely deleted all development mock token bypasses (`dev_mock_google_token`).
   - Standardized `NODE_ENV` as a required enum (`development`, `test`, `production`) with no loose defaults.
   - Pinned JWT verification to `HS256` and enforced 32-character distinct secrets.
   - Pinned access tokens to in-memory lifecycle (15 minutes), refresh tokens to HTTP-only secure SameSite cookies (7 days).
3. **Milestone 3 — Cart, Orders & Concurrency**:
   - Implemented non-blocking backorders and dynamic 5-business-day delivery calculation in IST timezone.
   - Added PostgreSQL advisory locks (`pg_advisory_xact_lock`) on variant rows during checkout to guarantee zero race conditions.
   - Added stable idempotency keys generated on the client and enforced in backend order creation.
4. **Milestone 4 — Security Audit & Defense in Depth**:
   - `requireAdmin.js` middleware querying database directly on each admin request.
   - `analyticsRoutes.js` strictly locked down behind `authenticate` + `requireAdmin`.
   - Global IP Rate Limiter (`globalLimiter`): 200 requests / 15 min across every page and route.
   - Dedicated checkout rate limiter: 15 requests / 15 min per IP on `POST /api/v1/orders`.
   - Sensitive header redaction via `pinoHttp` (`authorization`, `cookie`, `idempotency-key`, `set-cookie`).
   - Trust proxy hops configured cleanly via `TRUST_PROXY_HOPS` integer (0–5).
5. **Milestone 5 — Collaborator UI Integration & Clean Frontend Rebuild**:
   - Collaborator pushed compiled luxury UI to `origin/gh-pages` (enhanced mobile bottom nav blur, GPU acceleration, 2-column luxury AuthModal).
   - Scrapped old frontend and cleanly deployed the new production build to `frontend/dist`.
   - Configured Express static serving and Vite dev/preview proxies to bridge frontend and backend.
6. **Milestone 6 — Complete React Component Architecture Conversion from `gh-pages`**:
   - Extracted complete CSS payload from `origin/gh-pages` (`AuthModal-C3HCHj1L.css` + `main-CDTwyJj2.css`), combined with local Satoshi fonts and Google Fonts (`Tulpen One`, `Tajawal`), into `frontend/src/index.css`.
   - Reconstructed `AuthModal.jsx` and `AuthNavButton` directly from `origin/gh-pages:assets/AuthModal-CYbOxYu_.js`, providing 2-column luxury brand showcase, "+91" phone input formatting, and responsive mobile popover.
   - Built modular `AccordionGallery.jsx` component for mobile 3D technology stats.
   - Built modular floating luxury pill navigation (`.luxury-nav`, `.nav-actions-cluster`, `Shop`, `CartNavButton`, `AuthNavButton`).
   - Wired full GSAP timeline, Lenis smooth scrolling, `CardSwap`, `Masonry`, `MagicRings`, `ModelViewer`, and `BlackHole` in `frontend/src/App.jsx`.
   - Fixed `backend/server.js` startup lifecycle: properly logged Pino error objects (`{ err }`) and made dev server non-blocking when PostgreSQL is not yet running on port 5432, guiding developers to start Docker (`docker compose up -d`).
7. **Milestone 7 — Mobile Experience Perfection & Auto-Sliding Tech Carousel**:
   - Replaced cramped vertical accordion on mobile with a luxury auto-sliding carousel ([`TechMobileCarousel.jsx`](file:///c:/ideakicks/Evoair/frontend/src/components/TechMobileCarousel.jsx) & [`TechMobileCarousel.css`](file:///c:/ideakicks/Evoair/frontend/src/components/TechMobileCarousel.css)). Features 3.5s auto-slide timer, touch swipe gestures, sleek glass navigation arrows, active dot indicators with glowing orange accent pill, slide counter, and Tulpen One stat typography.
   - Fixed mobile responsiveness across Section 1 (Hero `#scroll-hint` offset cleanly above bottom nav pill), Section 2 (Airflow centered typography and portrait), and Section 3 (Craftsmanship `CardSwap` scaled dynamically to mobile width without overflow or voids).
   - Preserved 3-column `Masonry` grid on desktop displays.
8. **Milestone 8 — Products Switcher Tabs Logo & Motion Pan-Up Animation**:
   - Added butterfly brand logo into the first tab (`Evo-Air Device`) with dynamic active contrast inversion (`filter: brightness(0)` on white pill vs `brightness(0) invert(1)` on dark background).
   - Wired Motion spring sliding pill (`layoutId="active-product-pill"` with `stiffness: 450, damping: 35`) across the product switcher buttons and formula selector buttons (`layoutId="active-formula-pill"`).
   - Implemented `<AnimatePresence mode="wait">` smooth pan-up animation (`initial={{ opacity: 0, y: 16 }}`, `animate={{ opacity: 1, y: 0 }}`, `exit={{ opacity: 0, y: -16 }}`) for both the left description pane and the right product visual when switching tabs.
   - Restored interactive SVG window shade coloring for `evofills` that dynamically tints the pod window with the selected shade swatch.
   - Extracted high-res unibody assets (`evoair-render.png`, `evofill-shell.png`, `evofill-window-shading.png`) from `origin/gh-pages`.
   - Verified across mobile (390x844) and desktop (1280x800) via Playwright.
9. **Milestone 9 — Multi-Page Architecture (MPA) Decoupling & Real URL Routing**:
   - Eliminated single-page hash hijacking (`#products`, `#cart`) that swapped in-place React divs on the landing page.
   - Enforced true multi-page document navigation: `/` loads [`index.html`](file:///c:/ideakicks/Evoair/frontend/index.html), `/products` loads [`products.html`](file:///c:/ideakicks/Evoair/frontend/products.html), and `/cart` loads [`cart.html`](file:///c:/ideakicks/Evoair/frontend/cart.html).
   - Updated all navigational links in bottom bar (`Shop` -> `/products`), pricing section (`Acquire Now` -> `/products`), and cart button (`CartNavButton` -> `/cart`).
   - Added automatic legacy hash redirect in [`App.jsx`](file:///c:/ideakicks/Evoair/frontend/src/App.jsx) to ensure any existing `#products` or `#cart` URLs seamlessly navigate to their dedicated HTML pages.
   - Reduced Home bundle chunk size by 140 kB by isolating `Products` and `Cart` dependencies into their respective page bundles.
   - Verified end-to-end full page transitions across `/`, `/products`, and `/cart` using Playwright.
10. **Milestone 10 — Dedicated Checkout Page Architecture (`/checkout`)**:
    - Replaced the cramped, scroll-trapped modal on `/cart` with a dedicated, full-page checkout document (`checkout.html`, `CheckoutPage.jsx`, `CheckoutPage.css`).
    - Provides natural window scrolling, 2-column luxury glass grid, Indian mobile & PIN code validation, complimentary shipping badge, and celebration confirmation state.
    - Updated `Cart.jsx` checkout CTA to directly navigate to `/checkout`.
11. **Milestone 11 — Dedicated Customer Orders Page (`/:id/orders` & `/orders`)**:
    - Built customer order history page (`orders.html`, `OrdersPage.jsx`, `OrdersPage.css`).
    - Prominently showcases the **Expected Delivery Date** banner with courier status, 4-step dispatch progress stepper (Order Placed -> Preparing Dispatch -> In Transit -> Delivered), order line items, recipient delivery address, and PostgreSQL total paise calculations.
    - Added "My Orders" navigation entry directly into the authenticated user pill dropdown menu (`AuthNavButton` in `AuthModal.jsx`), routing to `/${user.id}/orders`.
    - Wired multi-page rewrite in `vite.config.js` and Express handler in `backend/app.js` across `/orders` and `/:id/orders`.
12. **Milestone 12 — Formula Database Schema & 42 Product Variant Expansion**:
    - Added `formula` and `color_hex` columns to PostgreSQL `product_variants` schema.
    - Seeded full catalog of 42 variants in `backend/db/seed.js`: 10 Foundation, 5 Blush (`B01`–`B05`), and 5 Highlighter (`H01`–`H05`) for Evo-Air Device, 10 Foundation, 5 Blush, and 5 Highlighter refills for Evo-Fills, plus Evo-Bottles pack.
    - Exposed `formula` and `color_hex` in catalog services and upgraded `frontend/src/utils/cart.js` with formula-aware variant UUID resolution.
13. **Milestone 13 — Delivery Fee Model & Typography Harmonization**:
    - Removed AI-generated delivery callout banner and associated CSS.
    - Transitioned from complimentary shipping to a flat delivery fee (₹150 standard delivery, configurable via `SHIPPING_FEE_PAISE` in `.env`), recorded in `orders.shipping_paise` and totaled in both `/cart` and `/checkout`.
    - Standardized all typography on `/checkout` to Satoshi (`Satoshi-Variable, Satoshi, sans-serif`), ensuring all titles, cards, labels, and forms use clean Satoshi sans-serif.
    - Styled `.checkout-nav-wordmark` and `.orders-nav-wordmark` in the navbar with the official brand font `Tulpen One, cursive` (28px, uppercase, 0.1em letter spacing) matching the main site navbar wordmark.

14. **Milestone 14 — Strict Route Protection for Checkout & Orders**:
    - Guarded `/checkout` and `/:id/orders` / `/orders` against unauthenticated direct URL visits.
    - Integrated reactive session protection: displays a dark session verification screen while `!authReady`. As soon as `authReady && !isAuthenticated`, immediately redirects visitors to `/` via `window.location.replace('/')`.
    - Removed redundant guest banners and sign-in prompt fallbacks from both pages as unauthenticated traffic is automatically deflected.

15. **Milestone 15 — Human-Readable Order Numbers, Rich Variant Items & Timeline Stepper Removal**:
    - Added `order_number` column (`varchar(50) UNIQUE`) to `orders` table in PostgreSQL schema, migrated database, and backfilled existing orders (e.g. `#EVO-100001`).
    - Added `generateUniqueOrderNumber` generator in `orderService.js` creating unique human-readable order numbers (e.g. `EVO-849201`).
    - Updated `getUserOrders`, `getUserOrderById`, and `findExistingOrderWithItems` to perform `innerJoin` on `productVariants` and `products`, enriching order line items with actual product names, shade codes (`02`, `B01`, `H01`), shade names (`Halo`, `Terra Nova`), color hexes, and formula tags.
    - Updated `OrdersPage.jsx` line items to display shade badges with color swatches and formula indicators instead of raw database UUIDs.
    - Removed the 4-step progress stepper timeline from `OrdersPage.jsx` and `OrdersPage.css` in favor of a clean manual dispatch notice suitable for manual fulfillment and founder courier coordination.

---

## 5. User Preferences & Working Style ("What Kirtan Likes & Rejects")

### What Kirtan REJECTS (Do NOT do these):
* ❌ **Do NOT run Playwright automation on every turn**: The user prefers to verify UI changes themselves in the browser. Do not run Playwright tests unless explicitly requested.
* ❌ **Do NOT overcomplicate / "do too much"**: If a clean, direct solution exists (e.g. swapping the frontend with the verified new build), do that directly rather than creating complex AST parsing or unnecessary manual merge diffs.
* ❌ **No lingering review or backup folders**: Never leave clutter like `preview_gh_pages` or `frontend_old_backup` visible in the workspace. Clean them up immediately when tasks complete.
* ❌ **Never use hardcoded IDs or mock bypasses in production**: Hardcoded seed UUIDs (`SEED_VARIANT_UUIDS`) and mock login tokens (`dev_mock_google_token`) are strictly forbidden.
* ❌ **No promotional or defensive bias**: Answers must be factual, direct, objective, and acknowledge system limitations openly.
* ❌ **Never run destructive SQL**: Never run `DELETE`, `DROP`, `TRUNCATE` directly against production tables.
* ❌ **Never print full tokens or secrets**: Show first 10 characters only.

### What Kirtan LIKES & REQUIRES (Always follow these):
* ✅ **Single Unified Container / Free Tier Deployment**: The backend and frontend must be integrated to run together inside one container on a single port for easy deployment on **AWS EC2 free tier** (without needing multi-service setups or paid managed services).
* ✅ **Production-Grade Route Protection**: Guard every sensitive endpoint on both frontend and backend against unauthorized access and scraping.
* ✅ **Per-Page IP Rate Limiting**: Anti-scraping and anti-DDoS rate limits must cover every page and route.
* ✅ **Atomic Git Commits**: When committing work, provide clean, step-by-step atomic commits (at least 9–10 descriptive commits when pushing substantial work).
* ✅ **Clickable File Links**: Every mentioned file or symbol must have clickable markdown links using the `file:///` URI scheme.
* ✅ **Concise, Structured Communication**: Clear bullet points, no fluff.

---

## 6. Route Protection & Security Architecture

### Backend Route Access Matrix:

| Route Path | Method | Protection Level | Middleware Stack |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | Public | None |
| `/` & static assets | `GET` | Public | `globalLimiter` (200 req / 15m) |
| `/products` & `/cart` | `GET` | Public | `globalLimiter` |
| `/api/v1/catalog/*` | `GET` | Public | `globalLimiter` |
| `/api/v1/auth/register` | `POST` | Public | `globalLimiter`, `authLimiter` |
| `/api/v1/auth/login` | `POST` | Public | `globalLimiter`, `authLimiter` |
| `/api/v1/auth/google` | `POST` | Public | `globalLimiter`, `authLimiter` |
| `/api/v1/auth/refresh` | `POST` | Public / Cookie-based | `globalLimiter`, `cookieParser` |
| `/api/v1/auth/me` | `GET` | **Protected (Customer)** | `authenticate` |
| `/api/v1/auth/logout` | `POST` | **Protected (Customer)** | `authenticate` |
| `/api/v1/cart` | `GET` | **Protected (Customer)** | `authenticate` |
| `/api/v1/cart/*` | `POST/PUT/DEL` | **Protected (Customer)** | `authenticate` |
| `/api/v1/orders` | `POST` | **Protected (Customer)** | `authenticate`, `orderLimiter` (15 req / 15m) |
| `/api/v1/orders/mine` | `GET` | **Protected (Customer)** | `authenticate` |
| `/api/v1/analytics/*` | `ALL` | **Protected (Admin Only)**| `authenticate`, `requireAdmin` (DB lookup) |

### Frontend Route & Action Protection:
1. **Checkout Action Guard**:
   - When a guest user clicks "Acquire Now" on the home page, or "Proceed to Checkout" on the cart page, `handleInitiateCheckout` checks `if (!isAuthenticated)`.
   - If not authenticated, it automatically triggers the luxury `AuthModal`.
   - Upon successful sign-in or registration, `onSuccess` triggers and immediately opens the Checkout & Shipping modal without losing cart state.
2. **In-Memory Token Lifecycle (`AuthContext.jsx`)**:
   - Access tokens are kept strictly **in JavaScript memory**. They are never saved to `localStorage` or `sessionStorage` (preventing token theft via XSS).
   - On page reload or initial app visit, `AuthContext` calls `POST /api/v1/auth/refresh`.
   - If a valid refresh token cookie exists, the backend issues a new in-memory access token and fetches the user profile via `GET /api/v1/auth/me`.
   - If refresh fails, auth state cleanly resets to unauthenticated without crashing the UI.
3. **Admin Page Protection**:
   - Any admin UI route or dashboard must check `user?.role === 'admin'`. Non-admin users are returned a 403 Forbidden / redirected to home.

---

## 7. Immediate Next Steps & Active Roadmap
1. **Dynamic Catalog Resolution (Fix Finding F-03)**:
   - Ensure `frontend/src/utils/cart.js` dynamically queries `GET /api/v1/catalog/products` on boot to map variant UUIDs, eliminating all hardcoded fallback IDs.
2. **End-to-End API Integration Verification**:
   - Start the backend and frontend simultaneously and verify live user registration, login, cart synchronization to DB, and order creation.
3. **AWS EC2 Free Tier Deployment Package**:
   - Prepare a lightweight `Dockerfile` or PM2 setup to deploy the combined Node.js server to an AWS EC2 `t2.micro` / `t3.micro` instance.


---

## 8. Milestone 10–16 Implemented Features & Polish
1. **Dedicated Multi-Page Routes**:
   - `/checkout` ([CheckoutPage.jsx](file:///c:/ideakicks/Evoair/frontend/src/components/CheckoutPage.jsx)): Dedicated checkout page with full page scrolling, Satoshi typography, and brand Tulpen One header.
   - `/:id/orders` & `/orders` ([OrdersPage.jsx](file:///c:/ideakicks/Evoair/frontend/src/components/OrdersPage.jsx)): Dedicated orders page accessible via the user profile dropdown in the top navbar.
2. **Route Protection**:
   - Both `/checkout` and `/orders` immediately redirect unauthenticated visitors to `/` (`window.location.replace('/')`).
3. **Typography & Styling**:
   - Satoshi standardized across checkout and orders pages.
   - Wordmark 'EVOLUIR' styled with brand font `Tulpen One, cursive` (uppercase, letter-spacing 0.1em).
4. **Order Management & Fulfillment Model**:
   - Database column `order_number` (`varchar(50) UNIQUE`) added to `orders` table with format `EVO-XXXXXX`.
   - Rich variant metadata joined (`product_variants` & `products`): displaying actual shade name, hex swatch badge, shade code (e.g., `02`, `B01`), and formula title instead of raw UUIDs.
   - Removed progress stepper / delivery pipeline from orders view in favor of founder direct delivery dispatch.
   - Automated cart clearing upon order placement both in DB transaction and frontend cart state.
   - Removed promo code input and VIP discounts from cart.
   - Flat standard delivery fee (₹150 default, `SHIPPING_FEE_PAISE`).
5. **Backend Server Dev Resilience**:
   - In [backend/server.js](file:///c:/ideakicks/Evoair/backend/server.js), `unhandledRejection` and `uncaughtException` in development log errors without terminating the Node process (`gracefulShutdown` only triggers when `NODE_ENV === 'production'`).
   - Added `"dev": "node --watch server.js"` in [backend/package.json](file:///c:/ideakicks/Evoair/backend/package.json) for automatic hot reload.
