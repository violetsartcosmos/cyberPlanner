# Python backend

This FastAPI service is being built alongside the existing Node server. It uses
the current PostgreSQL schema and does not run or create database migrations.
The first slice exposes routine tasks and points under `/api/v1`; the React app
continues to use Node until the Python API has enough feature parity to switch.

## What is duplicated so far?

Nothing has been removed from or switched away from the Node server. The Python
endpoints use different URLs and response shapes, and the current React app
still calls Node's `/api/planner`. Both servers can access the same tables, so
Python writes can change what Node sees. Use a disposable database copy while
learning and validating the Python code.

| Python file | Purpose | Node code it parallels |
| --- | --- | --- |
| `app/main.py` | Creates the FastAPI app, connects the routers, and exposes a process health check. | `server/app.ts` and `server/index.ts` |
| `app/database.py` | Loads configuration and opens/closes a PostgreSQL connection for a request. | `server/db/client.ts`, which uses Prisma rather than psycopg |
| `app/tasks.py` | Lists built-in routines by numeric ID and records a check and its point award. | `server/planner/routines.ts`, `server/planner/service.ts`, and `server/points/service.ts` |
| `app/points.py` | Reads the ledger and allows redemption of a predefined reward. | `server/points/service.ts`, `server/points/actions.ts`, and `shared/planner/definitions.ts` |
| `app/__init__.py` | Marks `app` as a Python package. | No direct Node equivalent |
| `pyproject.toml` | Declares the Python package and its dependencies. | `package.json` |

This is not yet a full port of tasks or points: the Python task route does not
refresh achievements, synced Google/Gmail tasks and quest tasks remain in Node,
and Python's point summary does not yet match every Node summary option. The
Python reward list is a copy of the Node list, so edits need to be kept in sync.

The Python API also has **no authentication or CSRF protection yet**. Binding
to `127.0.0.1` avoids network exposure but does not stop other local processes
or browser requests from reaching it. Do not expose it on a network or use it
with sensitive data; add authentication and CSRF protection before connecting
the real app.

## Set up

From the repository root in PowerShell:

```powershell
py -3.12 -m venv cyberServer\.venv
cyberServer\.venv\Scripts\python.exe -m pip install -e "cyberServer[dev]"
```

In VS Code, select `cyberServer\.venv\Scripts\python.exe` as the Python
interpreter. Selecting a different environment can make installed imports
appear missing even when they work in the backend's virtual environment.

The backend reads `DATABASE_URL` from the process environment or the repository
root `.env` file. Start it on loopback so it is only available on this machine:

```powershell
cyberServer\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir cyberServer --host 127.0.0.1 --port 8000
```

Available first-slice endpoints:

- `GET /health`
- `GET /api/v1/tasks?date=YYYY-MM-DD`
- `PUT /api/v1/tasks/{task_id}` with `{"date":"YYYY-MM-DD","completed":true}`
- `GET /api/v1/points?date=YYYY-MM-DD`
- `POST /api/v1/rewards/{reward_id}/redeem`

The task and point endpoints use the existing `routine_tasks`, `planner_days`,
and `point_ledger` tables. Task awards are append-only and use the database's
unique award key to prevent duplicates. Reward redemption uses serializable
transactions so concurrent requests cannot spend the same balance twice.
Apply the committed Prisma migrations before starting this version. Routine
task IDs are positive integers; the checklist and ledger store their decimal
representations as strings for compatibility with the rest of the planner.
Morning and night routines have a `NULL` weekday; daily routines have a named
weekday such as `monday`. The migration converts the old numeric values.

Run Python tests from the repository root:

```powershell
cyberServer\.venv\Scripts\python.exe -m pytest cyberServer\tests
```

The database integration check is separate because it writes data. Point
`TEST_DATABASE_URL` at a disposable database with all Prisma migrations
applied, then run:

```powershell
cyberServer\.venv\Scripts\python.exe -m pytest cyberServer\tests\database_integration.py
```
