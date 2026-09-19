# LearnBridge — Solution Design

Status: pre-implementation draft, based on discovery decisions.
Date: 19 September 2026.

## 1. Customer and problem

The target customer is a medium-sized employer with disconnected HR, identity and learning systems. The learning administrator is the primary user for the first concept test; client technical administrators become essential during integration pilots. Employees consume assigned learning, and authorized managers review completion.

Learning teams manually transfer employee and completion data between systems. This creates duplicated work, delays, inconsistent records and opportunities for error.

LearnBridge will connect existing systems through reusable integrations. It will automate employee provisioning and learning-data transfers without replacing the employer's HR platform, identity provider or LMS.

## 2. Hypotheses and assumptions

Product hypothesis: employers will adopt LearnBridge when reduced manual work and errors outweigh subscription, setup, procurement and security-review costs.

Technical hypothesis: target systems expose sufficient APIs, standards or exports to allow reusable connectors with configuration rather than extensive bespoke development.

Trust hypothesis: employers will approve the necessary access to workforce and learning data when its scope and handling are clear.

The initial CSV concept tests workflow usefulness and usability. It does not prove automated integration savings, production security, connector reuse or client willingness to buy. A later real-system pilot must test those claims.

## 3. Discovery questions

- How do employee and completion records move today, and who handles them?
- How many manual steps, hours and corrections does a typical batch require?
- Which HR platform, identity provider and LMS are used? Which APIs, exports and sandbox accounts are available under the client's subscription?
- Who can grant integration access, and who approves a purchase?
- What information does a manager need, and who authorizes access?
- What measurable improvement would justify adopting LearnBridge?

## 4. One-week concept boundary

Use synthetic data and one employer. Provide CSV employee import, manual course creation and assignment, an employee dashboard, simulated learning launch/completion, completion reporting/export and basic telemetry. Use development identities for the local concept; invitations and real account onboarding remain a separate implementation decision before any external pilot.

The first coding slice is smaller: a Node.js/Express employee-provisioning endpoint returning CREATED, UPDATED or UNCHANGED, backed initially by an in-memory repository. CSV import will call the same service. PostgreSQL follows before durable pilot use.

Deferred: real HR automation, OIDC/SAML, SCIM, Moodle/LTI, SCORM/xAPI, QTI/Caliper, production multi-tenancy, AI, queues, delivery retries and cloud infrastructure. These remain staged integration goals, not requirements for the first week.

CSV is a bridge to early feedback. The product must eventually demonstrate automated transfers to validate its central integration proposition.

## 5. Architecture decision

Use Node.js, Express and TypeScript. Express is familiar and keeps early development focused on integration and product rules. There is no planned requirement to migrate to NestJS.

Use a modular monolith with explicit dependency wiring:

Route → Controller → Service → Repository

Adapters translate source-specific input into an internal provisioning command. Zod schemas provide runtime boundary validation; TypeScript types describe internal data. Tenant and source context come from trusted configuration/authentication, not an unrestricted request field.

React is the planned frontend; PostgreSQL is the durable data store. Azure deployment, infrastructure as code, CI/CD and background processing are later pilot work. Choose additional infrastructure when a concrete requirement warrants it.

## 6. Employee data and provisioning rules

Required incoming fields: externalEmployeeId, workEmail and employmentStatus (ACTIVE or INACTIVE). managerExternalId is optional because a manager may be absent or arrive later.

LearnBridge generates an internal employee ID and stores tenant/source context and timestamps. Internal relationships use the internal ID. Source identity is unique within tenant + source-system instance + external employee ID; a vendor name alone is insufficient if a tenant has multiple connections.

Names, role/department and start date are excluded until a feature needs them. Assignments are manual initially.

Provisioning rules:

- New identity: create the employee and return CREATED.
- Existing identity with changed data: update and return UPDATED.
- Identical data: return UNCHANGED without repeating business effects.
- Invalid row: report the row error; other valid rows can succeed.
- Unknown manager: retain the external reference, leave managerId null and report a warning. Reconcile after the manager arrives.
- Changed manager: remove the old relationship immediately; resolve the new relationship within the same tenant/source context.
- Deactivation: block learning access, preserve history and record the transition. Session invalidation must be implemented when sessions exist.
- Reactivation: restore eligibility; do not recreate expired or cancelled obligations automatically.

Employment status, account/invitation status and learning progress are separate concepts. Email is contact information, not a permanent external identity key.

## 7. Assignments and completion

An assignment represents one learning obligation for one employee and course in a training cycle. Status is ASSIGNED, IN_PROGRESS or COMPLETED. Store assignedAt and nullable completedAt.

Annual refreshers create new assignments and preserve previous completions. Initial duplicate prevention is tenantId + employeeId + courseId + trainingCycle. Revisit this constraint if repeat attempts or multiple obligations within a cycle become requirements.

Employee deactivation blocks access without erasing assignment progress. Completion signals must identify a specific assignment, since employee/course alone cannot distinguish annual cycles. The prototype simulates learning signals and must not present them as verified LMS evidence.

## 8. Duplicate event processing — pilot design

Scope incoming event identity by tenantId + integrationConnectionId + eventId. Enforce uniqueness in the database. Record the event and apply the assignment update in the same transaction; on failure, roll both back. A duplicate produces no additional business effect and receives a successful acknowledgement.

Authentication/signature verification precedes processing. A database transaction cannot atomically deliver an external webhook; add an outbox and delivery worker when reliable outbound events enter scope. Conflicting duplicate CSV rows and out-of-order events require explicit policies before implementing those cases.

## 9. Validation and stage gates

Concept acceptance: an administrator can import employees, understand row errors, assign a course and export a simulated completion. Re-importing unchanged data produces no duplicate employees. Inactive employees cannot launch learning. Annual assignments retain earlier history. The complete journey is demonstrable in five minutes.

Record task completion, time spent, manual steps and corrections against an observed baseline. These are proposed measurements, not evidence already collected. Set business improvement targets after discovery with a representative learning administrator.

Advance to an integration pilot when the workflow solves an observed problem, a client can provide sandbox access, and a specific connector can be tested. Measure setup effort, successful transfers, reconciliation errors and manual interventions. Test a second independently configured environment before claiming connector reuse.

Reconsider if there is insufficient adoption value, unavailable access, persistent bespoke work per client, or no measurable reduction in manual handling. A successful demo alone is not a scale decision.

## 10. Delivery sequence and evidence

1. Confirm this design and build employee provisioning in Express.
2. Add persistence, CSV import and the assignment/completion concept journey.
3. Gather workflow feedback and revise the scope.
4. Add OIDC, SCIM, a real learning integration and reliable webhooks incrementally; add SAML where the client scenario requires it.
5. Extend learning-standard coverage through scoped adapters and experiments. Do not claim full standards compliance from a limited demonstration.
6. Add telemetry, accessibility verification, security controls and Azure deployment for a pilot.
7. Evaluate optional product AI against a deterministic baseline with human review, quality measures, latency and cost.

Keep decision records, integration contracts, troubleshooting notes and demo evidence. Simulated client exercises demonstrate preparation, not real client delivery; standards-body participation cannot be replaced by this project.

## 11. Decisions still to resolve

- Representative client systems and available sandbox access.
- First pilot authentication/account-onboarding approach.
- CSV semantics for missing versus blank manager values and conflicting duplicate rows.
- Trusted source ownership, event ordering and correction handling.
- Measurable business targets, retention periods and manager visibility rules.

This document describes planned behaviour. No implementation, user research, production readiness or compliance is claimed yet.
