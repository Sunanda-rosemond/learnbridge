BEGIN;

CREATE TABLE courses (
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT courses_tenant_id_unique
        UNIQUE (tenant_id, id),

    CONSTRAINT courses_title_not_blank
        CHECK (length(btrim(title)) > 0)
);

COMMIT;