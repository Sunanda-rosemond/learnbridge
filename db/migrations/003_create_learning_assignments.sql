BEGIN;

CREATE TABLE learning_assignments (
    id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    employee_id UUID NOT NULL,
    course_id UUID NOT NULL,
    training_cycle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ASSIGNED',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT assignments_identity_unique
        UNIQUE (tenant_id, employee_id, course_id, training_cycle),

    CONSTRAINT assignments_employee_same_tenant_fk
        FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employees (tenant_id, id),

    CONSTRAINT assignments_course_same_tenant_fk
        FOREIGN KEY (tenant_id, course_id)
        REFERENCES courses (tenant_id, id),

    CONSTRAINT assignments_cycle_not_blank
        CHECK (length(btrim(training_cycle)) > 0),

    CONSTRAINT assignments_status_check
        CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED')),

    CONSTRAINT assignments_completion_check
        CHECK (
            (status = 'COMPLETED' AND completed_at IS NOT NULL)
            OR
            (status <> 'COMPLETED' AND completed_at IS NULL)
        )
);

CREATE INDEX assignments_course_idx
    ON learning_assignments (tenant_id, course_id);

COMMIT;