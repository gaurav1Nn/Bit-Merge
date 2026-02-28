# Bitespeed Identity Reconciliation Service

A backend service that identifies and consolidates customer contacts across multiple purchases, even when different email addresses and phone numbers are used.

**Hosted Endpoint:** `<YOUR_RENDER_URL>/identify`

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Database | PostgreSQL 15 |
| Hosting | Render.com |

---

## API

### `POST /identify`

Accepts a JSON body with at least one of `email` or `phoneNumber`:

```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "123456"
}
```

**Response (200):**

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

- The primary contact's email and phone always appear first in the arrays.
- Null values are excluded from arrays.
- Duplicate entries are deduplicated.

### `GET /`

Health check endpoint. Returns `{ "status": "ok" }`.

---

## How It Works

The service maintains a `Contact` table where each row is either `primary` or `secondary`. All secondary contacts point directly to their primary via `linkedId` (flat, 1-level structure).

**Four cases handled on each `/identify` request:**

1. **No match** — Creates a new `primary` contact.
2. **Partial match** (shared email or phone, but new info) — Creates a `secondary` contact linked to the existing primary.
3. **Two separate primaries linked** — The older primary stays; the newer primary is demoted to `secondary` and all its secondaries are re-linked.
4. **Exact duplicate** — No new row created; returns the existing consolidated group.

All mutations run inside **Serializable transactions** with automatic retry on deadlocks.

---

## Database Schema

```
Contact
├── id             Int (PK, auto-increment)
├── phoneNumber    String?
├── email          String?
├── linkedId       Int? (FK → Contact.id)
├── linkPrecedence "primary" | "secondary"
├── createdAt      DateTime
├── updatedAt      DateTime
└── deletedAt      DateTime?
```

Indexes on `email`, `phoneNumber`, and `linkedId` for query performance.

---

## Local Setup

### Prerequisites

- Node.js 18+
- Docker & Docker Compose

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/gaurav1Nn/Bit-Merge.git
cd Bit-Merge

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env

# 4. Start PostgreSQL
docker-compose up -d

# 5. Run database migrations
npx prisma migrate dev

# 6. Start the dev server
npm run dev
```

The server starts at `http://localhost:3000`.

### Running Tests

```bash
# Migrate the test database (first time only)
DATABASE_URL=postgres://admin:admin123@localhost:5433/bitespeed_test npx prisma migrate deploy

# Run tests
npm test
```

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production build |
| `npm test` | Run integration tests against test DB |
| `npm run prisma:migrate` | Create and apply new migration |
| `npm run prisma:generate` | Regenerate Prisma Client |
| `npm run prisma:studio` | Open Prisma Studio GUI |

---

## Deployment (Render)

1. Push to GitHub.
2. On [render.com](https://render.com), create a **New Blueprint Instance** and connect your repo.
3. Render reads `render.yaml` and provisions:
   - A **Web Service** (Node.js) with auto-build and migrations
   - A **PostgreSQL database** (free tier)
4. The `DATABASE_URL` is automatically injected.

### Manual Deploy

1. Create a PostgreSQL database on Render.
2. Create a Web Service with:
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm start`
   - **Environment Variable:** `DATABASE_URL` = your Render PostgreSQL connection string

---

## Project Structure

```
├── prisma/
│   └── schema.prisma              # Database schema + indexes
├── src/
│   ├── index.ts                   # Entry point + graceful shutdown
│   ├── app.ts                     # Express app + middleware
│   ├── config/index.ts            # Environment configuration
│   ├── routes/identify.route.ts   # Route definitions
│   ├── controllers/               # Request handlers
│   ├── services/                  # Business logic
│   ├── middlewares/               # Validation, error handling, timeout
│   └── utils/logger.ts            # Structured logging
├── tests/
│   └── identify.test.ts           # Integration tests (9 scenarios)
├── docker-compose.yml             # Local PostgreSQL
├── init.sql                       # Creates test database
├── render.yaml                    # Render deployment blueprint
└── package.json
```

---

## Design Decisions

- **Prisma 5** over Prisma 7 for production stability (v7 has breaking schema changes).
- **Serializable isolation** prevents race conditions when concurrent requests touch overlapping contacts.
- **Deadlock retry** (`withRetry`) handles PostgreSQL serialization failures (error `P2034`) gracefully.
- **Flat linking** — all secondaries point directly to the primary. `findRootPrimary()` with a `maxDepth` guard exists as a safety net against data corruption.
- **Input sanitization** — emails are lowercased and trimmed; phone numbers are coerced from number to string.
- **Request timeout** (10s) via `connect-timeout` prevents stuck requests from blocking the server.
