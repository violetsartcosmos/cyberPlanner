# Python backend

This FastAPI service is being built alongside the existing Node server. It uses
the current PostgreSQL schema and does not run or create database migrations.
The first slice exposes routine tasks and points under `/api/v1`; the React app
continues to use Node until the Python API has enough feature parity to switch.

## What is duplicated so far?

Nothing has been removed from or switched away from the Node server. Python's
journal endpoints use the same URLs as Node; its task and point endpoints
use different URLs and response shapes. The React app still calls Node.
Both servers can access the same tables, so
Python writes can change what Node sees. Use a disposable database copy while
learning and validating the Python code.

| Python file | Purpose | Node code it parallels |
| --- | --- | --- |
| `app/main.py` | Creates the FastAPI app, connects the routers, and exposes a process health check. | `server/app.ts` and `server/index.ts` |
| `app/database.py` | Loads configuration and opens/closes a PostgreSQL connection for a request. | `server/db/client.ts`, which uses Prisma rather than psycopg |
| `app/journals.py` | Provides experimental journal CRUD and marker reads. | `server/journals/routes.ts` and `server/journals/service.ts` |
| `app/routines.py` | Unmounted starting point for routine definitions and weekday groups. | `server/routines/routes.ts`, `server/routines/definitions.ts`, and `server/routines/service.ts` |
| `app/therapy.py` | Unmounted starting point for therapy sessions and completions. | `server/therapy/routes.ts` and `server/therapy/service.ts` |
| `app/tasks.py` | Lists built-in routines by numeric ID and records a check and its point award. | `server/routines/definitions.ts`, `server/routines/service.ts`, and `server/points/service.ts` |
| `app/points.py` | Reads the ledger and allows redemption of a predefined reward. | `server/points/service.ts`, `server/points/routes.ts`, and `shared/planner/definitions.ts` |
| `app/__init__.py` | Marks `app` as a Python package. | No direct Node equivalent |
| `pyproject.toml` | Declares the Python package and its dependencies. | `package.json` |

This is not yet a full port of tasks or points: the Python task route does not
refresh achievements, synced Google/Gmail tasks and quest tasks remain in Node,
and Python's point summary does not yet match every Node summary option. The
Python reward list is a copy of the Node list, so edits need to be kept in sync.
The [planner refactor plan](../docs/planner-refactor-plan.md#6-python-backend-migration-roadmap)
defines staged parity and cutover work; this experimental API is not wired to
the React app.

The Python API also has **no authentication or CSRF protection yet**. Binding
to `127.0.0.1` avoids network exposure but does not stop other local processes
or browser requests from reaching it. Do not expose it on a network or use it
with sensitive data; add authentication and CSRF protection before connecting
the real app.

## Set up

From the repository root in Git Bash on Windows, create the environment if it
does not already exist, then install the declared development dependencies:

```bash
if [ ! -f 'cyberServer/.venv/Scripts/python.exe' ]; then
  py -3.12 -m venv 'cyberServer\.venv'
fi
'cyberServer/.venv/Scripts/python.exe' -m pip install -e 'cyberServer[dev]'
```

In VS Code, select `cyberServer\.venv\Scripts\python.exe` as the Python
interpreter. Selecting a different environment can make installed imports
appear missing even when they work in the backend's virtual environment.

The backend currently reads `DATABASE_URL` from its process environment or the
repository root `.env` file. Do not launch it directly against the app URL.
Use the guarded test-database launcher below; it overrides `DATABASE_URL` only
for the child command and leaves `.env` and the running Node app unchanged.

Available first-slice endpoints:

- `GET /health`
- `GET /api/journals` and `GET /api/journals/markers`
- `POST /api/journals`, `GET`/`PUT`/`DELETE /api/journals/{date}`
- `GET /api/v1/tasks?date=YYYY-MM-DD`
- `PUT /api/v1/tasks/{task_id}` with `{"date":"YYYY-MM-DD","completed":true}`
- `GET /api/v1/points?date=YYYY-MM-DD`
- `POST /api/v1/rewards/{reward_id}/redeem`

The task and point endpoints use the `routine_tasks`, `routine_task_completions`,
and `point_ledger` tables. Task awards are append-only and use the database's
unique award key to prevent duplicates. Reward redemption uses serializable
transactions so concurrent requests cannot spend the same balance twice.
Apply the committed Prisma migrations before starting this version. Routine
task IDs are positive integers; the API and ledger use their decimal string
representations. Routine tasks are associated with weekday groups when needed;
ungrouped tasks apply every day.

Run Python tests from the repository root:

```bash
'cyberServer/.venv/Scripts/python.exe' -m pytest 'cyberServer\tests'
```

The database integration check is separate because it writes data. After
preparing the disposable database with the launcher below, run it sequentially
while the Python API is stopped:

```bash
with_test_database 'cyberServer\.venv\Scripts\python.exe' \
  -m pytest 'cyberServer\tests\database_integration.py'
```

That existing integration check writes routine completions on `2098-01-06`
and leaves them behind. It requires unused fixture data; a rerun is not
automatically idempotent. Do not reset the whole database to repeat a journal
exercise. The journal persistence test below owns and cleans up its fixtures.

## Isolated journal CRUD

The resource refactor implementation is in place; milestone 5 still has
verification work tracked in the
[refactor plan](../docs/planner-refactor-plan.md#6a-refactor-exit-and-python-entry).
The experimental journal endpoints now implement the Node CRUD response shapes
against the existing schema, but do not provide Node's authentication or CSRF
protection. They are for fictional data on loopback only; React remains on Node.
The setup and verification below use the disposable database.

### 1. Reuse the Node disposable database

If `TEST_DATABASE_URL` is already configured, reuse it. Otherwise follow
[test database setup](../docs/setup.md#set-up-a-disposable-test-database) to
create the test role/database and add its private connection URL to `.env`.
The test database name must end in `_test` and differ from the app database
name. Do not replace the app's `DATABASE_URL`.

This shares only the disposable database, not production data. Prisma
migrations create the matching schema and seeded definitions; there is no
need to copy the app database. Use fictional journal entries initially.

In a dedicated Git Bash terminal at the repository root, define this launcher.
It loads `.env` with the existing Node dotenv dependency, checks both database
names, and passes the test URL only to the requested child process. It does
not print connection URLs or reset a schema.

```bash
with_test_database() {
  node --input-type=module - "$@" <<'NODE'
import "dotenv/config";
import { spawnSync } from "node:child_process";

const appUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
if (!appUrl || !testUrl) {
  throw new Error("Set DATABASE_URL and TEST_DATABASE_URL in the private .env file.");
}
let appConnection;
let testConnection;
try {
  appConnection = new URL(appUrl);
  testConnection = new URL(testUrl);
} catch {
  throw new Error("Database configuration must contain valid PostgreSQL URLs.");
}
if (![appConnection.protocol, testConnection.protocol].every(
  (protocol) => protocol === "postgresql:" || protocol === "postgres:"
)) {
  throw new Error("Database configuration must use PostgreSQL URLs.");
}
const appName = decodeURIComponent(appConnection.pathname.slice(1));
const testName = decodeURIComponent(testConnection.pathname.slice(1));
if (!appName || !testName.endsWith("_test") || testName === appName) {
  throw new Error("Use a separate disposable database whose name ends in _test.");
}
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Supply a command to run against the test database.");
const result = spawnSync(command, args, {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
NODE
}
```

Do not run this with tracing such as `set -x` or print the child environment.
The function exists only in this terminal; redefine it when opening another.

### 2. Apply the existing schema without resetting it

Stop any processes writing to the disposable database, then run:

```bash
with_test_database node 'node_modules\prisma\build\index.js' migrate deploy
```

This applies committed migrations using Prisma's existing schema history;
Python does not create a second migration history. Already applied migrations
are retained. This command does not drop the public schema or copy app rows.

Verify the actual connected database and journal table with a read-only query:

```bash
with_test_database 'cyberServer\.venv\Scripts\python.exe' -c '
import os
import psycopg

with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
    row = connection.execute(
        "SELECT current_database(), current_schema(), to_regclass(%s)",
        ("public.journals",),
    ).fetchone()
    if row is None or not row[0].endswith("_test") or row[1] != "public" or row[2] is None:
        raise RuntimeError("Expected the disposable public schema with a journals table.")
    print("Disposable database and journals table are ready.")
'
```

If schema/table verification fails, correct the test connection or migrations
before making API writes. Do not fall back to the app database.

### 3. Start the existing Python API on the test database

```bash
with_test_database 'cyberServer\.venv\Scripts\python.exe' \
  -m uvicorn app.main:app --app-dir cyberServer --host 127.0.0.1 --port 8000
```

Leave that terminal running. In another Git Bash terminal:

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/health
```

Expect `{"status":"ok"}`. This verifies process responsiveness only; the SQL
check above verifies database/schema access. Stop with `Ctrl+C` before running
Node database tests. Do not start the API with `--reload` during this exercise,
and do not change the React proxy or Google OAuth configuration.

`npm run test:database` deletes all rows in the test database before running.
Do not run it while Python is using that database. If you want to retain
learning entries across Node test runs, use a separate
`cyberplanner_python_test` database with the same migrations instead.

### 4. Implement and verify one journal operation at a time

The operations below can be exercised against fictional fixture dates:

1. **Create:** `POST /api/journals` with `{"date":"2099-01-01","content":"Learning CRUD"}`.
   Expect `201`, and `409` when the same date is submitted again.
2. **Read:** `GET /api/journals/2099-01-01` returns that date and exact content.
   Check collection entries and missing-entry `404`; verify persistence through
   an independent SQL connection.
3. **Update:** `PUT /api/journals/2099-01-01` replaces content and retains the
   row ID. Empty content is valid; a missing date is created by the upsert.
4. **Delete:** `DELETE /api/journals/2099-01-01` returns bodyless `204`, then
   `404` when repeated. Points and routine/therapy completions remain unchanged.
5. **Markers:** `GET /api/journals/markers` excludes empty content, but
   includes whitespace-only content. The collection includes empty entries.
   Both lists are newest first.

Use the [Node journal operations](../server/journals/service.ts) and
[journal API reference](../docs/api.md#journals) as the comparison, not the
experimental `/api/v1/tasks` response format. Python uses `{"detail": ...}`
for journal errors and `422` with a validation detail array for invalid bodies.
Node uses `{"error": ...}` for journal and authentication errors, `400` for
malformed JSON or a missing date, and `422` for invalid content. Python does
not yet authenticate.
Use explicit SQL commits/transactions; closing a psycopg connection without
committing is not a successful persistent write. Python reports a missing or
unavailable database as `503`; Node reports database failures as `500`.
Unexpected database failures are logged and return a generic `500` response.
Both APIs accept real calendar dates in `YYYY-MM-DD` format.

Journal response annotations describe string-valued JSON objects. The exact
`date` and `content` fields are documented in the Node journal API reference.

Fake-connection tests run with the normal Python suite. The separate journal
persistence test reads both URLs from the environment or `.env`, validates that
the test database is distinct and ends in `_test`, refuses occupied fixture
dates, and removes only rows it created. Run it with the Python API stopped:

```bash
'cyberServer/.venv/Scripts/python.exe' -m pytest 'cyberServer/tests/journal_database_integration.py'
```

Do not use the test-database launcher for this command: the test needs the
original `DATABASE_URL` as well as `TEST_DATABASE_URL` to compare them.
Do not connect React to Python until session authentication, same-origin CSRF,
and resource parity are implemented and tested.

## Routines starting point

`app/routines.py` contains work-in-progress `GET /api/routines` and
`PATCH /api/routines/{id}` handlers, plus skeletons for reading and updating
routine completions. The router is not mounted, so this work does not change
the running API. Implement one handler at a time using the Node routines code
and `shared/planner/routines.ts` as the contract.
The existing `/api/v1/tasks` routes are a separate experiment, not a parity
implementation.

Check response fields and ordering, stable IDs, weekday groups, and
server-assigned points with focused tests. Check invalid IDs and kinds, missing
routines, and committed updates as well. Completion updates also depend on
one-time point awards and achievement refresh; they are not ready to switch
until those effects match Node. Mount the router only after the handlers are
ready; keep React on Node and use the disposable database for persistence tests.

## Therapy sessions starting point

`app/therapy.py` contains an unmounted work-in-progress
`GET /api/therapy/sessions` and a skeleton for updating exercise completions.
Use the Node therapy route and service as the contract, including exercise
ordering, completion states, earned points, one-time awards, and achievement
refresh. This slice uses existing assignments; it does not add therapy
definition editing. Verify the handlers with focused tests before mounting the
router.
