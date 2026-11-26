# Planner resource refactor plan

## Goal

Organize the Node backend by resource instead of by the planner page. Implement
explicit Create, Read, Update, and Delete (CRUD) operations that are easy to
follow from React requests through Node routes to Prisma queries. Avoid a
generic CRUD framework that hides those operations, repository classes, or
extra controller layers.

Keep `GET /api/planner` and `POST /api/planner` compatible while gradually
migrating the UI. Follow [the coding instructions](../.github/copilot-instructions.md).
Python implementation is a later learning milestone. Database redesign and
further book API changes are outside this plan.

## Learning approach

Follow one operation end to end before generalizing: React form, feature-owned
React Router action, resource HTTP route, service operation, and focused
contract test. Keep those names and boundaries explicit so a learner can trace
where input changes shape and where business rules run. Use purpose-first
JSDoc on functions added or changed, then compare the old planner adapter with
the new resource path to understand what compatibility still protects.

## UI resource request rules

Apply these rules retroactively to every already-migrated component and to
all future migrations. A component using a resource endpoint is not finished
until its forms, actions, result types, and tests follow the same pattern.

- Use resource URLs and HTTP methods, not operation names in CRUD paths:
  `POST /resource` creates, `GET /resource` lists, `GET /resource/{id}` reads,
  `PATCH /resource/{id}` updates, and `DELETE /resource/{id}` deletes.
  Preserve existing `PUT /resource/{id}` contracts for replacement or upsert,
  such as journal saves and dated completions.
- Update and delete use the same item URL. Do not add `/create`, `/update`,
  or `/delete` suffixes. Keep existing domain operations, such as completion,
  template acceptance, synchronization, and redemption, separate from CRUD.
- Forms target the resource route and use the actual HTTP method. Put IDs
  and dates identifying a resource in route parameters, not hidden action
  fields. Do not select operations using hidden `intent` strings.
- React Router has one action per URL. Where an item supports multiple write
  methods, select the operation using `request.method` only; unsupported
  methods return status 405 without calling the API.
- Keep each operation readable from start to finish: its request, payload,
  HTTP result check, and result. Do not introduce generic submission wrappers,
  method/path/body accumulators, response factories, or helpers that merely
  forward another function. Inline one-off payloads and URLs.
- Return the API's numeric HTTP `status`, plus its error or the operation's
  notification message. Do not introduce custom `ok` booleans. Update the
  consuming fetchers, notifications, and tests together; retain legacy API
  response contracts while migrating their UI consumers.
- Check the HTTP result once. Read the documented API error directly.
  Do not add response-header guards, runtime object-type guards, redundant
  fallbacks, catch-and-rethrow layers, or explicit aborted-signal checks.
  Pass `request.signal` to fetch and let React Router handle unexpected
  request failures through the existing route error boundary.
- Preserve deliberate feature behavior, including journal autosave/retry,
  unsaved-change blocking, deletion confirmation, busy states, notifications,
  celebrations, selected-date navigation, cancellation, and revalidation.
  Do not remove intentional recovery flows when removing defensive layers.
- Keep authentication, CSRF protection, server error reporting, and meaningful
  business-rule validation. Simpler client requests do not mean removing
  assignment checks, transactions, unique awards, or database constraints.
- Add purpose-first JSDoc to functions added or changed. Explain the operation,
  request inputs, and output without narrating each statement.
- Test the real method, shared item URL, route parameters, numeric statuses,
  API errors, 204 responses without bodies, unsupported methods, and framework
  error propagation. Use an isolated database for persistent write tests.

### Align already-migrated components

Apply the rules one resource at a time; do not bundle unrelated rewrites.

- [ ] Audit journal reads, creation, saves, and deletion, including autosave.
- [ ] Align routine kind changes and routine completion requests.
- [ ] Align therapy and external-task completion requests.
- [ ] Audit already-migrated book reads and writes, including progress.
- [ ] Audit any already-migrated calendar and Google integration requests
  without changing their remote-update orchestration.
- [ ] Remove remaining UI consumers of planner intent dispatch as their
  dedicated resource actions replace it; keep the legacy server adapters.
- [ ] Update each resource's result types, directly dependent consumers,
  JSDoc, documentation, and focused tests before marking it aligned.

Quest writes demonstrate the target pattern in milestone 4. Use their
resource URLs and method-based routing as the example, not older migrated
components that still use planner intents or boolean action results.

## Required behavior

- Legacy and resource endpoints call the same operations.
- Preserve endpoint paths, response shapes, authentication, CSRF protection,
  cache policy, date handling, ordering, and error responses during extraction.
- Preserve routine weekday and therapy assignment checks.
- Point values remain server-owned. Preserve ledger keys, unique awards, and
  completion/award transactions, including concurrent requests and retries.
- Unchecking does not reverse awards. Quest deletion retains awards and
  historical template acceptance.
- Use TypeScript types for expected inputs. Keep meaningful boundary checks,
  not repeated per-field validation; let Prisma and database constraints reject
  invalid stored values.
- Preserve journal autosave, unsaved-change blocking, notifications,
  celebrations, cancellation, and revalidation as the UI migrates.
- Run write tests only against an isolated, disposable database.

## Milestones

### 1. Extract journals and routines

Status: complete.

- [x] Move journal reads and writes to `server/journals/service.ts`.
- [x] Move routine definitions and assignment rules to
  `server/routines/definitions.ts`.
- [x] Move routine completion reads/writes and kind changes to
  `server/routines/service.ts`.
- [x] Move existing journal and routine handlers into resource `routes.ts`
  modules and mount them from the application.
- [x] Share existing authentication, no-store, and server-error handling rather
  than copying it into each router.
- [x] Update planner form actions, page composition, gamification, and tests to
  use the resource modules. Do not leave forwarding exports in the old modules.
- [x] Keep cross-resource snapshot assembly in the planner page layer.
- [x] Verify existing API contracts and one-time awards; update related docs.

Routine definitions stay separate from completion writes because achievement
calculations read definitions, while completion writes refresh achievements.
This avoids a circular dependency between routine writes and gamification.

### 1b. Complete journal CRUD as the React/Node learning slice

Status: implemented. API verification and read-only Chrome inspection passed.
Interactive browser write checks remain a follow-up, on a disposable database.

- [x] Add collection reads, explicit creation, and deletion alongside existing
  entry reads and PUT saves.
- [x] Use journal resource reads in the React journal page.
- [x] Add Create entry and confirmed Delete entry controls; preserve autosave,
  retry, unsaved-change blocking, and selected-date navigation.
- [x] Test duplicate creation, empty entries, replacement, deletion, errors,
  and compatibility with the planner API on an isolated database.
- [x] Inspect the authenticated journal UI in Chrome without writing real data.
- [ ] Exercise create, autosave/update, retry, and confirmed deletion through
  the React UI on a disposable database.

Read these files together to follow each operation:

| CRUD operation | React behavior | HTTP route | Service/database operation |
| --- | --- | --- | --- |
| Create | Create entry button or first autosave | `POST /api/journals` | `createJournal` / `journal.create` |
| Read | Browse saved dates and open an entry | `GET /api/journals`, `GET /api/journals/{date}` | `listJournalDates`, `getJournal` / `findMany`, `findUnique` |
| Update | Edit an entry; autosave | `PUT /api/journals/{date}` | `saveJournal` / `upsert` |
| Delete | Confirm Delete entry | `DELETE /api/journals/{date}` | `deleteJournal` / `deleteMany` |

Start at [the React page](../src/pages/journal.tsx), then
[journal routes](../server/journals/routes.ts) and
[journal services](../server/journals/service.ts). PUT retains its existing
create-or-replace behavior for compatibility. POST only creates; duplicate
dates return 409. DELETE returns 204 with no body, or 404 if missing.

### 2. Extract therapy, external tasks, and Google connections

- [x] Move therapy operations and routes to `server/therapy/`.
- [x] Move external-task queries, persistence, and awards to
  `server/external-tasks/`.
- [x] Move stored Google connection operations to `server/google/connection.ts`.
- [x] Keep Google remote-update orchestration in the Google module so
  external-task persistence does not import the synchronization service back.
- [x] Update remaining planner and integration imports.

Status: implemented. Therapy and external-task routes are mounted as resource
routers, legacy planner actions use the extracted services, and the old
planner service/therapy forwarding modules were removed. Verification:
`npm run typecheck`, `npm run test:server`, and `npm run build` pass.
The user subsequently ran `npm run test:database` against the disposable test
database and supplied output showing all 5 tests passed. Prisma logs for
numeric journal content and zero-point quests are expected rejection checks.

### 3. Finish resource routing and simplify planner composition

- [x] Extract quest, achievement, points, and reward routers alongside their
  existing services; keep related small resources together where useful.
- [x] Move the remaining book and calendar API handlers into their resource
  route modules so the application file stays composition-focused.
- [x] Make the application primarily middleware installation, router mounting,
  authentication routes, and static serving.
- [x] Keep `getPlannerPage` responsible for authentication/date selection and
  assembling resource results, not resource persistence.
- [x] Make snapshot query ownership explicit rather than using optional
  preloaded values with implicit query fallbacks. Preserve query reuse.
- [x] Keep planner actions and dispatch as thin legacy form adapters.

**Achievement refresh caveat:** `getGamification` currently recalculates and can
award achievements during a planner page read. Do not silently remove this
behavior when splitting loaders. Separate refresh from read-only queries only
after completion, import/synchronization, and date-dependent streak behavior
have equivalent coverage.

Status: implemented. Resource routes now own quest, achievement, template,
points, reward, book, and calendar HTTP handling. The planner snapshot requires
routine completions and selected-date tasks from its caller, while continuing
to query journals and reuse the already-loaded task/completion results.
Achievement refresh on planner reads remains unchanged.

### 4. Finish UI resource writes

- [ ] Align previously migrated UI consumers with the resource request rules
  and checklist above; endpoint migration alone is not sufficient.
- [x] Migrate quest creation, editing, deletion, completion, and template
  acceptance to existing endpoints.
- [ ] Migrate achievement creation and reward redemption.
- [x] Use resource URLs and HTTP methods for quest writes instead of
  dispatching hidden form intents through a page action.
- [ ] Replace the remaining planner intent-to-resource switch with
  feature-owned requests/actions as consumers migrate.
- [ ] Handle Google synchronization and calendar mutations separately.

Quest write learning trace:

Each quest write has its own action and checks its HTTP result once. API
errors return to form notifications; unexpected request/response failures use
the existing React Router error boundary. There are no local catch layers,
response-header guards, object-type guards, or explicit cancellation checks.
Results carry the API's numeric HTTP `status`, not a custom `ok` boolean.
Forms use POST for creation, PATCH for editing, and DELETE for deletion; completion and
template acceptance use POST. Quest and template IDs come from route
parameters, not hidden fields. There is no quest intent switch, shared
submission wrapper, form conversion helper, or combined success response type.
React Router allows one action per URL, so `questResourceAction` selects PATCH
or DELETE using `request.method`. This is HTTP routing, not form intent
dispatch. Other methods return status 405 without an API request.
The remaining planner action also uses explicit requests rather than accumulating method,
path, and payload variables. Routine kind forms in the quest log target the
root planner action.

| Operation | React Router form route | Action | Resource API |
| --- | --- | --- | --- |
| Create | `POST /quest-board` | `createQuestAction` | `POST /api/quests` |
| Update | `PATCH /quest-board/{id}` | `questResourceAction` → `updateQuestAction` | `PATCH /api/quests/{id}` |
| Delete | `DELETE /quest-board/{id}` | `questResourceAction` → `deleteQuestAction` | `DELETE /api/quests/{id}` |
| Complete | `POST /quest-board/{id}/complete` | `completeQuestAction` | `POST /api/quests/{id}/complete` |
| Accept template | `POST /quest-log/templates/{templateId}/accept` | `acceptQuestTemplateAction` | `POST /api/quest-templates/{templateId}/accept` |

Read the [forms](../src/features/planner/components/quest-board.tsx),
[action routes](../src/routes/router.tsx),
[individual actions](../src/features/planner/services/quest-actions.ts), then
[HTTP routes](../server/gamification/routes.ts) and
[service operations](../server/gamification/service.ts).

The shared planner read is intentionally unchanged in this step. Next,
continue with achievement creation and reward redemption, then move reads by
page as described in milestone 5.

Already migrated: journal saves, routine kind changes, and routine, therapy,
and external-task completions use resource endpoints. The UI still loads its
combined page through `GET /api/planner`.

### 5. Migrate UI reads by page

Recommended order: therapy, journal, quest log, profile, then the main calendar.
Apply the UI resource request rules to every loader/action introduced here.

- [ ] Use page-specific React Router loaders/actions with shared session and
  selected-date navigation.
- [ ] Add only missing read contracts: journal browser dates, completion
  history/ranges, historical template acceptance, profile XP/streak summaries,
  and session/configuration state independent of the planner page.
- [ ] Avoid fetching every resource on every navigation. Purpose-built read
  summaries are acceptable where they reduce requests and preserve consistency.
- [ ] Preserve legacy planner endpoints after the UI no longer needs them.

### 6. Python CRUD learning equivalent

- [ ] Implement the same journal CRUD contracts in the Python backend once the
  Node/React slice is complete and Python work is requested.
- [ ] Keep equivalent authentication, CSRF, database behavior, and error
  responses rather than connecting an unprotected Python API to the real UI.
- [ ] Use an isolated database and compare CRUD responses with the Node API.

## Verification for each milestone

- Run the smallest existing tests covering affected routes and services.
- Check authenticated and anonymous responses, CSRF rejection, no-store
  headers, error statuses, and unknown routes.
- Test journal replacement and empty content, routine weekday restrictions,
  concurrent/repeated completions, and awards across both APIs.
- Run typecheck and production build; run hook lint when UI code changes.
- Update [api.md](api.md) and [models.md](models.md) for changed ownership or
  contracts.
- Record completed work, verification, and the next bounded task below.

## Cross-session handoff

Completed: milestones 1, 1b, 2, and 3: journal/routine extraction, journal
CRUD, therapy/external-task/Google ownership, and resource routing. No Python
implementation or database schema changes.

Verification for milestone 3: `npm run test:server`, `npm run test:profile`,
`npm run typecheck`, `npm run build`, and `git diff --check` passed.
`node --check tests/database.integration.test.mjs` also passed. The database
integration suite was not run because `TEST_DATABASE_URL` is unset; it requires
an empty, disposable database.

Milestone 4 progress: quest create/edit/delete/complete and template acceptance
now use their resource endpoints through feature-owned React Router actions.
Previously migrated journal, routine, therapy, external-task, book, and
integration consumers must also be audited against the UI resource request
rules; not all are aligned yet.

Next bounded task: audit and align the journal UI as the first previously
migrated resource, preserving autosave and retry. Continue the alignment
checklist resource by resource, and use the same rules for achievement creation,
reward redemption, and all subsequent migrations. Do not run write tests
against the normal app database or begin unrelated migrations.

Verification completed:

- `npm run test:database`: user-provided output confirms 5 tests passed on the
  disposable test database after the milestone 2 extraction.
- `npm run test:profile`: 26 tests passed, including shared item URL method
  routing, HTTP statuses, unsupported methods, error propagation, cancellation,
  and quest-log routine action targeting.
- Quest write slice: `node --import tsx --test tests/planner-action.test.mjs`
  passed all 10 tests, including method-based routing, HTTP statuses, API
  errors, and propagation of request failures to the route error boundary;
  `npm run typecheck`, `npm run lint:hooks`, `npm run build`,
  and `git diff --check` passed.
- Server/action validation tests passed, including authentication, no-store
  headers, CSRF rejection, invalid dates, and unknown resource routes.
- `npm run typecheck`, `npm run lint:hooks`, and `npm run build` passed.
- Chrome: authenticated journal page loaded its saved dates and Create entry
  control. No journal entries were created, edited, or deleted in the real app.
- Automated browser write checks could not start because the integrated
  browser's cookie API is unavailable. The user requested sparse Chrome use;
  retain the isolated API test coverage and finish interactive checks later.

Temporary browser servers are stopped after testing. The database suite leaves
tables and test data behind; recreate only the disposable test database before
another run.
