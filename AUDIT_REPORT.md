# Comprehensive Security & Code-Quality Audit Report: EvoAir Platform

> **Audit Date**: October 26, 2026  
> **Auditor**: Senior Security & Code-Quality Auditor  
> **Target**: EvoAir Storefront API Backend & Frontend Integration  
> **Scope**: Read-Only Source Code Audit, Postgres DB Inspection, Local API Dynamic Testing  
> **Deployment Target**: AWS (ECS / Fargate / RDS PostgreSQL)

---

## 1. Executive Summary

**VERDICT: NOT SAFE TO DEPLOY.**  
The platform has significant architectural strengths (deterministic transactions, atomic stock operations, parameterized queries, and strict CORS/cookie foundations), but contains **four critical production-blocking defects**:
1. All authenticated API endpoints are non-functional (`401 Invalid user ID in access token`) due to an integer check on string UUIDs in `authenticate.js`.
2. `GET /api/v1/analytics/overview` is completely unauthenticated and leaks live PII, customer names, cities, and store GMV to the public.
3. The frontend hardcodes seed UUIDs that will not exist in production, guaranteeing order failure on day one.
4. The dev Google auth mock bypasses authentication whenever `NODE_ENV` is unset or default, while production Google token verification lacks audience/client ID verification.

---

## 2. Pass 1: Architecture Mapping

### 2.1. Backend File Inventory

| File Path | Description / Responsibility |
| :--- | :--- |
| `backend/.env` | Local environment variables (DB credentials, JWT secrets, port, feature flags). Uncommitted. |
| `backend/.prettierrc` | Formatting rules configuration for Prettier. |
| `backend/app.js` | Express 5 application setup, security headers (`helmet`), CORS, pino logging, JSON limits, and route mounting. |
| `backend/docker-compose.yml` | Local Docker container definition for PostgreSQL 15 (`postgres:15-alpine`). |
| `backend/drizzle.config.js` | Drizzle Kit ORM configuration specifying schema location, dialect (`postgresql`), and connection credentials. |
| `backend/eslint.config.js` | ESLint static code analysis rules configuration. |
| `backend/package.json` | Project dependencies, scripts (`start`, `test`, `migrate`, `seed`), and metadata. |
| `backend/package-lock.json` | Pinned dependency tree lockfile. |
| `backend/server.js` | HTTP server bootstrap, port binding, and graceful shutdown handlers (`SIGTERM`, `SIGINT`, unhandled rejections). |
| `backend/skills-lock.json` | Skill dependencies metadata. |
| `backend/vitest.config.js` | Vitest test runner configuration file. |
| `backend/config/db.js` | PostgreSQL `pg.Pool` connection pool setup, Drizzle ORM instance export, and DB health check query. |
| `backend/config/env.js` | Zod schema validation and parsing for all environment variables with defaults. |
| `backend/controllers/analyticsController.js` | Controller handler executing store analytics overview queries. |
| `backend/controllers/authController.js` | Controller handlers for registration, credential login, Google OAuth, refresh token rotation, and `/me`. |
| `backend/controllers/cartController.js` | Controller handlers for cart inspection, item additions, updates, deletions, and guest-to-user sync. |
| `backend/controllers/catalogController.js` | Controller handlers for fetching active products, slug-based lookups, and cart validation. |
| `backend/controllers/orderController.js` | Controller handlers for transactional order placement, order history listing, and single order details. |
| `backend/db/schema.js` | Drizzle ORM schema defining 10 PostgreSQL tables, enums (`role`, `order_status`), and UUID primary/foreign keys. |
| `backend/db/seed.js` | Development database seeder populating catalog products and variants with deterministic UUIDs. |
| `backend/middleware/authenticate.js` | JWT access token verification middleware validating `Authorization: Bearer <token>` and extracting `req.user`. |
| `backend/middleware/errorHandler.js` | Centralized Express error handler mapping custom operational exceptions and obscuring production 500s. |
| `backend/middleware/notFound.js` | 404 handler for unmatched HTTP request routes. |
| `backend/routes/analyticsRoutes.js` | Express router exposing `GET /overview`. |
| `backend/routes/authRoutes.js` | Express router exposing auth endpoints with 15-min IP-based rate limiting (`express-rate-limit`). |
| `backend/routes/cartRoutes.js` | Express router exposing authenticated cart CRUD and guest synchronization endpoints. |
| `backend/routes/catalogRoutes.js` | Express router exposing public product browsing and cart pre-validation endpoints. |
| `backend/routes/orderRoutes.js` | Express router exposing authenticated checkout and order history retrieval endpoints. |
| `backend/services/analyticsService.js` | Business logic querying total GMV, status breakdowns, top-selling variants, 30-day sales, and customer stats. |
| `backend/services/authService.js` | Business logic for password hashing (`bcrypt`), JWT signing, Google tokeninfo validation, and token rotation. |
| `backend/services/cacheService.js` | Dual-mode caching abstraction (`REDIS_ENABLED=0` in-memory fallback vs. Redis stubs). |
| `backend/services/cartService.js` | Business logic for server-side user cart creation, cart item updates, and transactional guest cart merging. |
| `backend/services/catalogService.js` | Business logic querying active catalog products and active shade variants from PostgreSQL. |
| `backend/services/orderService.js` | Transactional order processing with advisory locking, atomic stock decrement, and delivery date calculation. |
| `backend/utils/errors.js` | Standardized operational application error classes (`AppError`, `UnauthorizedError`, `ValidationError`, etc.). |
| `backend/utils/logger.js` | Pino structured logger instance with pretty printing in development. |
| `backend/validators/authValidators.js` | Zod schemas for user registration, credential login, and Google OAuth payload. |
| `backend/validators/cartValidators.js` | Zod schemas for cart item update, variant param, and guest cart sync array. |
| `backend/validators/catalogValidators.js` | Zod schemas for product slug param and cart validation payload. |
| `backend/validators/orderValidators.js` | Zod schemas for checkout headers (`Idempotency-Key`), item quantities, shipping address, and order ID param. |

---

### 2.2. Route Matrix

| Method | Path | Middleware Chain | Access Control | Zod Validated? | DB Access |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | None | Public | No | Read (`SELECT 1`) |
| `POST` | `/api/v1/auth/register` | `authLimiter` | Public | Yes (`registerSchema`) | Read/Write (`users`) |
| `POST` | `/api/v1/auth/login` | `authLimiter` | Public | Yes (`loginSchema`) | Read (`users`) |
| `POST` | `/api/v1/auth/google` | `authLimiter` | Public | Yes (`googleAuthSchema`) | Read/Write (`users`) |
| `POST` | `/api/v1/auth/refresh` | None | Public (cookie-based) | No (custom JWT verify) | Read (`users`) |
| `POST` | `/api/v1/auth/logout` | None | Public (cookie-based) | No (custom JWT verify) | Write (`users.refresh_token_version`) |
| `GET` | `/api/v1/auth/me` | `authenticate` | Logged-in user | No | Read (`users`) |
| `GET` | `/api/v1/catalog/products` | None | Public | No | Read (`products`, `product_variants`) |
| `GET` | `/api/v1/catalog/products/:slug` | None | Public | Yes (`slugParamSchema`) | Read (`products`, `product_variants`) |
| `POST` | `/api/v1/catalog/cart/validate` | None | Public | Yes (`validateCartSchema`) | Read (`products`, `product_variants`) |
| `GET` | `/api/v1/cart` | `authenticate` | Logged-in user | No | Read (`carts`, `cart_items`, `products`, `variants`) |
| `PUT` | `/api/v1/cart` | `authenticate` | Logged-in user | Yes (`updateCartItemSchema`) | Read/Write (`carts`, `cart_items`) |
| `DELETE`| `/api/v1/cart/:variantId` | `authenticate` | Logged-in user | Yes (`variantParamSchema`) | Read/Write (`carts`, `cart_items`) |
| `DELETE`| `/api/v1/cart` | `authenticate` | Logged-in user | No | Read/Write (`carts`, `cart_items`) |
| `POST` | `/api/v1/cart/sync` | `authenticate` | Logged-in user | Yes (`syncCartSchema`) | Read/Write (`carts`, `cart_items`) |
| `POST` | `/api/v1/orders` | `authenticate` | Logged-in user | Yes (`createOrderSchema`, `idempotencyKeyHeaderSchema`) | Read/Write (`orders`, `order_items`, `product_variants`) |
| `GET` | `/api/v1/orders` | `authenticate` | Logged-in user | No | Read (`orders`, `order_items`, `product_variants`) |
| `GET` | `/api/v1/orders/:id` | `authenticate` | Logged-in user | Yes (`orderIdParamSchema`) | Read (`orders`, `order_items`, `product_variants`) |
| `GET` | `/api/v1/analytics/overview` | None | **PUBLIC (VULNERABILITY)** | No | Read (`orders`, `order_items`, `product_variants`, `products`, `users`) |

---

### 2.3. Checkout Data-Flow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Browser / Client
    participant Controller as orderController.js
    participant Service as orderService.js
    participant Postgres as PostgreSQL 16 (Drizzle tx)

    Customer->>Controller: POST /api/v1/orders (Bearer JWT + Idempotency-Key)
    Note over Controller: Broken: authenticate.js rejects UUID JWT with 401
    Controller->>Service: createOrder(userId, idempotencyKey, { items, shippingAddress })
    Service->>Postgres: BEGIN TRANSACTION
    Service->>Postgres: SELECT pg_advisory_xact_lock(hashtext(userId), hashtext(idempotencyKey))
    Service->>Postgres: Check existing order by (user_id, idempotency_key)
    Service->>Postgres: SELECT active variants WHERE id IN (...items)
    Note over Service: Sorts variant IDs ascending to prevent cross-transaction deadlocks
    Service->>Postgres: UPDATE product_variants SET stock_qty = GREATEST(0, stock_qty - qty)
    Note over Service: Deducts available stock down to 0; does NOT record unfulfilled backordered_qty
    Service->>Service: Compute subtotal from DB prices + 10000 paise shipping
    Service->>Service: calculateExpectedDeliveryDate() [5 business days, skipping Sun]
    Service->>Postgres: INSERT INTO orders (status: 'pending_payment', expected_delivery_date, ...)
    Service->>Postgres: INSERT INTO order_items (order_id, variant_id, quantity, unit_price_paise)
    Service->>Postgres: COMMIT TRANSACTION
    Service-->>Controller: Return created order object
    Controller-->>Customer: 201 Created (Order ID, total_paise, expected_delivery_date)
```

---

## 3. Pass 2: Specific Suspicion Verdicts (S1 to S16)

### S1: Mock Google Token Auth Bypass
- **Verdict**: **CONFIRMED-BY-REPRODUCING**
- **Evidence**: [`backend/services/authService.js:111`](file:///c:/ideakicks/Evoair/backend/services/authService.js#L111):
  ```javascript
  if ((env.NODE_ENV === 'development' || !process.env.NODE_ENV) && idToken.startsWith('dev_mock_google_token')) {
  ```
- **Reproduction**:
  Executed against local server:
  ```bash
  curl -s -X POST http://localhost:5000/api/v1/auth/google \
    -H "Content-Type: application/json" \
    -d '{"credential":"dev_mock_google_token"}'
  ```
  **Output**: HTTP 200 returned valid JWT access token and logged in as `Alex Rivera` (`alex.rivera@example.com`).
- **Flaw**: If an AWS deployment fails to inject `NODE_ENV=production` at the process level, `!process.env.NODE_ENV` evaluates to `true`, creating an open authentication backdoor.

---

### S2: Frontend Hardcoded Seed UUIDs
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**:
  1. [`frontend/src/utils/cart.js:9-22`](file:///c:/ideakicks/Evoair/frontend/src/utils/cart.js#L9-L22):
     ```javascript
     export const SEED_VARIANT_UUIDS = {
       'EVO-01': '11111111-1111-4111-8111-000000000001',
       'EVO-02': '11111111-1111-4111-8111-000000000002',
       ...
     };
     ```
  2. [`backend/db/seed.js:10-13`](file:///c:/ideakicks/Evoair/backend/db/seed.js#L10-L13):
     ```javascript
     if (env.NODE_ENV === 'production') {
       console.error('❌ Cannot run seed in production environment!');
       process.exit(1);
     }
     ```
- **Impact**: In production, where catalog records are populated dynamically, `SEED_VARIANT_UUIDS` will not exist in the database. Any cart sync or checkout will query non-existent IDs and fail with `Unavailable variants` or foreign key violation. The frontend must fetch variant UUIDs dynamically from `GET /api/v1/catalog/products`.

---

### S3: Unrestricted Analytics Route & Admin Provisioning
- **Verdict**: **CONFIRMED-BY-REPRODUCING**
- **Evidence**:
  1. [`backend/routes/analyticsRoutes.js:7`](file:///c:/ideakicks/Evoair/backend/routes/analyticsRoutes.js#L7):
     ```javascript
     router.get('/overview', analyticsController.getOverview);
     ```
  2. There is no `requireAdmin` or `authenticate` middleware on this route.
- **Reproduction**:
  Executed unauthenticated request with no headers:
  ```bash
  curl.exe -s http://localhost:5000/api/v1/analytics/overview
  ```
  **Output**:
  ```json
  {"status":"success","data":{"kpis":{"total_revenue_paise":1120000,"total_orders":2},"recent_orders":[{"customer_name":"Mentor Verification User","customer_city":"Bengaluru"}]}}
  ```
- **Flaw**: Any anonymous client can view store financial metrics and recent customer names/cities. Furthermore, `backend/db/schema.js` defaults users to `'customer'`, and no admin registration endpoint or CLI script exists to create an admin user.

---

### S4: Incomplete Google Token Verification
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**: [`backend/services/authService.js:121-136`](file:///c:/ideakicks/Evoair/backend/services/authService.js#L121-L136):
  ```javascript
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  ...
  const { sub: googleId, email, name, picture, email_verified } = googleData;
  if (!email || email_verified !== 'true') {
    throw new UnauthorizedError('Google email is not verified');
  }
  ```
- **Flaws**:
  1. Does **NOT** verify that `googleData.aud` equals the server's Google OAuth Client ID. Any Google ID token generated for any app/website in the world is accepted.
  2. Does not verify `googleData.iss` (`accounts.google.com` or `https://accounts.google.com`).
  3. Uses Google's slow debugging HTTP endpoint (`oauth2.googleapis.com/tokeninfo`) instead of local cryptographic signature verification via `google-auth-library`.
  4. `GOOGLE_CLIENT_ID` is not defined in `config/env.js`.

---

### S5: Account Pre-Registration Hijacking via Google Linking
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**: [`backend/services/authService.js:156-167`](file:///c:/ideakicks/Evoair/backend/services/authService.js#L156-L167):
  ```javascript
  if (user) {
    if (!user.google_id || !user.avatar_url) {
      await db.update(users).set({
        google_id: user.google_id || googleId,
        avatar_url: user.avatar_url || picture,
      }).where(eq(users.id, user.id));
    }
  }
  ```
- **Flaw**: Email registration does not require email verification. If an attacker pre-registers `target@gmail.com` with password `Password123!`, and the victim later signs in with Google, the account is linked without clearing `password_hash`. The attacker retains full access using their password.

---

### S6: Email/Password Login for Google-Only Users (`password_hash` Nullable)
- **Verdict**: **REFUTED** (Securely handled)
- **Evidence**: [`backend/services/authService.js:91-95`](file:///c:/ideakicks/Evoair/backend/services/authService.js#L91-L95):
  ```javascript
  if (!user || !user.password_hash) {
    // Run constant dummy compare to equalize response time
    await bcrypt.compare(password, DUMMY_HASH);
    throw new UnauthorizedError('Invalid email or password');
  }
  ```
- **Finding**: When a Google-only user attempts to log in via password, the code executes a dummy bcrypt comparison (`DUMMY_HASH`) to defend against timing attacks and throws standard 401 without crashing or leaking account existence.

---

### S7: Backorder Accounting Information Loss
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**: [`backend/services/orderService.js:136-148`](file:///c:/ideakicks/Evoair/backend/services/orderService.js#L136-L148):
  ```javascript
  for (const item of sortedItems) {
    await tx.update(productVariants).set({
      stock_qty: sql`GREATEST(0, ${productVariants.stock_qty} - ${item.quantity})`,
    }).where(and(eq(productVariants.id, item.variantId), eq(productVariants.is_active, true)));
  }
  ```
- **Flaw**: While `GREATEST(0, stock_qty - qty)` prevents negative database values and atomic row updates prevent double-allocation race conditions, **the unfulfilled quantity is never recorded**. If stock is 1 and 5 units are purchased, `stock_qty` becomes 0 and `order_items.quantity` is stored as 5. The business has zero visibility into how many units are owed/backordered.

---

### S8: Database Transaction Query Leaks
- **Verdict**: **REFUTED** (Clean implementation)
- **Evidence**:
  - [`backend/services/cartService.js:169-231`](file:///c:/ideakicks/Evoair/backend/services/cartService.js#L169-L231): Every query inside `syncGuestCart` uses `tx` or passes `tx` to helper functions (`getOrCreateCart(tx, ...)`, `getUserCart(userId, tx)`).
  - [`backend/services/orderService.js:80-216`](file:///c:/ideakicks/Evoair/backend/services/orderService.js#L80-L216): Every query inside `createOrder` uses `tx` (`tx.execute`, `findExistingOrderWithItems(tx, ...)`, `tx.select`, `tx.update`, `tx.insert`). No global `db` calls occur within transaction scopes.

---

### S9: Order Idempotency Constraint After UUID Migration
- **Verdict**: **CONFIRMED-BY-READING & REPRODUCING**
- **Evidence**:
  1. Live PostgreSQL constraint query (`\d orders`):
     ```
     "orders_user_id_idempotency_key_unique" UNIQUE CONSTRAINT, btree (user_id, idempotency_key)
     ```
  2. [`backend/services/orderService.js:85-90`](file:///c:/ideakicks/Evoair/backend/services/orderService.js#L85-L90):
     ```javascript
     const existingOrder = await findExistingOrderWithItems(tx, userId, idempotencyKey);
     if (existingOrder) {
       if (!areItemsMatching(existingOrder.items, items)) {
         throw new AppError('Idempotency-Key was already used with a different request', 409);
       }
       return { order: existingOrder, isExisting: true };
     }
     ```
- **Finding**: Constraint is present in the live database, and duplicate keys with differing cart payloads correctly trigger 409 Conflict.

---

### S10: Missing `trust proxy` Behind Load Balancers
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**: [`backend/app.js:1-77`](file:///c:/ideakicks/Evoair/backend/app.js#L1-L77):
  No `app.set('trust proxy', ...)` configuration exists.
- **Impact**: Behind an AWS ALB, `express-rate-limit` in [`backend/routes/authRoutes.js:9-18`](file:///c:/ideakicks/Evoair/backend/routes/authRoutes.js#L9-L18) evaluates `req.ip` as the load balancer's internal private IP. After 10 total authentication attempts from *all users combined*, the entire platform is blocked for 15 minutes.

---

### S11: JWT Broken UUID Parsing in Authentication Middleware
- **Verdict**: **CONFIRMED-BY-REPRODUCING**
- **Evidence**: [`backend/middleware/authenticate.js:16-19`](file:///c:/ideakicks/Evoair/backend/middleware/authenticate.js#L16-L19):
  ```javascript
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return next(new UnauthorizedError('Invalid user ID in access token'));
  }
  ```
- **Reproduction**:
  Sent valid Bearer token with UUID `sub: "d3a5b0ae-4af7-4ef3-bc53-396b19e2b340"` to `GET /api/v1/auth/me`:
  ```bash
  curl -s http://localhost:5000/api/v1/auth/me -H "Authorization: Bearer <valid_uuid_token>"
  ```
  **Output**: `{"status":"error","message":"Invalid user ID in access token"}` (HTTP 401).
- **Impact**: **Every authenticated route in the application (`/orders`, `/cart`, `/auth/me`) is broken for all users.**
- **Secret Length**: [`backend/config/env.js:11-12`](file:///c:/ideakicks/Evoair/backend/config/env.js#L11-L12) uses `.min(1)` instead of `.min(32)`.

---

### S12: Secrets & Logging Security Audit
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**:
  1. Git tracking: `git ls-files "*\.env*"` returned 0 files. `.env` is **not** tracked in git.
  2. Plaintext Header Logging in [`backend/app.js:28-38`](file:///c:/ideakicks/Evoair/backend/app.js#L28-L38):
     `pinoHttp` does not define `redact`. `req.headers.authorization`, `req.headers.cookie`, and `res.headers['set-cookie']` are emitted in plaintext logs.
  3. Cookies: [`backend/controllers/authController.js:11`](file:///c:/ideakicks/Evoair/backend/controllers/authController.js#L11) properly enables `secure: env.NODE_ENV === 'production'`.

---

### S13: Delivery Date Timezone & Backorder Discrepancy
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**: [`backend/services/orderService.js:12-22`](file:///c:/ideakicks/Evoair/backend/services/orderService.js#L12-L22):
  ```javascript
  export const calculateExpectedDeliveryDate = (startDate = new Date()) => {
    const d = new Date(startDate);
    let daysAdded = 0;
    while (daysAdded < 5) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0) daysAdded++;
    }
    return d;
  };
  ```
- **Flaws**:
  1. Uses the host server's local/UTC time instead of Indian Standard Time (`Asia/Kolkata`).
  2. Assigns identical "5 business days" delivery to backordered items that are not in stock and require manufacturing lead time.
  3. Only skips Sundays; ignores Indian national/courier holidays.

---

### S14: Inflated Store Analytics Revenue & UTC Timezone Bucketing
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**: [`backend/services/analyticsService.js:13, 95-104`](file:///c:/ideakicks/Evoair/backend/services/analyticsService.js#L13):
  ```javascript
  total_revenue_paise: sql`coalesce(sum(case when ${orders.status} != 'cancelled' then ${orders.total_paise} else 0 end), 0)::bigint`,
  ```
- **Flaw**: Revenue includes `pending_payment` orders. Uncompleted or abandoned checkouts inflate store GMV. Daily sales trend aggregates by UTC `date_trunc('day', created_at)` rather than IST date boundaries.

---

### S15: Dead Code in `cacheService` & Unbounded In-Memory Map
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**:
  1. [`backend/services/cacheService.js:43-68`](file:///c:/ideakicks/Evoair/backend/services/cacheService.js#L43-L68):
     `cacheService` is not imported or referenced by any controller or service in the backend.
  2. `MemoryCache` uses an unbounded `Map` without size limits or active LRU eviction.
  3. The Redis implementation in `cacheService` consists of commented-out stubs; `ioredis` is not used.

---

### S16: Docker Postgres Version Mismatch
- **Verdict**: **CONFIRMED-BY-READING**
- **Evidence**:
  - [`backend/docker-compose.yml:5`](file:///c:/ideakicks/Evoair/backend/docker-compose.yml#L5): `image: postgres:15-alpine`
  - Platform summaries and architecture plan: Claims PostgreSQL 16.

---

## 4. Comprehensive Findings Table

| ID | Severity | Area | Title | Evidence | Impact (One Sentence) | Recommended Fix | Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | **CRITICAL** | AuthN | Broken UUID check breaks all authenticated routes | `authenticate.js:16` (`Number(payload.sub)`) | Every logged-in user is rejected with 401 on all authenticated endpoints. | Remove `Number()` cast and validate `typeof payload.sub === 'string' && payload.sub.length > 0`. | CONFIRMED-BY-REPRODUCING |
| **F-02** | **CRITICAL** | AuthZ | Store analytics endpoint completely public | `analyticsRoutes.js:7` (no middleware) | Any unauthenticated visitor can view store revenue, customer names, and order addresses. | Add `authenticate` and `requireAdmin` middlewares to all `/analytics` routes. | CONFIRMED-BY-REPRODUCING |
| **F-03** | **CRITICAL** | Frontend | Hardcoded seed UUIDs in frontend cart | `cart.js:9-22` (`SEED_VARIANT_UUIDS`) | All production cart syncs and checkouts fail because seed IDs do not exist in production. | Fetch catalog variant IDs from `GET /api/v1/catalog/products` and remove hardcoded maps. | CONFIRMED-BY-READING |
| **F-04** | **CRITICAL** | AuthN | Dev Google auth token bypasses authentication | `authService.js:111` (`!process.env.NODE_ENV`) | An attacker can log in as a dummy customer if `NODE_ENV` is unset or default in production. | Remove dev bypass entirely or strictly gate to `env.NODE_ENV === 'development'`. | CONFIRMED-BY-REPRODUCING |
| **F-05** | **CRITICAL** | AuthN | Google OAuth lacks audience verification | `authService.js:121-136` (no `aud` check) | Any valid Google token issued to any application worldwide grants access to accounts. | Verify `aud === env.GOOGLE_CLIENT_ID` and `iss` using `google-auth-library`. | CONFIRMED-BY-READING |
| **F-06** | **HIGH** | Rate Limit | Missing `trust proxy` causes global lockout on AWS | `app.js:19-26` (no `trust proxy`) | All users share the load balancer IP, triggering rate limiting after 10 requests platform-wide. | Add `app.set('trust proxy', 1)` in `app.js`. | CONFIRMED-BY-READING |
| **F-07** | **HIGH** | Security | Account pre-registration takeover via Google | `authService.js:156-167` (links without clearing password) | Attacker pre-registers victim's email and retains password access after victim signs in via Google. | Require verified email before linking, or clear existing `password_hash` upon Google linking. | CONFIRMED-BY-READING |
| **F-08** | **HIGH** | Inventory | Backorder unfulfilled quantity not recorded | `orderService.js:140` (`GREATEST(0, stock - qty)`) | Business cannot determine how many units are owed or backordered for manufacturing. | Add `backordered_qty` column to `order_items` and record unfulfilled counts. | CONFIRMED-BY-READING |
| **F-09** | **HIGH** | Logging | Plaintext tokens and cookies emitted in logs | `app.js:28-38` (no `pinoHttp` redact) | Authorization tokens and session cookies leak to log aggregators and terminal output. | Configure `pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] })`. | CONFIRMED-BY-READING |
| **F-10** | **HIGH** | Data Model | No CLI or endpoint to provision admin users | `schema.js:18`, `authService.js:52` | Admins cannot be created without executing manual raw SQL updates on the database. | Implement a CLI seeding script or one-time bootstrap script for initial admin creation. | CONFIRMED-BY-READING |
| **F-11** | **MEDIUM** | Analytics | `pending_payment` orders counted as revenue | `analyticsService.js:13` (`status != 'cancelled'`) | Store GMV is artificially inflated by abandoned checkouts. | Restrict revenue calculation to `status IN ('paid', 'shipped', 'delivered')`. | CONFIRMED-BY-READING |
| **F-12** | **MEDIUM** | Validation | Variant ID parameters not strictly validated as UUID | `orderValidators.js:52`, `cartValidators.js:4` | Malformed variant IDs cause raw Postgres 500 errors instead of clean 400 Bad Request. | Change `z.string().min(1)` to `z.string().uuid()` across all validators. | CONFIRMED-BY-READING |
| **F-13** | **MEDIUM** | Logic | Delivery date ignores IST timezone and lead times | `orderService.js:12-22` | Backordered items display misleading 5-day delivery; late-night orders land on wrong date. | Compute dates in `Asia/Kolkata` and add configurable production lead time for backorders. | CONFIRMED-BY-READING |
| **F-14** | **MEDIUM** | Infra | Docker compose image tag mismatch | `docker-compose.yml:5` (`postgres:15-alpine`) | Discrepancy between documentation claiming Postgres 16 and actual container using Postgres 15. | Update `docker-compose.yml` to `postgres:16-alpine`. | CONFIRMED-BY-READING |
| **F-15** | **LOW** | Code Quality | Unused `cacheService` with unbounded MemoryCache | `cacheService.js:10-39` | Dead code and unbounded memory growth if ever invoked. | Remove unused file or integrate properly with bounded LRU cache (e.g. `lru-cache`). | CONFIRMED-BY-READING |
| **F-16** | **LOW** | Config | Weak JWT secret length validation | `config/env.js:11-12` (`.min(1)`) | Weak secrets could be configured in production without schema rejection. | Enforce `.min(32)` on `JWT_SECRET` and `JWT_REFRESH_SECRET`. | CONFIRMED-BY-READING |

---

## 5. Production-Readiness Checklist

| Area | Status | Evidence / Notes |
| :--- | :---: | :--- |
| **Secrets Management** | **PASS** | `.env` is uncommitted and excluded from git history. |
| **Authentication** | **FAIL** | `authenticate.js` rejects UUID tokens (`F-01`); dev token bypass exists (`F-04`). |
| **Authorization** | **FAIL** | `GET /api/v1/analytics/overview` is public (`F-02`); no admin role middleware. |
| **Input Validation** | **WARN** | Most inputs validated via Zod, but variant IDs lack `.uuid()` validation (`F-12`). |
| **Database Transactions** | **PASS** | Zero transaction leaks; all queries inside `db.transaction` use `tx`. |
| **Database Constraints** | **PASS** | `orders_user_id_idempotency_key_unique` and FK constraints present in live DB. |
| **Migrations** | **WARN** | Relies on `drizzle-kit push`; baseline migrations via `generate` needed for RDS. |
| **Logging Security** | **FAIL** | `pinoHttp` does not redact Authorization or Cookie headers (`F-09`). |
| **Rate Limiting** | **FAIL** | Missing `trust proxy` will cause global IP lockout behind AWS ALB (`F-06`). |
| **CORS & Cookies** | **PASS** | `credentials: true`, explicit origin, and `secure` cookies in production. |
| **Dependency Security** | **WARN** | `npm audit` could not reach registry (offline); dependencies unverified. |
| **Automated Tests** | **FAIL** | No automated tests exist for auth edge cases, idempotency, or backorder tracking. |

---

## 6. What Is Implemented Well

1. **Transaction & Concurrency Discipline**: `createOrder` applies `pg_advisory_xact_lock`, sorts variant IDs ascending to prevent deadlock cycles, and executes all operations within a single atomic transaction.
2. **Timing Attack Defenses**: `authService.loginUser` performs a dummy bcrypt hash comparison against `DUMMY_HASH` when accounts do not exist or lack passwords.
3. **Data Integrity & Server Calculations**: All order pricing and subtotal sums are computed on the server using database prices; client prices are completely ignored.
4. **Idempotency Protection**: Orders enforce a composite unique constraint on `(user_id, idempotency_key)` in PostgreSQL, returning consistent 409 Conflict if payload changes.
5. **Clean Token Architecture**: Refresh tokens are stored in `httpOnly` secure cookies with server-side version rotation on logout (`refresh_token_version`), while access tokens remain strictly in-memory on the client.

---

## 7. Not Checked / Needs Human & Business Decision

1. **Production Backorder Lead Time**: What is the manufacturing and shipping SLA for backordered items? Should the UI explicitly alert the user that an item is on backorder before payment?
2. **Admin Provisioning Policy**: Who is the initial store administrator, and how should initial administrative credentials be created (e.g. AWS Secrets Manager seed script vs. CLI)?
3. **External Dependencies (`npm audit`)**: `npm audit` could not connect to `registry.npmjs.org` in this environment. A vulnerability audit must be executed on an internet-connected pipeline.
4. **GST / Tax & Dynamic Shipping**: Shipping is currently hardcoded to a flat ₹100 (`10000` paise). Does the business require dynamic courier rate calculation or GST tax line items?

---

## 8. Proposed Fix Plan in Ordered Batches

> [!IMPORTANT]
> Per audit instructions, **NO CODE CHANGES HAVE BEEN APPLIED**. The fixes below are proposed for subsequent execution.

### Batch 1: Critical Security & Functionality Fixes (Must-Fix Before Launch)
- **Findings Covered**: F-01, F-02, F-03, F-04, F-05, F-06
- **Files Touched**:
  - `backend/middleware/authenticate.js` (fix UUID user ID check)
  - `backend/middleware/requireAdmin.js` (create admin authorization middleware)
  - `backend/routes/analyticsRoutes.js` (protect overview route)
  - `backend/services/authService.js` (remove dev token bypass, integrate Google client ID verification)
  - `backend/config/env.js` (add `GOOGLE_CLIENT_ID`, minimum secret lengths)
  - `backend/app.js` (enable `trust proxy`)
  - `frontend/src/utils/cart.js` (remove hardcoded seed UUIDs, fetch variant IDs from catalog)
- **Verification Method**:
  1. Login with credentials and verify `GET /api/v1/auth/me` returns 200 with user profile.
  2. Verify `GET /api/v1/analytics/overview` returns 401 for anonymous and 403 for customer users.
  3. Verify `dev_mock_google_token` is rejected with 401.

### Batch 2: High Severity Integrity & Privacy Fixes
- **Findings Covered**: F-07, F-08, F-09, F-10
- **Files Touched**:
  - `backend/db/schema.js` (add `backordered_qty` to `order_items`)
  - `backend/services/orderService.js` (calculate and record `backordered_qty`)
  - `backend/services/authService.js` (handle account linking safely)
  - `backend/app.js` (configure `pinoHttp` redact rules)
  - `backend/scripts/createAdmin.js` (create CLI command to provision admin users)
- **Verification Method**:
  1. Place an order for 5 units when stock is 2; verify `stock_qty = 0` and `order_items.backordered_qty = 3`.
  2. Inspect HTTP log output and verify `Authorization` and `Cookie` headers appear as `[Redacted]`.

### Batch 3: Medium & Low Polish
- **Findings Covered**: F-11, F-12, F-13, F-14, F-15, F-16
- **Files Touched**:
  - `backend/services/analyticsService.js` (filter revenue by paid status, IST date grouping)
  - `backend/validators/*.js` (enforce `.uuid()`)
  - `backend/docker-compose.yml` (update to postgres:16-alpine)
  - `backend/services/cacheService.js` (clean up dead code)
- **Verification Method**:
  1. Seed test database, verify analytics only counts paid orders.
  2. Pass malformed string to `/api/v1/orders/:id` and verify clean 400 validation error.
