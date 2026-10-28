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

---

## 5. User Preferences & Working Style ("What Kirtan Likes & Rejects")

### What Kirtan REJECTS (Do NOT do these):
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
