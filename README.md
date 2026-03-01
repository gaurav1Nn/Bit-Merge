# 🔗 Bitespeed Identity Reconciliation Service

A production-grade backend service that identifies and consolidates customer contacts across multiple purchases — even when different email addresses and phone numbers are used for each order.

Built as part of the [Bitespeed Backend Task](https://bitespeed.io).

**🌐 Live Endpoint:** `https://bit-merge.onrender.com/identify`

---

## 📋 Table of Contents

- [Problem Statement](#problem-statement)
- [Solution Architecture](#solution-architecture)
- [Tech Stack](#tech-stack)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Identity Reconciliation Logic](#identity-reconciliation-logic)
- [Local Development Setup](#local-development-setup)
- [Running Tests](#running-tests)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)
- [Available Scripts](#available-scripts)

---

## Problem Statement

FluxKart.com needs to track customers who use **different email addresses and phone numbers** across purchases. The challenge is to link all contact information belonging to the same person under one identity — treating the oldest contact as **primary** and all subsequent linked contacts as **secondary**.

### Example

A customer places two orders:
1. `email: lorraine@hillvalley.edu` + `phone: 123456`
2. `email: mcfly@hillvalley.edu` + `phone: 123456`

Since both orders share the same phone number, they belong to the same person. The service consolidates them:

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

---

## Solution Architecture

```
Client Request
      │
      ▼
┌─────────────────┐
│  Express Server  │  cors, helmet, morgan, connect-timeout (10s)
├─────────────────┤
│  Validation      │  Type coercion, sanitization, presence check
├─────────────────┤
│  Controller      │  Route handler
├─────────────────┤
│  Service Layer   │  Identity reconciliation logic
│  (Serializable   │  with deadlock retry (3 attempts)
│   Transaction)   │
├─────────────────┤
│  Prisma ORM      │  Query builder + migration management
├─────────────────┤
│  PostgreSQL      │  Indexed on email, phoneNumber, linkedId
└─────────────────┘
```

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Runtime | Node.js 18+ | Industry standard, async I/O |
| Language | TypeScript 5 (strict) | Type safety, better DX |
| Framework | Express 4 | Mature, well-documented |
| ORM | Prisma 5 | Type-safe queries, migrations |
| Database | PostgreSQL 15 | ACID compliance, Serializable isolation support |
| Security | Helmet + CORS | HTTP security headers |
| Testing | Jest + Supertest | Integration testing against real DB |
| Hosting | Render.com | Free tier, blueprint deploys |

---

## API Reference

### `POST /identify`

Identifies or creates contacts and returns the consolidated identity.

**Request Body:**

```json
{
  "email": "string (optional)",
  "phoneNumber": "string | number (optional)"
}
```

> At least one of `email` or `phoneNumber` must be provided. `phoneNumber` sent as a number is automatically coerced to string. Emails are lowercased and trimmed.

**Success Response (200):**

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

| Field | Description |
|-------|-------------|
| `primaryContatctId` | ID of the primary contact |
| `emails` | All linked emails, primary's first |
| `phoneNumbers` | All linked phone numbers, primary's first |
| `secondaryContactIds` | IDs of all secondary contacts |

**Error Response (400):**

```json
{
  "error": "At least one of email or phoneNumber is required"
}
```

### `GET /`

Health check endpoint.

```json
{ "status": "ok" }
```

---

## Database Schema

```sql
CREATE TABLE "Contact" (
    id              SERIAL PRIMARY KEY,
    "phoneNumber"   VARCHAR,
    email           VARCHAR,
    "linkedId"      INTEGER REFERENCES "Contact"(id),
    "linkPrecedence" "LinkPrecedence" NOT NULL,  -- 'primary' | 'secondary'
    "createdAt"     TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3),
    "deletedAt"     TIMESTAMP(3)
);

-- Performance indexes
CREATE INDEX idx_contact_email ON "Contact"(email);
CREATE INDEX idx_contact_phone ON "Contact"("phoneNumber");
CREATE INDEX idx_contact_linked ON "Contact"("linkedId");
```

**Design:** All secondary contacts point **directly** to their primary (`linkedId` → primary's `id`). This flat, 1-level structure ensures `updateMany` works correctly during primary demotion.

---

## Identity Reconciliation Logic

The service handles four distinct scenarios on every `/identify` request:

### Case 1: No Existing Contacts

A brand-new customer. Creates a `primary` contact.

```
Request: { email: "new@example.com", phone: "111" }
Result:  Creates Contact(id=1, primary)
```

### Case 2: Partial Match — New Information

Shares an email or phone with an existing contact but brings new info. Creates a `secondary` contact linked to the primary.

```
Existing: Contact(id=1, email: "a@x.com", phone: "111", primary)
Request:  { email: "b@x.com", phone: "111" }
Result:   Creates Contact(id=2, email: "b@x.com", phone: "111", secondary, linkedId=1)
```

### Case 3: Two Primary Groups Linked

The request connects two previously separate primary contacts. The **older** one stays primary; the **newer** one is demoted to secondary, and all its secondaries are re-linked.

```
Existing: Contact(id=1, email: "a@x.com", phone: "111", primary)
          Contact(id=2, email: "b@x.com", phone: "222", primary)
Request:  { email: "a@x.com", phone: "222" }
Result:   Contact(id=2) demoted to secondary under Contact(id=1)
```

### Case 4: Exact Duplicate

No new information provided. Returns the existing consolidated group without creating any new rows.

---

## Local Development Setup

### Prerequisites

- **Node.js** 18 or higher
- **Docker** and **Docker Compose**

### Step-by-Step

```bash
# Clone the repository
git clone https://github.com/gaurav1Nn/Bit-Merge.git
cd Bit-Merge

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start PostgreSQL (runs on port 5433 to avoid conflicts)
docker-compose up -d

# Run database migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate

# Start development server (hot reload)
npm run dev
```

The server will be available at **http://localhost:3000**.

### Quick Test

```bash
# Health check
curl http://localhost:3000/

# Create a contact
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"lorraine@hillvalley.edu","phoneNumber":"123456"}'

# Link a second contact
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"mcfly@hillvalley.edu","phoneNumber":"123456"}'
```

---

## Running Tests

The test suite runs against an isolated `bitespeed_test` database (auto-created by Docker via `init.sql`).

```bash
# Migrate the test database (first time only)
# PowerShell:
$env:DATABASE_URL='postgres://admin:admin123@localhost:5433/bitespeed_test'; npx prisma migrate deploy

# Bash:
DATABASE_URL=postgres://admin:admin123@localhost:5433/bitespeed_test npx prisma migrate deploy

# Run all tests
npm test
```

### Test Coverage

| # | Scenario | What it validates |
|---|----------|-------------------|
| 1 | New contact creation | Creates primary, correct response shape |
| 2 | Secondary contact creation | Same phone + new email → secondary linked to primary |
| 3 | Primary demotion | Two primaries merged, older stays primary |
| 4 | Exact duplicate request | No new row created |
| 5 | Phone-only query | Returns full linked group |
| 6 | Email-only query | Returns full linked group |
| 7 | Empty body | Returns 400 error |
| 8 | Null field handling | No null values in response arrays |
| 9 | Health check | Returns `{ status: "ok" }` |

---

## Deployment

### Option A: Render Blueprint (Recommended)

1. Push your code to GitHub.
2. Go to [render.com](https://render.com) → **New** → **Blueprint**.
3. Connect the `gaurav1Nn/Bit-Merge` repository.
4. Render reads `render.yaml` and auto-provisions:
   - A **Web Service** with auto-build and migrations
   - A **PostgreSQL database** (free tier)
5. `DATABASE_URL` is injected automatically.

### Option B: Manual Deploy on Render

1. **Create a PostgreSQL database** on Render Dashboard → New → PostgreSQL.
2. **Create a Web Service** → Connect GitHub repo.
3. Configure:
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm start`
4. **Add Environment Variable:**
   - `DATABASE_URL` = your Render PostgreSQL internal connection string
   - `NODE_ENV` = `production`

---

## Project Structure

```
Bit-Merge/
├── prisma/
│   ├── schema.prisma              # Contact model, enums, indexes
│   └── migrations/                # Auto-generated migration files
├── src/
│   ├── index.ts                   # Server entry + graceful shutdown + process handlers
│   ├── app.ts                     # Express app, middleware stack, health check
│   ├── config/
│   │   └── index.ts               # Environment config loader
│   ├── routes/
│   │   └── identify.route.ts      # POST /identify route definition
│   ├── controllers/
│   │   └── identify.controller.ts # Request handler → service → response
│   ├── services/
│   │   └── contact.service.ts     # Core reconciliation: findRootPrimary, withRetry, identifyContact
│   ├── middlewares/
│   │   ├── errorHandler.ts        # Global 500 error handler
│   │   └── validateRequest.ts     # Input validation, type coercion, sanitization
│   └── utils/
│       └── logger.ts              # Structured JSON logging
├── tests/
│   └── identify.test.ts           # 9 integration tests (Jest + Supertest)
├── docker-compose.yml             # Local PostgreSQL on port 5433
├── init.sql                       # Creates bitespeed_test database
├── render.yaml                    # Render deployment blueprint
├── jest.config.ts                 # Test runner configuration
├── tsconfig.json                  # TypeScript strict config
├── .env.example                   # Environment template
├── .gitignore
└── package.json
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Prisma 5** over Prisma 7 | Prisma 7 introduced breaking schema changes (`url` removal from datasource). Prisma 5 is stable and production-proven. |
| **Serializable isolation** | Prevents race conditions when concurrent requests touch overlapping contacts. Two simultaneous requests can't both create primaries for the same data. |
| **Deadlock retry** (`withRetry`) | Serializable transactions can fail with `P2034` under contention. The retry wrapper catches these and retries up to 3 times. |
| **Flat linking** (1-level deep) | All secondaries point directly to the primary. `findRootPrimary()` with `maxDepth=10` is a safety net against data corruption, not expected traversal. |
| **Input sanitization** | Emails lowercased + trimmed. Phone numbers coerced from `number` to `string`. Prevents duplicate entries from casing/whitespace differences. |
| **connect-timeout (10s)** | Prevents stuck database queries from blocking the server indefinitely. Halt guard prevents double-response after timeout. |
| **Separate test database** | `bitespeed_test` DB created via `init.sql` in Docker. Tests use `TRUNCATE CASCADE` for FK-safe cleanup between runs. |
| **Graceful shutdown** | SIGTERM/SIGINT handlers close HTTP server and Prisma connection before exiting. Prevents connection leaks on Render restarts. |
| **`deletedAt` filtering** | All queries include `deletedAt: null` to support future soft-delete functionality without breaking existing logic. |

---

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start dev server with hot reload via nodemon + tsx |
| `build` | `npm run build` | Compile TypeScript to `dist/` |
| `start` | `npm start` | Run production build from `dist/` |
| `test` | `npm test` | Run integration tests against test DB |
| `prisma:migrate` | `npm run prisma:migrate` | Create and apply new migration |
| `prisma:generate` | `npm run prisma:generate` | Regenerate Prisma Client |
| `prisma:studio` | `npm run prisma:studio` | Open Prisma Studio browser GUI |

---

## Commit History

| # | Message | Scope |
|---|---------|-------|
| 1 | `feat: initialize project with TypeScript, Prisma ORM, Docker PostgreSQL, and Render config` | Project setup |
| 2 | `feat: add Express server with routing, request validation, input sanitization, and graceful shutdown` | Server + middleware |
| 3 | `feat: implement core identity reconciliation with Serializable transactions and primary demotion` | Core logic |
| 4 | `test: add integration tests for all identity reconciliation scenarios with isolated test database` | Test suite |
| 5 | `feat: production hardening with request timeout and comprehensive README documentation` | Polish + docs |

---

## License

ISC
