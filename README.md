# LearnBridge

Employee provisioning and CSV import prototype built with Node.js, Express, TypeScript and PostgreSQL.

LearnBridge explores how employers can reduce manual data handling between HR, identity and learning systems. This milestone implements employee ingestion; external identity providers and learning platforms are future integrations.

**Milestone:** Git tag `v0.1.0`. The current `package.json` version is `1.0.0`; it has not been aligned with the milestone tag.

See [SOLUTION.md](./SOLUTION.md) for the product hypothesis, scope and design rationale. This README describes the implemented prototype and how to run it.

## Implemented features

- Create or update employees through JSON requests and CSV imports.
- Return `CREATED`, `UPDATED` or `UNCHANGED` for provisioning.
- Validate inputs with Zod and return clear HTTP errors.
- Persist employees across API restarts in PostgreSQL.
- Enforce external-identity uniqueness within a tenant and source.
- Recover from concurrent creation conflicts with one bounded retry.
- Reject conflicting CSV duplicates; group identical rows into one operation.
- Return one result per CSV data row.
- Resolve pending manager relationships when a manager arrives later in sequential processing.
- Exercise service, HTTP, CSV and database behaviour with 22 tests at the milestone.

## Architecture

```mermaid
flowchart TD
    JSON["JSON provisioning request"] --> HTTP["Provisioning controller"]
    CSV["CSV upload"] --> IMPORT["Parse, validate and detect duplicates"]
    HTTP --> SERVICE["Employee provisioning service"]
    IMPORT --> SERVICE
    SERVICE --> CONTRACT["Employee repository interface"]
    CONTRACT --> MEMORY["In-memory repository for tests"]
    CONTRACT --> PG["PostgreSQL repository"]
```

The service owns employee rules. Adapters translate inputs, and repositories handle storage. `createApp()` defaults to fresh in-memory storage for tests. `server.ts` explicitly supplies the PostgreSQL repository for the running application.

## Prerequisites

- Node.js and npm compatible with the dependencies in `package-lock.json`.
- Docker Desktop running with Docker Compose available.
- Git and Windows PowerShell for the commands below.
- Available host ports `3000` for the API and `5434` for PostgreSQL.

An exact supported Node.js version has not yet been pinned in the project. TypeScript's `@types/node` version does not identify the installed Node runtime.

## First-time setup

Run commands from the repository root. If already cloned, skip the clone step.

```powershell
git clone https://github.com/Sunanda-rosemond/learnbridge.git
cd learnbridge
npm ci
```

Create your local environment file only if one does not already exist:

```powershell
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
}
```

The local configuration should contain:

```dotenv
DATABASE_URL=postgresql://learnbridge:learnbridge_local@localhost:5434/learnbridge
TEST_DATABASE_URL=postgresql://learnbridge:learnbridge_local@localhost:5434/learnbridge_test
PORT=3000
```

These credentials belong to the local development container. Keep `.env` out of Git; commit `.env.example` for setup documentation.

Start PostgreSQL 17 and check readiness:

```powershell
docker compose up -d
docker compose ps
docker compose exec postgres psql -U learnbridge -d learnbridge -c "SELECT current_database(), current_user;"
```

PostgreSQL is exposed on `127.0.0.1:5434`, mapped to container port `5432`. A named volume preserves its data.

Apply the initial migration **once per new database**:

```powershell
Get-Content -Raw db/migrations/001_create_employees.sql |
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U learnbridge -d learnbridge
```

Create the separate test database and apply its migration, also once:

```powershell
docker compose exec postgres psql -U learnbridge -d postgres -c "CREATE DATABASE learnbridge_test;"

Get-Content -Raw db/migrations/001_create_employees.sql |
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U learnbridge -d learnbridge_test
```

Migrations are currently applied manually. An "already exists" error on a previously initialized database is not a reason to delete its data or rerun initialization.

## Run the API

```powershell
npm run typecheck
npm run dev
```

In a second terminal:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

Expected response:

```json
{ "status": "ok", "service": "learnbridge-api" }
```

For compiled execution, stop the development server first:

```powershell
npm run build
npm start
```

The health endpoint is a basic process check, not a continuous database-readiness check.

## API

| Method | Endpoint               | Request            | Successful response                                 |
| ------ | ---------------------- | ------------------ | --------------------------------------------------- |
| GET    | `/health`              | None               | 200, health object                                  |
| POST   | `/employees/provision` | `application/json` | 201 for `CREATED`; 200 for `UPDATED` or `UNCHANGED` |
| POST   | `/employees/import`    | `text/csv`         | 200, import report including row rejections         |

The routes use fixed server-side context: tenant `demo-employer`, source `demo-hr`. They do not select tenants from client headers. Authentication and authorization are not implemented; use synthetic data in this local prototype.

### Provision an employee

```powershell
$employeeBody = @{
  externalEmployeeId = "EMP-204"
  workEmail = "employee@example.com"
  employmentStatus = "ACTIVE"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3000/employees/provision" `
  -Method Post `
  -ContentType "application/json" `
  -Body $employeeBody |
  ConvertTo-Json -Depth 5
```

For a new identity, expect `CREATED`. An identical repeat returns `UNCHANGED` with the same internal ID. Changing the email or status returns `UPDATED`. With PostgreSQL configured, these records survive an API restart.

| Field                                | Rule                                                          |
| ------------------------------------ | ------------------------------------------------------------- |
| `externalEmployeeId`                 | Required, non-empty string; unique within tenant and source   |
| `workEmail`                          | Required, valid email format                                  |
| `employmentStatus`                   | `ACTIVE` or `INACTIVE`                                        |
| `managerExternalId` omitted          | Preserve existing reference; use null for a new employee      |
| `managerExternalId: null`            | Remove manager relationship                                   |
| `managerExternalId` containing an ID | Resolve within tenant/source, or retain the pending reference |

An employee cannot be their own manager. Employment status is stored; session revocation and learning-access enforcement are not yet implemented.

### Import a CSV

Use the committed `samples/employees.csv`:

```csv
externalEmployeeId,workEmail,employmentStatus,managerExternalId
CSV-MGR-100,manager@example.com,ACTIVE,
CSV-EMP-204,rose@example.com,ACTIVE,CSV-MGR-100
CSV-EMP-204,rose@example.com,ACTIVE,CSV-MGR-100
CSV-EMP-300,other@example.com,ACTIVE,
CSV-EMP-300,other@example.com,INACTIVE,
CSV-EMP-400,not-an-email,ACTIVE,
```

```powershell
$importResult = Invoke-RestMethod `
  -Uri "http://localhost:3000/employees/import" `
  -Method Post `
  -ContentType "text/csv; charset=utf-8" `
  -InFile "samples/employees.csv"

$importResult | ConvertTo-Json -Depth 6
```

| Count      | First import with new sample IDs | Identical repeat |
| ---------- | -------------------------------: | ---------------: |
| totalRows  |                                6 |                6 |
| created    |                                2 |                0 |
| updated    |                                0 |                0 |
| unchanged  |                                0 |                2 |
| duplicates |                                1 |                1 |
| rejected   |                                3 |                3 |

Only the manager and `CSV-EMP-204` are stored. Actual counts depend on existing database records.

Import rules:

- Maximum body size: 1 MiB; maximum data records: 1,000.
- Required headers: `externalEmployeeId`, `workEmail`, `employmentStatus`. `managerExternalId` is optional. Order can vary; duplicate or unknown headers are rejected.
- A missing manager column preserves relationships; a blank manager cell explicitly removes a relationship.
- Broken CSV syntax, invalid headers and empty datasets reject the file before writes.
- Invalid field values or wrong cell counts produce row-level rejections.
- Identical validated duplicates are provisioned once. Extra rows are marked `DUPLICATE` only after successful provisioning.
- Conflicting duplicates are all rejected. An identifiable invalid row also blocks valid companion rows for that employee.
- Each logical data record gets one result. Numbering starts at 2, counting the header as 1; skipped blank lines and multiline fields mean these are not necessarily physical text-line numbers.
- Preparation completes before provisioning starts. Accepted groups are processed sequentially and independently; the entire file is not one transaction.
- A 200 response means a report was generated, not that every row succeeded. Inspect `rejected` and `rows`.

### Error responses

| HTTP status | Error                    | Meaning                                                |
| ----------- | ------------------------ | ------------------------------------------------------ |
| 400         | `VALIDATION_ERROR`       | JSON employee fields failed validation                 |
| 400         | `INVALID_JSON`           | Malformed JSON body                                    |
| 400         | `INVALID_CSV`            | Invalid file structure, headers or parser-level limits |
| 413         | `PAYLOAD_TOO_LARGE`      | Request body exceeds the parser limit                  |
| 415         | `UNSUPPORTED_MEDIA_TYPE` | Import endpoint did not receive `text/csv`             |
| 500         | `INTERNAL_SERVER_ERROR`  | Unexpected error propagated to the application handler |

Provisioning failures caught inside a CSV import appear as row-level `PROVISIONING_FAILED` results in its 200 report.

## Tests

| Command                    | Coverage                                                       | Tests at milestone | PostgreSQL required?    |
| -------------------------- | -------------------------------------------------------------- | -----------------: | ----------------------- |
| `npm test`                 | Provisioning service and JSON HTTP endpoint                    |                  9 | No                      |
| `npm run test:db`          | Persistence, constraints, creation conflict and reconciliation |                  5 | Yes, `learnbridge_test` |
| `npm run test:csv`         | CSV preparation and complete import service                    |                  4 | No                      |
| `npm run test:import:http` | CSV endpoint and HTTP request errors                           |                  4 | No                      |

`npm test` alone does not run every suite. To run all checks:

```powershell
npm run typecheck
npm test
npm run test:db
npm run test:csv
npm run test:import:http
```

Supertest starts the application without a separately running API. Database tests use generated tenant IDs, remove their own records, and require the separate `learnbridge_test` database. The concurrent-creation test deliberately pauses both requests before insertion to force a race.

## Data and consistency decisions

- Internal UUIDs identify employees and support relationships; external identifiers remain scoped references.
- PostgreSQL enforces `UNIQUE (tenant_id, source_system, external_employee_id)`.
- A composite manager foreign key enforces manager membership in the same tenant. Repository matching additionally scopes reconciliation to the same source.
- Identical provisioning preserves timestamps. Updates preserve identity and creation time.
- A specific external-identity conflict triggers one retry: re-read, compare, return unchanged or update. Other database errors are not treated as success.
- Manager reconciliation updates unresolved links only. Repeated reconciliation performs no further updates once links are resolved.

## Known limitations

- Local prototype: no authentication, authorization, dynamic tenant selection or production deployment.
- Concurrent creation is tested; concurrent updates do not yet have optimistic locking or a source-version policy. Older inputs can overwrite newer data.
- Manager save and reconciliation are separate operations. A failure between them or simultaneous employee/manager creation can leave links pending until a later retry or reconciliation pass.
- Only self-management is rejected; longer manager cycles are not detected.
- CSV partial success is intentional. A reported provisioning failure can occur after a write if later reconciliation fails; it does not guarantee rollback. Retry and inspect current state.
- Missing-manager warnings and reconciliation counts are not exposed in import reports yet.
- No background reconciliation, outbox, events/webhooks, durable import history, automatic migration runner or comprehensive operational telemetry yet.
- Courses, assignments, SSO, SCIM, LMS integration and product AI are planned, not implemented.

## Useful local commands

```powershell
docker compose logs postgres
docker compose exec postgres psql -U learnbridge -d learnbridge -c "\d employees"
docker compose down
```

`docker compose down` preserves the named volume. `docker compose down -v` deletes it, including both databases. Changing initial database credentials in Compose does not reinitialize an existing volume.

## Next steps

Keep the prototype demonstrable while introducing trusted identity/tenant context, learning assignments, reliable event delivery and real integrations in scoped increments. See [SOLUTION.md](./SOLUTION.md) for the broader product plan.
