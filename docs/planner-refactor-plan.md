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
| Read           | Browse saved dates and open an entry                 | `GET /api/journals`, `GET /api/journals/{date}` | `listJournalDates`, `getJournal` / `findMany`, `findUnique` |
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
- [X] Keep `getPlannerPage` responsible for authentication/date selection and
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
- [ ] Add only missing read contracts: journal browser dates, completion
  history/ranges, historical template acceptance, profile XP/streak summaries,
  and session/configuration state independent of the planner page.
- [ ] Avoid fetching every resource on every navigation. Purpose-built read
  summaries are acceptable where they reduce requests and preserve consistency.
  A page-owned loader must not silently replace the combined request with
  duplicate requests for the same resource.
- [ ] Remove obsolete planner fields, endpoints, dispatch, and tests after
  their final UI consumers move.

**Review additions**

- [X] Keep authentication, selected-date, balance and XP shell data at the
  root while dashboard/calendar reads are owned by their nested page loader.
  Anonymous configuration errors keep the sign-in shell; the calendar API
  checks configuration and session before reading authenticated resources.
- Keep the achievement-refresh behavior on reads until a purpose-built summary
  has tests proving that date-dependent streaks and newly earned milestones
  remain equivalent.
- Define loader-level fixtures and tests for every page: selected date, API
  error, request cancellation, revalidation after that page's writes, and no
  request for unrelated page resources.
- [X] Do not add query flags such as `include...` or `without...` to hide resources
  from `/api/planner`. Move the read, remove that field from the planner
  contract, and let tests enforce the smaller response.

Status: in progress. The therapy read is now owned by
`src/features/therapy/services/therapy-route.ts`, and `PlannerPage` no longer
loads or returns therapy. The journal page owns its dated browser and entry
read, dashboard and calendar routes own non-empty journal marker reads, and
`PlannerPage` no longer loads or returns journal data. Dashboard and calendar
share a nested loader for routine history, selected-date synced tasks, points
and achievement progress; these fields are no longer in the root planner
response. Quest-log reads are also page-owned. Remaining shared reads are
quests and reward redemptions for their current consumers. No compatibility
query parameter was introduced.

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

Milestone 4 is complete, including the retroactive resource-consumer audit.
All UI writes are resource-owned and use numeric statuses. The obsolete planner
write API and adapters should be removed as follow-up work. No schema or Python
changes were made.
Reader progress retains its direct resource requests and intentional save queue.

Milestone 5 now includes page-owned reads for therapy, journal, quest log,
profile, dashboard and calendar. Dashboard/calendar share one nested route
loader for completion history, routines, synced tasks, points, and achievement
preview data. Their controller owns task writes and selected-date state while
the root response supplies shell data and the remaining quest/reward consumers.
The next bounded task is to move quest-board and rewards reads out of the root
planner response, then remove obsolete planner adapters after their final UI
consumers move.
The quest-log route owns reads for routines, templates, and historical template
acceptance; the root planner response no longer returns those fields or the
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
