# Planner resource refactor plan

## Goal

Organize the Node backend by resource instead of by the planner page. Implement
explicit Create, Read, Update, and Delete (CRUD) operations that are easy to
follow from React requests through Node routes to Prisma queries. Avoid a
generic CRUD framework that hides those operations, repository classes, or
extra controller layers.

Migrate the UI off `GET /api/planner` and `POST /api/planner`, then remove
obsolete planner contracts. This is a test application with no legacy clients
to preserve. Follow [the coding instructions](../.github/copilot-instructions.md).
Python implementation is a later learning milestone. Database redesign and
further book API changes are outside this plan.

A TanStack Query migration is a separate frontend phase after the Python
backend cutover; it is not part of the backend port.

## Learning approach

Follow one operation end to end before generalizing: React form, feature-owned
React Router action, resource HTTP route, service operation, and focused
contract test. Keep those names and boundaries explicit so a learner can trace
where input changes shape and where business rules run. Use purpose-first
JSDoc on functions added or changed, then compare the old planner adapter with
the new resource path before deleting the obsolete adapter.

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
  methods return status 405 without calling the API. Single-operation actions
  do not repeat method guards: their forms declare the method and Hono routes
  own API method routing.
- Keep each operation readable from start to finish: its request, payload,
  HTTP result check, and result. Do not introduce generic submission wrappers,
  method/path/body accumulators, response factories, or helpers that merely
  forward another function. Inline one-off payloads and URLs.
- Return the API's numeric HTTP `status`, plus its error or the operation's
  notification message. Do not introduce custom `ok` booleans. Update the
  consuming fetchers, notifications, and tests together. Remove obsolete
  planner response contracts after their last UI consumer is migrated.
- Check the HTTP result once. Read the documented API error directly.
  Do not add response-header guards, runtime object-type guards, redundant
  fallbacks, catch-and-rethrow layers, or explicit aborted-signal checks.
  Pass `request.signal` to fetch and let React Router handle unexpected
  request failures through the existing route error boundary.
- Trust typed application and library contracts. Do not reproduce database
  constraints or upstream field-length limits. Validate actual domain values,
  such as date assignments, event ordering and update revisions, in their owner.
- Preserve deliberate feature behavior, including journal autosave,
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

- [X] Audit journal reads, creation, saves, and deletion, including autosave.
- [X] Align routine kind changes and routine completion requests.
- [X] Align therapy and external-task completion requests.
- [X] Audit already-migrated book reads and writes, including progress.
- [X] Audit any already-migrated calendar and Google integration requests
  without changing their remote-update orchestration.
- [X] Remove remaining UI consumers of planner intent dispatch as their
  dedicated resource actions replace it.
- [X] Update each resource's result types, directly dependent consumers,
  JSDoc, documentation, and focused tests before marking it aligned.

Quest writes demonstrate the target pattern in milestone 4. Use their
resource URLs and method-based routing as the example, not older migrated
components that still use planner intents or boolean action results.

## Required behavior

- While planner and resource endpoints coexist, they call the same operations.
- Preserve authentication, CSRF protection, cache policy, date handling,
  ordering, and documented error behavior during extraction.
- Delete planner endpoints, adapters, fields, and tests once the UI no longer
  needs them; do not add compatibility flags for removed resources.
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

- [X] Move journal reads and writes to `server/journals/service.ts`.
- [X] Move routine definitions and assignment rules to
  `server/routines/definitions.ts`.
- [X] Move routine completion reads/writes and kind changes to
  `server/routines/service.ts`.
- [X] Move existing journal and routine handlers into resource `routes.ts`
  modules and mount them from the application.
- [X] Share existing authentication, no-store, and server-error handling rather
  than copying it into each router.
- [X] Update planner form actions, page composition, gamification, and tests to
  use the resource modules. Do not leave forwarding exports in the old modules.
- [X] Keep cross-resource snapshot assembly in the planner page layer.
- [X] Verify existing API contracts and one-time awards; update related docs.

Routine definitions stay separate from completion writes because achievement
calculations read definitions, while completion writes refresh achievements.
This avoids a circular dependency between routine writes and gamification.

### 1b. Complete journal CRUD as the React/Node learning slice

Status: implemented. API verification and read-only Chrome inspection passed.
Interactive browser write checks remain a follow-up, on a disposable database.

- [X] Add collection reads, explicit creation, and deletion alongside existing
  entry reads and PUT saves.
- [X] Use journal resource reads in the React journal page.
- [X] Add Create entry and confirmed Delete entry controls; preserve autosave,
  retry, unsaved-change blocking, and selected-date navigation.
- [X] Test duplicate creation, empty entries, replacement, deletion, and errors
  on an isolated database.
- [X] Inspect the authenticated journal UI in Chrome without writing real data.
- [ ] Exercise create, autosave/update, retry, and confirmed deletion through
  the React UI on a disposable database.

Read these files together to follow each operation:

| CRUD operation | React behavior                                       | HTTP route                                          | Service/database operation                                          |
| -------------- | ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Create         | Create entry button; opens the editor after creation | `POST /api/journals`                              | `createJournal` / `journal.create`                              |
| Read           | Browse and select entries from the journal list      | `GET /api/journals`; `GET /api/journals/{date}` also reads one entry | `listJournals`, `getJournal` / `findMany`, `findUnique` |
| Update         | Edit an entry; autosave                              | `PUT /api/journals/{date}`                        | `saveJournal` / `upsert`                                        |
| Delete         | Confirm Delete entry                                 | `DELETE /api/journals/{date}`                     | `deleteJournal` / `deleteMany`                                  |

Start at [the React page](../src/pages/journal.tsx), then
[journal routes](../server/journals/routes.ts) and
[journal services](../server/journals/service.ts). PUT retains its existing
create-or-replace contract. POST only creates; duplicate
dates return 409. DELETE returns 204 with no body, or 404 if missing.

### 2. Extract therapy, external tasks, and Google connections

- [X] Move therapy operations and routes to `server/therapy/`.
- [X] Move external-task queries, persistence, and awards to
  `server/external-tasks/`.
- [X] Move stored Google connection operations to `server/google/connection.ts`.
- [X] Keep Google remote-update orchestration in the Google module so
  external-task persistence does not import the synchronization service back.
- [X] Update remaining planner and integration imports.

Status: implemented. Therapy and external-task routes are mounted as resource
routers, temporary planner actions use the extracted services, and the old
planner service/therapy forwarding modules were removed. Verification:
`npm run typecheck`, `npm run test:server`, and `npm run build` pass.
The user subsequently ran `npm run test:database` against the disposable test
database and supplied output showing all 5 tests passed. Prisma logs for
numeric journal content and zero-point quests are expected rejection checks.

### 3. Finish resource routing and simplify planner composition

- [X] Extract quest, achievement, points, and reward routers alongside their
  existing services; keep related small resources together where useful.
- [X] Move the remaining book and calendar API handlers into their resource
  route modules so the application file stays composition-focused.
- [X] Make the application primarily middleware installation, router mounting,
  authentication routes, and static serving.
- [X] Keep `getSessionPage` responsible for authentication/date selection and
  assembling resource results, not resource persistence.
- [X] Make snapshot query ownership explicit rather than using optional
  preloaded values with implicit query fallbacks. Preserve query reuse.
- [X] Keep planner actions and dispatch as temporary form adapters during
  migration; remove them after their final consumers are gone.

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

- [X] Align previously migrated UI consumers with the resource request rules
  and checklist above; endpoint migration alone is not sufficient.
- [X] Migrate quest creation, editing, deletion, completion, and template
  acceptance to existing endpoints.
- [X] Migrate achievement creation and reward redemption.
- [X] Use resource URLs and HTTP methods for quest writes instead of
  dispatching hidden form intents through a page action.
- [X] Replace the remaining planner intent-to-resource switch with
  feature-owned requests/actions as consumers migrate.
- [X] Handle Google synchronization and calendar mutations separately.

Status: implemented. All client form writes use feature-owned resource actions.
Journal autosave, navigation blocking and confirmed deletion are retained.
Creation is an explicit new-entry form; autosave only updates an existing
entry by date ID, and deletion uses a separate fetcher. Journal retry controls
and session-storage draft recovery were removed at the user's request.
Routine, therapy and external-task writes retain numeric statuses, assignment
checks, milestone notifications and completion celebrations. Book API contracts,
licensed reference import, rename updates and the revisioned progress queue are
unchanged. Google synchronization, Gmail search/import and calendar writes have
dedicated authenticated routes, with unchanged remote orchestration and
conditional event updates. The client planner action switch has been removed;
temporary server adapters remain.

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
Routine kind forms in the quest log now PATCH `/routines/{id}` directly.
There is no remaining client planner action.

| Operation       | React Router form route                           | Action                                           | Resource API                                      |
| --------------- | ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Create          | `POST /quest-board`                             | `createQuestAction`                            | `POST /api/quests`                              |
| Update          | `PATCH /quest-board/{id}`                       | `questResourceAction` → `updateQuestAction` | `PATCH /api/quests/{id}`                        |
| Delete          | `DELETE /quest-board/{id}`                      | `questResourceAction` → `deleteQuestAction` | `DELETE /api/quests/{id}`                       |
| Complete        | `POST /quest-board/{id}/complete`               | `completeQuestAction`                          | `POST /api/quests/{id}/complete`                |
| Accept template | `POST /quest-log/templates/{templateId}/accept` | `acceptQuestTemplateAction`                    | `POST /api/quest-templates/{templateId}/accept` |

Read the [forms](../src/features/planner/components/quest-board.tsx),
[action routes](../src/routes/router.tsx),
[individual actions](../src/features/planner/services/quest-actions.ts), then
[HTTP routes](../server/gamification/routes.ts) and
[service operations](../server/gamification/service.ts).

Additional learning traces:

| Operation                 | React Router route                                                                           | Resource API                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Journal create            | `POST /journal/entries`                                                                    | `POST /api/journals`                                                                    |
| Journal save/delete       | `PUT/DELETE /journal/entries/{date}`                                                       | `PUT/DELETE /api/journals/{date}`                                                       |
| Routine kind              | `PATCH /routines/{id}`                                                                     | `PATCH /api/routines/{id}`                                                              |
| Routine complete/uncheck  | `PUT /routines/{id}/completions/{date}`                                                    | Same path under `/api`                                                                  |
| Therapy complete/uncheck  | `PUT /therapy/sessions/{sessionId}/exercises/{exerciseId}/completions/{date}`              | Same path under `/api`                                                                  |
| External complete/uncheck | `PUT /external-tasks/{source}/{id}/completions/{date}`                                     | `PUT /api/external-tasks/{source}/{id}/completion`, with date in the existing JSON body |
| Achievement create        | `POST /profile/achievements`                                                               | `POST /api/achievements`                                                                |
| Reward redeem             | `POST /rewards/{id}/redemptions`                                                           | Same path under `/api`                                                                  |
| Google sync               | `POST /google/tasks/sync/{date}`                                                           | Same path under `/api`                                                                  |
| Gmail search/import       | `GET /google/gmail/messages`, `POST /google/gmail/messages/{id}/tasks/{date}`            | Same paths under `/api`                                                                 |
| Calendar create/update    | `POST /calendar/{calendarId}/events`, `PATCH /calendar/{calendarId}/events/{id}`         | Same paths under `/api`                                                                 |
| Book metadata/bookmarks   | `/books/{library}/{encodedPath}/details`, `/rename`, `/bookmarks`, `/bookmarks/{id}` | Existing book endpoints; no API contract changes                                          |

The shared planner read remains temporarily for the rest of the UI. Next,
migrate its consumers by page and delete planner fields as each read moves.

### 5. Migrate UI reads by page

Recommended order: therapy, journal, quest log, profile, then the main calendar.
Apply the UI resource request rules to every loader/action introduced here.
Treat a page migration as incomplete if its old fields are still loaded by the
combined planner request merely because the shared layout is convenient.

- [X] Therapy: use a page loader for `GET /api/therapy/sessions`, preserve
  selected-date navigation, and omit therapy from the UI planner request.
- [X] Journal: use one dated route loader for the browser and selected entry;
  remove journal reads from the UI planner request.
- [X] Quest log: load routines plus templates and historical acceptance with
  page-owned reads; remove those fields from the UI planner request. The
  quest-log route owns all three reads.
- [X] Profile: add purpose-built completion history and XP/streak summaries;
  do not make the profile recalculate unrelated quests or calendar state.
- [X] Main calendar and dashboard: own their routines, completions, synced
  tasks, points, journal-date markers and achievement preview reads.
- [X] Use page-specific React Router loaders/actions with shared session and
  selected-date navigation.
- [X] Add only missing read contracts: journal browser dates, completion
  history/ranges, historical template acceptance, profile XP/streak summaries,
  and session/configuration state independent of the planner page.
- [X] Avoid fetching every resource on every navigation. Purpose-built read
  summaries are acceptable where they reduce requests and preserve consistency.
  A page-owned loader must not silently replace the combined request with
  duplicate requests for the same resource.
- [X] Remove obsolete planner fields, endpoints, dispatch, and tests after
  their final UI consumers move.

**Review additions**

- [X] Keep authentication, selected-date, balance and XP shell data at the
  root while dashboard/calendar reads are owned by their nested page loader.
  Anonymous configuration errors keep the sign-in shell; the calendar API
  requires a valid session before reading authenticated resources.
- Keep the achievement-refresh behavior on reads until a purpose-built summary
  has tests proving that date-dependent streaks and newly earned milestones
  remain equivalent.
- [ ] Define loader-level fixtures and tests for every page: selected date, API
  error, request cancellation, revalidation after that page's writes, and no
  request for unrelated page resources.
  Therapy now has focused coverage for these cases; other pages remain open.
- [X] Do not add query flags such as `include...` or `without...` to hide resources
  from `/api/planner`. Move the read, remove that field from the planner
  contract, and let tests enforce the smaller response.

Status: in progress. The therapy read is now owned by
`src/features/therapy/services/therapy-route.ts`, and the session response no
longer loads or returns therapy. The journal page owns its dated browser and
entry read, while dashboard and calendar own non-empty journal marker reads.
The session response no longer loads or returns journal data. Dashboard and
calendar share a nested loader for routine history, selected-date synced tasks,
points and achievement progress; these fields are no longer in the root
session response. Quest-board and rewards reads are also page-owned, the old
`/api/planner` aggregate and intent dispatcher are removed, and `/api/session`
now serves only shared shell and sign-in state. The dashboard/calendar summary
remains because those pages share its selected-date reads. No compatibility
query parameter was introduced. Preserve selected-date navigation and
achievement refresh behavior on reads until equivalent write/streak coverage
exists. Do not run write tests against the normal app database.

The session-shell cleanup replaced `GET /api/planner` with `GET /api/session`,
removed the unused server intent dispatcher and its action adapters, and moved
database integration writes onto resource routes. Verification: 45 focused
profile/action tests, server/action validation tests, typecheck, production
build, integration-test syntax check, and `git diff --check` passed. The
database integration suite was not run because `TEST_DATABASE_URL` is unset.

### 6. Python backend migration roadmap

This is a backend migration with the React UI and PostgreSQL schema retained
unless a later decision expands the scope. `cyberServer/` is an experimental
FastAPI service, not a replacement: it currently has separate `/api/v1` task
and points routes, direct SQL, and no authentication or CSRF protection. Keep
the UI on Node until the Python service passes the gates below.

#### Migration constraints

- Keep Prisma migrations as the sole schema-change authority during the port.
  Python reads and writes the existing schema; do not introduce a second
  migration history or change the schema as a shortcut.
- Migrate one resource at a time and preserve the Node URL, HTTP method,
  request/response shape, status codes, date rules, authorization, CSRF, cache
  behavior, transaction boundaries, and business invariants.
- Do not dual-write or send the same write to both backends. Both implementations
  may be compared against the same disposable database, but production traffic
  must have one write owner per route.
- Keep OAuth callback/token handling in Node until an explicit, tested Python
  design preserves the allowed-account check, cookie/session behavior, token
  encryption, and provider error handling.
- Run all Python persistence tests against a separately configured disposable
  database. Never point experimental writes at the app database.

#### 6a. Refactor exit and Python entry

The resource extraction and page-read implementation are in place. Milestone 5
is not fully verified: its page-loader/revalidation checklist and the latest
disposable-database run are still open. Do not label them complete without
running those checks. They do not block an isolated Python learning slice.

- [X] Close the loader fixtures for therapy, journal, quest log, quest board,
  rewards, profile, dashboard/calendar, and the session shell. Check selected
  dates, errors, cancellation, revalidation after writes, and unrelated reads.
- [X] Run the migrated Node database integration suite against the disposable
  test database and preserve the Node journal response baseline.
- [X] Verify the matching Node API is running before checking React in Chrome.
  Direct API and Vite-proxy checks passed, and authenticated dashboard,
  calendar-owned summary, quest log, therapy, and journal pages loaded without
  the earlier `404` or invalid-date failures.
- [X] Keep the existing achievement refresh on shell/profile/calendar reads.
  A later read-only redesign is separate from the Python port.

Status: complete. The focused loader/action suite, server contract suite,
typecheck, production build, and disposable database integration suite pass.
The database fixture now reads quest templates and accepted template IDs from
their resource-owned operations and preserves the separate calendar, therapy,
journal, and shell response boundaries.

#### 6b. Reuse the disposable database and copy one feature at a time

Python does not require a different database engine: both backends use
PostgreSQL. Start with the existing Node `TEST_DATABASE_URL`; this avoids a
second database setup and preserves the exact schema Python's SQL expects.
Keep the app's `DATABASE_URL` unchanged in `.env`. The Python launcher must
override it only in its child process.

- [X] Follow [the Python learning setup](../cyberServer/README.md#isolated-journal-crud)
  to validate the test URL, apply committed migrations without resetting the
  database, check the `journals` table, and run Python on loopback.
- [X] Use the test database sequentially. Stop the Python API before running
  `npm run test:database`: that command resets the public schema and deletes
  learning rows. Do not run Node and Python persistence suites concurrently.
- [X] Copy the journal *behavior* first, not the entire Node codebase or a
  production database dump. Reimplement a single operation in Python, compare
  it with Node, then add the next operation.
- [X] Start with fictional journal content. Existing Prisma migrations create
  the full schema and seed definitions; only `journals` receives new learning
  data in the first slice. Do not import OAuth tokens, mail, personal journals,
  or book files for this exercise.
- [ ] If learning data needs to survive Node test resets, create a separate
  `cyberplanner_python_test` database with the same test-user permissions and
  migrations. Change only the launcher's test URL, not the app URL.
- [ ] Before any later selected-row copy, define source and target, selected
  dates/IDs, conflict policy, dependency rows, and transaction rollback.
  Preserve business identifiers, dates, and relations; if numeric primary keys
  are copied, advance their sequences. Verify counts and content before using
  the copy. No broad import or delete is part of the first slice.

Setup verification passed: the configured Python 3.12 virtual environment ran
the 20 unit tests, Prisma reported no pending migrations on the disposable
database, a bound read confirmed `public.journals`, the isolated journal
persistence test passed and cleaned its fixture rows, and loopback FastAPI health
and journal-marker reads succeeded. The Python process was stopped before
leaving the milestone.

#### 6c. First implementation: Journals (`Journal` / `journals`)

Use [Node journal routes](../server/journals/routes.ts),
[Node journal operations](../server/journals/service.ts), and the
[journal API contract](api.md#journals) side by side with the Python code.
Keep feature operations direct and small, following the existing FastAPI,
psycopg, and pytest patterns; do not add an ORM or generic CRUD framework.

- [X] Add a journal router and explicit SQL operations under `cyberServer/app/`,
  mounted from `app/main.py`. Implement one operation at a time:
  Create (`POST`), Read (item and collection `GET`), Update (`PUT`), Delete
  (`DELETE`), then non-empty calendar marker reads.
- [X] Match the existing URLs: `/api/journals`, `/api/journals/{date}`, and
  `/api/journals/markers`. Register `markers` before the dated item route.
- [X] Create returns `201`; duplicate dates return `409`. Omitted create
  content starts as an empty string.
- [X] Collection reads return `{date, content}` entries; item reads return
  `404` when missing. Entries include empty content and are newest first; markers exclude only
  empty content. Both Node and Python include whitespace-only entries.
- [X] Update retains Node's `PUT` upsert contract: create when missing, replace
  when present. Preserve an existing row's ID. This is not a partial update.
- [X] Delete returns bodyless `204`, or `404` when missing. It must not change
  completion records, point awards, achievements, or any other resource.
- [X] Treat BlockNote content as its stored string, not a new Python document
  schema. Round-trip empty text, JSON text, Unicode, and large content without
  trimming or changing it. Keep the calendar date independent of time zones.
- [X] Use bound SQL parameters, database uniqueness, explicit commits or
  transactions, and logged database errors. The learning API uses standard
  FastAPI `detail` errors and `422` for invalid request bodies.
- [X] Resolve journal error-body and request-validation differences between
  Node and Python before cutover; both require real `YYYY-MM-DD` dates.
- [X] Add focused API tests with fake connections, then real persistence
  coverage on `TEST_DATABASE_URL`: duplicate creation, missing reads/deletes,
  replacement, empty content, list/marker ordering, and unchanged points.
  Read saved rows through an independent connection to prove commit behavior.
- [X] Verify React journal creation, editing, markers, and deletion against
  the authenticated Node API on disposable data. Keep React on Node until
  Python authentication and CSRF parity pass.
- [X] Compare Node and Python on separate, equivalent fixture dates, or reset
  only the owned journal fixture rows between runs. Never mirror a write to
  both APIs against the same date and call the second result a parity test.
- [X] Document the authenticated Node contract separately from the initial
  loopback-only learning API. No React proxy or real-data connection changes
  belong in this slice.

Status: complete. Python journal HTTP errors now match Node's documented
`{"error": ...}` shape and date/content statuses while `/api/v1` endpoints keep
their FastAPI errors. The side-by-side disposable-database matrix passed for
create, duplicate, read, update, list, markers, content validation, delete, and
missing delete using different fixture dates. React creation, autosave, saved
calendar markers, confirmed deletion, and empty-state revalidation passed
against an authenticated disposable Node API. All fixture rows were removed,
and Python remained disconnected from React.

#### 6d. Subsequent resource slices

Each row is its own bounded implementation task, not one large port. Existing
experimental task and point handlers are prior art, not finished equivalents.
Port point-award primitives and achievement refresh with the first completion
write that needs them; do not switch a completion route before those dependent
effects are equivalent. Only Journals is a full simple CRUD learning exercise;
do not invent definition editing or ledger CRUD the Node API does not expose.

| Resource | Existing Node API to reproduce | Storage / dependency | Additional acceptance checks |
| --- | --- | --- | --- |
| Routine definitions and weekday groups | `GET /api/routines`, `PATCH /api/routines/{id}` | `routine_tasks`, `routine_groups`, `routine_task_groups`; `server/routines/` | Integer IDs remain stable; group order and weekdays match; kind determines server-owned points. |
| Routine completions | `GET /api/routines/completions?date=...`, `PUT /api/routines/{id}/completions/{date}` | `routine_task_completions`, point awards, achievement refresh | Reject non-assigned weekdays; concurrent/repeated checks award once; uncheck removes the check, not the award; preserve newly earned milestones. |
| Therapy exercises, sessions, and assignments | `GET /api/therapy/sessions?date=...` | `therapy_exercises`, `therapy_sessions`, `therapy_session_exercises`; `server/therapy/` | Preserve session/exercise ordering, instructions, assignment points, completion states, and earned totals. No new definition CRUD. |
| Therapy completions | `PUT /api/therapy/sessions/{sessionId}/exercises/{exerciseId}/completions/{date}` | `therapy_completions`, point awards, achievement refresh | Validate assignment; preserve `pt:` award keys and completion/award transactions; retry and uncheck never duplicate or reverse points. |
| Quests | Collection/item `GET`, collection `POST`, item `PATCH`/`DELETE`, `POST /api/quests/{id}/complete` | `quests`, point awards; `server/gamification/` | Soft delete preserves awards; patch only supplied fields; completed quests retain original awarded value; repeated completion is `409`. |
| Quest templates and historical acceptance | `GET /api/quest-templates`, `GET /api/quest-templates/accepted`, `POST /api/quest-templates/{id}/accept` | `quest_templates`, `quests.template_id` | Seeded tracks/order match; acceptance is unique and remains visible after quest deletion; repeat acceptance is `409`. |
| Point ledger and point summaries | `GET /api/points?date=...`; internal award operations | `point_ledger`; `server/points/` | Append-only awards, unique earn keys, task-date attribution, selected visible task keys, repeatable-read summaries, and timestamp formatting match. No arbitrary ledger edit endpoint. |
| Rewards and redemptions | `GET /api/rewards`, `POST /api/rewards/{id}/redemptions` | Server-defined reward catalogue, `point_ledger` spend entries | Catalogue/costs match; unknown reward is `404`, insufficient funds `409`, success `201`; serializable concurrent spending cannot overdraw; spending does not reduce lifetime XP. |
| Achievements and milestone refresh | `GET /api/achievements`, `POST /api/achievements`; internal refresh operations | `achievements`, routine definitions/history, earned ledger | Points/streak tracking, backfilled milestones, awarded XP, deleted-achievement XP retention, routine eligibility, and concurrent refresh match. No new achievement editing endpoint. |
| Profile summary | `GET /api/profile` | Routine definitions/history, achievements, earned XP | Exact `checks`, `routines`, `routineGroups`, `achievements`, `totalXp`, `newlyEarned` shape; no quests/calendar requests; future dates do not extend streaks. |
| Session shell and authentication | `GET /api/session`, `/auth/google`, `/auth/callback`, `/auth/logout` | `server/session/`, `server/auth/`, Google connection | Preserve configuration/sign-in states, date fallback, balance/XP, cookie attributes/signature, allowed-account validation, OAuth state, logout, and callback failures. |
| Stored Google connection | Internal connection read/save operations | `google_connections`; `server/google/connection.ts` | Singleton semantics and existing token encryption format match; no token-returning public endpoint; do not copy real tokens into test fixtures. |
| Synced Google Tasks and Gmail follow-up persistence | `GET /api/external-tasks?date=...`, `PUT /api/external-tasks/{source}/{id}/completion` | `external_tasks`, point awards; `server/external-tasks/` and Google orchestration | Source/ID uniqueness, undated visibility, deleted records, completion timestamps, retained award keys, and remote-before-local update behavior match. |
| Google Tasks synchronization | `POST /api/google/tasks/sync/{date}` | Google Tasks client, stored connection, external-task persistence | Page through remote lists, import idempotently, preserve deletion/completion attribution, count/message and failure behavior; use provider mocks first. |
| Gmail search and import | `GET /api/google/gmail/messages?query=...`, `POST /api/google/gmail/messages/{id}/tasks/{date}` | Gmail client, connection, external-task persistence | Search validation and result shape match; import returns `201` or `200` if already present; do not store message bodies or create duplicate tasks. |
| Google Calendar lists and events | `GET /api/calendar?start=...&end=...`, event collection `POST`, event item `PATCH` | Google Calendar client; `server/google/calendar.ts`; events are not local DB rows | Preserve writable calendars, unavailable-calendar reporting, event ordering, all-day exclusive end, time zones, recurrence occurrence edits, etags/`If-Match`, and `409` conflicts. |
| Dashboard/calendar summary | `GET /api/planner/calendar?date=...` | Profile summary, external tasks, points; `server/planner/` | Preserve selected-date response, achievement-refresh side effects, reusable task reads, and auth/no-store behavior; markers stay journal-owned. |
| Book library, metadata, and covers | `/api/books`, `/api/books/details`, `/api/books/cover` | `books`, local libraries; `server/books/` | Stable book UUIDs and storage paths match; preserve licensed reference data and validated cover bytes/MIME; do not fetch/import references automatically. |
| Bookmarks | `GET`/`POST`/`DELETE /api/books/bookmarks` with existing query/body IDs | `bookmarks`, book foreign key | Preserve UUIDs, labels, positions, ordering, ownership/path matching, and delete response. Keep existing API paths instead of redesigning them. |
| Reading/listening progress | `GET`/`PUT /api/books/progress` | `books.progress`, revision | Preserve EPUB CFI/audio position rules, revision conflicts and returned current state; leave the React save/recovery queue intact. |
| Book files, chapters, and rename | `/api/books/file`, `/api/books/chapters`, `POST /api/books/rename` | Local ebook/audiobook folders and stable book records | Use fixture files only; preserve range streaming, `206`/`416`, path traversal/symlink boundaries, chapter extraction, and rename consistency across file and DB. |

#### 6e. Common parity, copy, and cutover gates

- [ ] Maintain a parity checklist per resource: URLs/methods, camelCase JSON
  names, nullability, date/timestamp serialization, numeric status, error body,
  ordering, and bodyless responses. Preserve domain errors rather than adding
  success-shaped fallbacks.
- [ ] Compare SQL constraints, foreign keys, unique/partial indexes, transaction
  isolation and retry behavior with the existing Prisma implementation.
  Preserve UUIDs and integer IDs; do not add a second schema migration tool.
- [ ] Add authentication, same-origin CSRF, no-store, explicit error logging,
  and unknown-route behavior before any real UI cutover. Confirm missing
  configuration, expired/wrong-account cookies, and cross-origin requests.
- [ ] Use mocked Google clients and small fixture books before any external
  integration checks. Obtain a separate decision before writing remote events,
  importing real mail, renaming real books, or moving account credentials.
- [ ] Expand data-copy experiments by resource only after its CRUD/domain
  operations pass: Journals first, then routine definitions/groups before
  completions, therapy definitions/assignments before completions, templates
  before accepted quests, and Books before Bookmarks. Ledger/achievement
  histories require a consistent snapshot; never reconstruct them by replaying
  completion writes because that can award points again.
- [ ] Keep one write owner per route. Switch only a verified resource at a
  same-origin deployment proxy; do not rewrite all React actions or use
  permanent per-request Node fallback. Keep unported resources on Node.
- [ ] Test startup/configuration failures, migrations, health/readiness,
  shutdown/connection cleanup, and file serving in the intended deployment.
  `/health` currently proves only that the Python process responds, not DB readiness.
- [ ] Validate the complete app against staging/disposable data, including
  rollback to Node without schema divergence. Remove a Node route/service only
  after its Python replacement, dependent effects, and UI revalidation pass.
  Update setup, deployment, API, and architecture docs with each cutover.

**Journal implementation status:** The loopback-only Python journal routes and
focused fake-connection tests are implemented. An isolated persistence test
passed against the guarded disposable database, checking independent reads,
ID-preserving replacement, markers, deletion, and unchanged related counts.
Therapy loader tests also cover cancellation and revalidation after writes.
Node/Python comparison and React verification on disposable data remain open;
no backend or OAuth switch has been made.

### 7. Migrate UI server state to TanStack Query

This is a deferred frontend migration, to begin only after the Python backend
cutover is complete and stable. Keep React Router for route composition,
navigation, and URL state; use TanStack Query as the single client-side owner
of remote server state. Do not combine this work with backend resource cutovers
or keep duplicate loader/query caches for the same data.

- [ ] Before implementation, decide which existing React Router loader/action
  responsibilities move to queries and mutations, and which remain route
  concerns. Preserve URL-driven selected dates and route error handling.
- [ ] Add one application-level `QueryClient` and provider, with explicit
  freshness, refetch, and retry defaults. Keep error presentation feature-owned;
  do not add a second cache per feature or silently retry non-idempotent writes.
- [ ] Define typed, resource-owned query keys, including every variable that
  affects a response (especially selected dates, ranges, and resource IDs).
  Keep query functions on the existing authenticated same-origin API.
- [ ] Migrate one page/resource at a time. Avoid fetching the same resource in
  both a route loader and a query; retain loader data only where the chosen
  React Router integration explicitly hydrates the query cache.
- [ ] Move writes to mutations only where they improve the existing feature
  flow. Preserve numeric HTTP statuses, API errors, bodyless responses,
  cancellation, confirmation/busy states, and route-boundary handling.
- [ ] Define targeted invalidation or cache updates for each mutation, including
  cross-page effects, selected-date changes, achievement refreshes, and
  session/logout transitions. Never show stale user data after authentication
  changes.
- [ ] Preserve journal autosave and the revisioned book-progress queue; do not
  replace their sequencing/conflict behavior with generic mutation defaults.
- [ ] Add focused tests for query-key isolation, loading/error states,
  cancellation, mutation errors, invalidation/revalidation, and no duplicate
  requests. Verify date navigation and representative writes in the UI.
- [ ] Remove superseded loader/action fetch glue only after the corresponding
  query/mutation behavior and tests pass. Update UI architecture documentation.

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

Milestone 4 is complete, including the retroactive resource-consumer audit.
All UI writes are resource-owned and use numeric statuses. The obsolete planner
write API and adapters have been removed. No schema changes were made, and
Python API behavior is unchanged.
Reader progress retains its direct resource requests and intentional save queue.

Milestone 5 now includes page-owned reads for therapy, journal, quest log,
profile, dashboard and calendar. Dashboard/calendar share one nested route
loader for completion history, routines, synced tasks, points, and achievement
preview data. Their controller owns task writes and selected-date state while
the root session response supplies only shared shell state. Quest-board and
rewards reads have also moved to their feature-owned loaders. The old planner
aggregate and write dispatcher are removed; the active calendar summary
remains purpose-built. The remaining loader-level fixture checklist and latest
Node disposable-database run must pass before milestone 5 is marked complete.
The isolated Python Journals CRUD slice in section 6c is implemented and has
disposable-database persistence coverage; the Node comparison and React
verification remain open. The remaining refactor verification is tracked separately.
The quest-log route owns reads for routines, templates, and historical template
acceptance; the root session response no longer returns those fields or the
dashboard/calendar resources. The profile route now owns
completion history, routine definitions needed by achievement creation, current
achievement progress, and lifetime XP without loading quests or calendar tasks.
Preserve selected-date navigation and keep achievement refresh behavior on
planner reads until equivalent write/streak coverage exists. Do not run write
tests against the normal app database.

Dashboard/calendar verification: `npm run test:profile` (42 tests),
`npm run test:server` (2 tests), `npm run typecheck`,
`npm run lint:hooks`, `npm run build`, and `git diff --check` passed.
`TEST_DATABASE_URL` is unavailable in this environment, so disposable-database
integration tests were not run. The existing browser API server did not include
the new route yet, so interactive route validation was not conclusive.

Earlier bounded-slice verification:

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

Full milestone 4 verification:

- 54 focused tests passed across profile, gamification, resource actions,
  calendar, books and reader progress. Coverage includes bodyless deletion,
  encoded book paths, numeric statuses, API errors,
  cancellation, router error propagation and revision-conflict recovery.
- `npm run test:server` passed both suites, including dedicated Google/calendar
  routes, authentication, CSRF rejection, no-store headers, conditional event
  updates, duplicate Gmail imports and invalid inputs.
- `npm run test:database` passed all 5 tests on the disposable database in this
  session. Expected constraint-rejection logs are not test failures.
- `npm run typecheck`, `npm run lint:hooks`, `npm run build`, and
  `git diff --check` passed. The build retains dependency bundling warnings.
- Chrome verified journal creation, autosave failure/retry, unsaved-navigation
  blocking, draft recovery after an unexpected response/reload, confirmed
  deletion and selected-date navigation against an in-memory API fixture.
  Its synthetic write sequence was POST, failed PUT, retry PUT, unexpected
  response PUT, recovery PUT and DELETE. No real app or Google data was written.
  This is separate from database persistence coverage; the earlier interactive
  Chrome-on-disposable-database checkbox remains incomplete.

Follow-up simplification: single-operation action method guards and speculative
planner/library response checks were removed. Shared item actions still route
their supported methods. Calendar writes check only event ordering and update
etags; field types, timestamp formats and lengths are left to Google. Mantine
owns periodic progress scheduling, while the smaller queue retains ordered
writes and explicit conflict recovery. epubjs/PDF.js extraction now releases
parser resources after producing persistent thumbnail data. Chrome read-only
checks verified PDF thumbnails and EPUB author, description and cover loading.
Follow-up verification: all 55 focused tests, both server/action validation
suites, typecheck, hook lint, production build and whitespace checks passed.

Journal follow-up: new entries are created explicitly before editing. Existing
entries only PUT content to their date-ID URL; deletion has a separate DELETE
form and fetcher. Reader revalidation updates the browser and switches between
new and saved states without save/delete callbacks or local existence flags.
Retries and session-storage draft recovery were removed intentionally.
Single-letter variables were renamed throughout authored application source,
including therapy exercise keys and child callback parameters. Generated
Prisma code is unchanged; the Python application had no single-letter bindings.
Verification: 55 focused tests, both server/action suites, typecheck, hook lint,
production build and whitespace checks passed. AST scans found no single-letter
bindings in authored application code. Chrome confirmed a missing entry shows
Create entry without an editor or retry controls; no journal data was written.

Therapy read follow-up: the physical-therapy route owns its dated loader and
continues to own completion writes. The planner page no longer queries, returns,
or types therapy data, so revalidation performs one direct therapy read.
Verification: 31 focused planner/profile tests passed and TypeScript typecheck
passed.

Journal read follow-up: the journal route owns its selected-date browser and
entry loader. Journal marker dates are page-owned by the dashboard and calendar
routes, preserving the previous non-empty-marker behavior. The planner snapshot
and shared type no longer query or return journal content or dates.
Verification: 37 focused planner/profile tests, both server/action suites, all 5
disposable-database tests, typecheck, hook lint, production build and whitespace
checks passed.

Temporary browser servers are stopped after testing. The database suite leaves
tables and test data behind; recreate only the disposable test database before
another run.
