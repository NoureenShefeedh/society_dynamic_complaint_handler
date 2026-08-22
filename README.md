# Society Maintenance Tracker

A complaint management platform for apartment societies. Residents raise and track maintenance complaints with photos; admins manage them through a status workflow with automatic priority scoring, overdue detection, a notice board, and email notifications.

**Live app:** https://society-dynamic-complaint-handler-1.onrender.com
**Backend API:** https://society-dynamic-complaint-handler.onrender.com

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Setup guide](#setup-guide)
- [Environment variables](#environment-variables)
- [Database schema](#database-schema)
- [API documentation](#api-documentation)
- [Notes on hosting](#notes-on-hosting)

---

## Features

**Resident**

- Register, log in, raise a complaint with category, description, and optional photo
- View own complaints with full status history
- Confirm a Resolved complaint is actually fixed, or reopen it with a note if it isn't

**Admin**

- View all complaints, filter by status/category/date, on a Kanban-style board
- Priority is computed automatically (not just picked) from a trained ML classifier on the complaint text, category severity, days open, and recurrence — see [system design doc](./SYSTEM_DESIGN.md)
- Update status (Open → In Progress → Resolved), each change logged with timestamp, actor, and note
- Resolving a complaint requires a photo as proof of work
- Overdue complaints (past a configurable per-category threshold) surface automatically
- Complaints that recur 3+ times in the same category within 14 days are automatically linked as one recurring issue
- Assign a staff member to a complaint
- Post notices, optionally pinned as "important" (also emailed to all residents)
- Dashboard: totals by status/category, overdue count, top units by complaint volume, average resolution time by category

**Both roles**

- Email notification on complaint status change and on important notices

---

## Demo credentials

For quick evaluation without creating an account:

| Role  | Email             | Password     |
| ----- | ----------------- | ------------ |
| Admin | admin@example.com | adminPass123 |

Residents can self-register via the Sign Up page on the live app — no demo account needed for that role.

---

## Tech stack

| Layer         | Technology                                        |
| ------------- | ------------------------------------------------- |
| Frontend      | React (Vite), React Router, Axios                 |
| Backend       | Node.js, Express                                  |
| Database      | PostgreSQL (Supabase)                             |
| File storage  | Supabase Storage                                  |
| ML classifier | Python, scikit-learn (TF-IDF + Linear Regression) |
| Email         | Nodemailer (Gmail SMTP)                           |
| Hosting       | Render (backend + frontend)                       |

---

## Project structure

```
society-tracker/
├── client/                     # React frontend
│   └── src/
│       ├── api/                # Axios instance with auth interceptor
│       ├── components/         # Navbar, badges, route guard
│       ├── context/             # Auth context (JWT + user state)
│       └── pages/               # Login, Signup, ResidentDashboard, AdminBoard, NoticeBoard, AdminDashboard
├── server/                     # Express backend
│   └── src/
│       ├── controllers/         # Route handlers
│       ├── routes/              # Express routers
│       ├── middleware/          # Auth (JWT), role guard, file upload
│       ├── utils/               # Priority engine, classifier bridge, email, Supabase client
│       ├── ml/                  # Python classifier: training data, train.py, predict.py
│       └── db/
│           └── schema.sql       # Full database schema
└── README.md
```

---

## Setup guide

### Prerequisites

- Node.js 18+
- Python 3.9+ (for the ML classifier)
- A free [Supabase](https://supabase.com) project (Postgres + Storage)
- A Gmail account with an [App Password](https://myaccount.google.com/apppasswords) (for email)

### 1. Clone and install

```bash
git clone https://github.com/NoureenShefeedh/society_dynamic_complaint_handler.git
cd society_dynamic_complaint_handler

cd server && npm install
cd ../client && npm install
```

### 2. Set up the database

In your Supabase project's SQL Editor, run the contents of `server/db/schema.sql`. This creates all tables and seeds the starting categories.

### 3. Set up Supabase Storage

Create a **public** bucket named `complaint-photos` (Storage → New bucket).

### 4. Configure environment variables

Copy `server/.env.example` to `server/.env` and fill in real values (see [Environment variables](#environment-variables) below).

Copy `client/.env.example` to `client/.env`:

```
VITE_API_URL=http://localhost:5000
```

### 5. Train the ML classifier

```bash
cd server/src/ml
pip install -r requirements.txt
python3 generate_training_data.py
python3 train.py
```

### 6. Create your admin account

```bash
cd server
node src/utils/createAdmin.js "Your Name" admin@example.com yourPassword123
```

(Public signup only ever creates resident accounts, by design.)

### 7. Run it

In two separate terminals:

```bash
cd server && npm run dev    # http://localhost:5000
cd client && npm run dev    # http://localhost:5173
```

---

## Environment variables

`server/.env`:

| Variable                         | Description                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `PORT`                           | Backend port (default 5000)                                                                  |
| `CLIENT_URL`                     | Frontend URL, used for CORS                                                                  |
| `DATABASE_URL`                   | Supabase Postgres **pooled** connection string (port 6543)                                   |
| `SUPABASE_URL`                   | Supabase project URL                                                                         |
| `SUPABASE_SERVICE_ROLE_KEY`      | Supabase service role key (backend-only, bypasses RLS)                                       |
| `SUPABASE_STORAGE_BUCKET`        | Storage bucket name (`complaint-photos`)                                                     |
| `JWT_SECRET`                     | Any long random string, used to sign auth tokens                                             |
| `JWT_EXPIRES_IN`                 | Token lifetime (e.g. `7d`)                                                                   |
| `EMAIL_HOST` / `EMAIL_PORT`      | SMTP host/port (Gmail: `smtp.gmail.com` / `587`)                                             |
| `EMAIL_USER`                     | Sending Gmail address                                                                        |
| `EMAIL_APP_PASSWORD`             | Gmail App Password (not your real password)                                                  |
| `EMAIL_FROM`                     | Display name/address for outgoing email                                                      |
| `OVERDUE_CHECK_INTERVAL_MINUTES` | Reserved for a future background job; overdue is currently recalculated live on each request |

See `server/.env.example` for the full template.

`client/.env`:

| Variable       | Description                 |
| -------------- | --------------------------- |
| `VITE_API_URL` | Base URL of the backend API |

---

## Database schema

Full schema: [`server/db/schema.sql`](./server/db/schema.sql)

**Tables:**

- **`users`** — residents and admins, role-restricted (`resident` \| `admin`)
- **`categories`** — complaint categories, each with a `severity_weight` (1-10) and `overdue_threshold_days`
- **`complaints`** — the complaint itself: status, computed priority score/label, photo URLs, recurrence group, assignee
- **`complaint_history`** — append-only audit log; every status change, creation, and priority override is a row here with actor, old/new status, a priority snapshot, and an optional note. This table is the single source of truth for a complaint's full lifecycle — `complaints.status` is just a convenience cache of the latest entry.
- **`notices`** — admin-posted notices, with an `is_important` flag for pinning

See the [system design write-up](./SYSTEM_DESIGN.md) for the reasoning behind this model.

---

## API documentation

Base URL: `/api`. All routes except `/auth/signup` and `/auth/login` require `Authorization: Bearer <token>`.

### Auth

| Method | Route          | Access | Description                       |
| ------ | -------------- | ------ | --------------------------------- |
| POST   | `/auth/signup` | Public | Create a resident account         |
| POST   | `/auth/login`  | Public | Log in, returns `{ user, token }` |
| GET    | `/auth/me`     | Any    | Get own profile                   |

### Complaints

| Method | Route                      | Access         | Description                                                                        |
| ------ | -------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| POST   | `/complaints`              | Resident       | Create a complaint (multipart, field `photo` optional)                             |
| GET    | `/complaints/mine`         | Resident       | List own complaints with history                                                   |
| GET    | `/complaints`              | Admin          | List all complaints. Query params: `status`, `category_id`, `from_date`, `to_date` |
| GET    | `/complaints/:id`          | Owner or Admin | Single complaint with full history                                                 |
| PATCH  | `/complaints/:id/status`   | Admin          | Update status (multipart; `photo` required when `new_status=Resolved`)             |
| PATCH  | `/complaints/:id/priority` | Admin          | Manually override priority (`priority_label`: Low/Medium/High)                     |
| PATCH  | `/complaints/:id/assign`   | Admin          | Assign a staff member (`assignee_name`)                                            |
| POST   | `/complaints/:id/confirm`  | Resident (own) | Confirm a Resolved complaint is actually fixed                                     |
| POST   | `/complaints/:id/reopen`   | Resident (own) | Reopen a Resolved complaint with a note                                            |

### Notices

| Method | Route      | Access | Description                                       |
| ------ | ---------- | ------ | ------------------------------------------------- |
| POST   | `/notices` | Admin  | Create a notice (`title`, `body`, `is_important`) |
| GET    | `/notices` | Any    | List notices, important ones first                |

### Dashboard

| Method | Route        | Access | Description                                                                  |
| ------ | ------------ | ------ | ---------------------------------------------------------------------------- |
| GET    | `/dashboard` | Admin  | Stats: by status, by category, overdue count, top units, avg resolution time |

### Categories

| Method | Route         | Access | Description                                               |
| ------ | ------------- | ------ | --------------------------------------------------------- |
| GET    | `/categories` | Any    | List all categories (used to populate the complaint form) |

### Health

| Method | Route     | Access | Description                                        |
| ------ | --------- | ------ | -------------------------------------------------- |
| GET    | `/health` | Public | Confirms the API and database connection are alive |

---

## Notes on hosting

Both frontend and backend are hosted on Render's free tier. The backend may take up to ~30 seconds to respond on its first request after a period of inactivity (free-tier services sleep after 15 minutes idle) — this is expected and not an error. The database (Supabase free tier) auto-pauses after 7 days of no activity; an uptime monitor pings `/health` periodically to prevent this.
