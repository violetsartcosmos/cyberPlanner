# Python backend

This FastAPI service is being built alongside the existing Node server. It uses
the current PostgreSQL schema and does not run or create database migrations.
The first slice exposes routine tasks and points under `/api/v1`; the React app
continues to use Node until the Python API has enough feature parity to switch.

## What is duplicated so far?

Nothing has been removed from or switched away from the Node server. The Python
endpoints use different URLs and response shapes, and the current React app
still calls the Node API. Both servers can access the same tables, so
Python writes can change what Node sees. Use a disposable database copy while
learning and validating the Python code.

| Python file | Purpose | Node code it parallels |
| --- | --- | --- |
| `app/main.py` | Creates the FastAPI app, connects the routers, and exposes a process health check. | `server/app.ts` and `server/index.ts` |
| `app/database.py` | Loads configuration and opens/closes a PostgreSQL connection for a request. | `server/db/client.ts`, which uses Prisma rather than psycopg |
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
exercise. Future journal persistence tests must own and clean up only their
fixture dates.

## Next step: isolated journal CRUD

The resource refactor implementation is in place; milestone 5 still has
verification work tracked in the
[refactor plan](../docs/planner-refactor-plan.md#6a-refactor-exit-and-python-entry).
The first Python learning slice can begin independently. **Journal endpoints
are not implemented yet.** The commands below prepare the existing Python
service and test schema, not a completed journal API.

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

Next implementation order, against fictional fixture dates:

1. **Create:** `POST /api/journals` with `{"date":"2099-01-01","content":"Learning CRUD"}`.
   Expect `201`, and `409` when the same date is submitted again.
2. **Read:** `GET /api/journals/2099-01-01` returns that date and exact content.
   Add collection dates and missing-entry `404`; verify persistence through
   an independent SQL connection.
3. **Update:** `PUT /api/journals/2099-01-01` replaces content and retains the
   row ID. Empty content is valid; a missing date is created by the upsert.
4. **Delete:** `DELETE /api/journals/2099-01-01` returns bodyless `204`, then
   `404` when repeated. Points and routine/therapy completions remain unchanged.
5. **Markers:** `GET /api/journals/markers` excludes empty or whitespace-only
   content; collection dates include those entries. Both are newest first.

Use the [Node journal operations](../server/journals/service.ts) and
[journal API reference](../docs/api.md#journals) as the comparison, not the
experimental `/api/v1/tasks` response format. Keep Node's `{error: ...}` bodies
and numeric HTTP statuses. Use explicit SQL commits/transactions; closing a
psycopg connection without committing is not a successful persistent write.

Add fake-connection API tests and a separate journal database test using
`TEST_DATABASE_URL`, with fixture-date ownership and cleanup. Do not connect
React to Python until session authentication, same-origin CSRF, and resource
parity are implemented and tested.

### 5. Verify the learning slice in Chrome

Once journal routes have been implemented and the guarded Python API is
running, open [FastAPI's interactive docs](http://127.0.0.1:8000/docs) in Chrome.
This lets you exercise Python directly without changing the React proxy.
Until then, only the existing task/point routes and health route are available.

1. Expand `POST /api/journals`, select **Try it out**, enter the fictional
   create body above, and **Execute**. Verify `201`, then execute it again and
   verify `409` without replacing the original content.
2. Execute the dated GET and collection GET. Verify the exact saved content,
   date format, and newest-first browser dates.
3. Execute the dated PUT with changed content, then reread it. Repeat with
   empty content and check that collection dates include the entry while
   markers exclude it. Also test whitespace-only marker behavior.
4. Confirm the fixture date before executing DELETE. Verify `204` with no
   response body; subsequent GET and DELETE must be `404`.
5. Use the independent SQL persistence check and focused tests as well.
   Swagger displaying a successful response is not enough to prove a commit.
   Never execute these learning writes against the Node app database.

Chrome verification of the current React app remains a separate refactor
gate. The shared dashboard currently records `404` for `/api/session` and
`/api/planner/calendar`, so it is not a verified live instance of the new
routes. Ensure the Node API on the Vite proxy target is running the matching
source/build before rechecking it. Do not change the Google account, OAuth
configuration, or Python routing to work around that mismatch.
