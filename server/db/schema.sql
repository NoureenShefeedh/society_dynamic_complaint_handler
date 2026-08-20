-- Society Maintenance Tracker — Database Schema
-- Run this in Supabase SQL editor (or any Postgres instance)

-- ============================
-- USERS
-- ============================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('resident', 'admin')),
    unit_number     TEXT,                     -- e.g. "B-204", null for admin
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- CATEGORIES (configurable severity weight + SLA threshold)
-- ============================
CREATE TABLE categories (
    id                  SERIAL PRIMARY KEY,
    name                TEXT UNIQUE NOT NULL,      -- e.g. "Plumbing", "Electrical", "Cosmetic"
    severity_weight     INTEGER NOT NULL DEFAULT 5, -- 1-10, used in priority scoring
    overdue_threshold_days INTEGER NOT NULL DEFAULT 5 -- configurable per category
);

-- ============================
-- COMPLAINTS
-- ============================
CREATE TABLE complaints (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id         UUID NOT NULL REFERENCES users(id),
    category_id         INTEGER NOT NULL REFERENCES categories(id),
    description         TEXT NOT NULL,
    photo_url            TEXT,                       -- Supabase Storage URL
    status              TEXT NOT NULL DEFAULT 'Open'
                            CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Reopened')),
    priority_label       TEXT NOT NULL DEFAULT 'Medium'
                            CHECK (priority_label IN ('Low', 'Medium', 'High')),
    priority_score       NUMERIC NOT NULL DEFAULT 0,  -- computed score behind the label
    initial_severity_score NUMERIC,                    -- from the ML classifier, at creation time
    recurrence_group_id  UUID,                         -- links duplicate/similar complaints together
    assignee_name         TEXT,                         -- staff member dispatched (simple text field)
    resolution_photo_url  TEXT,                         -- proof-of-work photo on resolve
    resident_confirmed    BOOLEAN NOT NULL DEFAULT FALSE, -- resident confirms the fix
    is_overdue            BOOLEAN NOT NULL DEFAULT FALSE, -- recalculated by a scheduled job/query
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_complaints_resident ON complaints(resident_id);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_category ON complaints(category_id);
CREATE INDEX idx_complaints_recurrence_group ON complaints(recurrence_group_id);

-- ============================
-- COMPLAINT HISTORY (the core lifecycle/audit trail)
-- Every status change, priority override, and note lands here.
-- Never delete or overwrite a row — this table is append-only.
-- ============================
CREATE TABLE complaint_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id    UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    actor_id        UUID NOT NULL REFERENCES users(id),   -- who made the change
    old_status      TEXT,                                  -- null for the creation event
    new_status      TEXT NOT NULL,
    priority_score_at_time NUMERIC,                        -- score snapshot at this event
    note            TEXT,                                  -- optional admin note
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_history_complaint ON complaint_history(complaint_id);
CREATE INDEX idx_history_created_at ON complaint_history(created_at);

-- ============================
-- NOTICES
-- ============================
CREATE TABLE notices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posted_by        UUID NOT NULL REFERENCES users(id),
    title            TEXT NOT NULL,
    body             TEXT NOT NULL,
    is_important     BOOLEAN NOT NULL DEFAULT FALSE,  -- pinned to top when true
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notices_important ON notices(is_important);

-- ============================
-- SEED DATA — starter categories
-- ============================
INSERT INTO categories (name, severity_weight, overdue_threshold_days) VALUES
    ('Plumbing', 8, 3),
    ('Electrical', 9, 2),
    ('Elevator', 9, 2),
    ('Security', 7, 3),
    ('Cleanliness', 4, 5),
    ('Cosmetic / Paint', 2, 10),
    ('Noise', 3, 5),
    ('Other', 5, 5);
