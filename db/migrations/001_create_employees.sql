BEGIN;

CREATE TABLE employees (
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    external_employee_id TEXT NOT NULL,
    work_email TEXT NOT NULL,
    employment_status TEXT NOT NULL,
    manager_external_id TEXT,
    manager_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT employees_external_identity_unique
        UNIQUE (tenant_id, source_system, external_employee_id),

    CONSTRAINT employees_tenant_id_unique
        UNIQUE (tenant_id, id),

    CONSTRAINT employees_status_check
        CHECK (employment_status IN ('ACTIVE', 'INACTIVE')),

    CONSTRAINT employees_manager_not_self
        CHECK (manager_id IS NULL OR manager_id <> id),

    CONSTRAINT employees_manager_same_tenant_fk
        FOREIGN KEY (tenant_id, manager_id)
        REFERENCES employees (tenant_id, id)
);

CREATE INDEX employees_manager_idx
    ON employees (tenant_id, manager_id);

COMMIT;