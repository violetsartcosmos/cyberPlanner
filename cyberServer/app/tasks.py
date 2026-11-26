"""Experiment with the Node routine-task flow using FastAPI and SQL.

The closest Node code is server/planner/routines.ts and the built-in task
completion function in server/planner/service.ts. These routes do not replace
the app's /api/planner yet, and they do not update achievements.
"""

from datetime import date
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database import get_connection

router = APIRouter(prefix="/api/v1", tags=["tasks"])

# Python numbers weekdays from Monday (0); the database stores readable names.
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


class TaskCompletion(BaseModel):
    """Describe the JSON body accepted when changing a task's completion.

    date is the planner day to update; completed is the requested state.
    FastAPI uses this Pydantic model to parse and validate those fields before
    calling set_task_completion.
    """

    date: date
    completed: bool


def weekday_name(selected_date: date) -> str:
    """Convert a date to the weekday name stored in PostgreSQL.

    date.weekday() returns a number from 0 (Monday) to 6 (Sunday). Looking up
    the name explicitly avoids relying on the computer's language settings.
    """
    return WEEKDAYS[selected_date.weekday()]


def routine_id(task_id: str) -> int | None:
    """Parse a positive PostgreSQL integer ID, or return None for an invalid ID.

    The URL supplies task_id as text. The stable ID identifies the task itself;
    its weekday is checked separately when looking it up. This mirrors
    routineId in server/planner/routines.ts.
    """
    if not task_id.isascii() or not task_id.isdecimal() or task_id.startswith("0"):
        return None
    # PostgreSQL INTEGER values cannot exceed 2,147,483,647.
    if len(task_id) > 10 or int(task_id) > 2147483647:
        return None
    return int(task_id)


@router.get("/tasks")
def list_tasks(
    selected_date: date = Query(alias="date"),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    """Handle GET /api/v1/tasks?date=YYYY-MM-DD.

    selected_date comes from the date query parameter; FastAPI opens the
    database connection through Depends(get_connection). The query loads
    morning and night routines plus the daily routine for that weekday. It
    compares their IDs with routine_task_completions to mark each task completed
    or not completed. If the day has no saved row, all tasks start unchecked.

    Return the selected date and a tasks list containing IDs, titles, types,
    point values, and completion states. This combines pieces of loadRoutines
    in server/planner/routines.ts and getPlannerSnapshot in
    server/planner/service.ts; it is a separate API, not a replacement for
    Node's planner response.
    """
    # Query(alias="date") accepts ?date= even though the Python name differs.
    # %s placeholders pass values separately from SQL instead of building SQL
    # from user input. This reads the existing Prisma-managed tables.
    rows = connection.execute(
        """
        SELECT t.id, t.list, t.title, t.kind, t.points
        FROM routine_tasks t
        WHERE NOT EXISTS (SELECT 1 FROM routine_task_groups tg WHERE tg.task_id = t.id)
           OR EXISTS (
               SELECT 1 FROM routine_task_groups tg
               JOIN routine_groups g ON g.id = tg.group_id
               WHERE tg.task_id = t.id AND g.weekday = %s
           )
        ORDER BY CASE list
            WHEN 'morning' THEN 0
            WHEN 'night' THEN 1
            ELSE 2
        END, t.id
        """,
        (weekday_name(selected_date),),
    ).fetchall()
    checks = connection.execute(
        """
        SELECT task_id FROM routine_task_completions WHERE day = %s
        """,
        (selected_date,),
    ).fetchall()
    completed_ids = {row["task_id"] for row in checks}

    return {
        "date": selected_date.isoformat(),
        "tasks": [
            {
                "id": row["id"],
                "list": row["list"],
                "title": row["title"],
                "kind": row["kind"],
                "points": row["points"],
                "completed": row["id"] in completed_ids,
            }
            for row in rows
        ],
    }


@router.put("/tasks/{task_id}")
def set_task_completion(
    task_id: str,
    request: TaskCompletion,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    """Handle PUT /api/v1/tasks/{task_id} with a TaskCompletion JSON body.

    task_id identifies a built-in routine; request supplies the planner date
    and desired completed state. FastAPI provides the database connection.
    The function validates the ID and checks that the routine applies to the
    requested weekday. Ungrouped routines have no weekday restriction;
    grouped tasks must match the selected weekday. It then updates the day's checks
    and, when completing, attempts to insert
    one ledger award. The check and award share a transaction. Unchecking does
    not remove the award, so checking the task again cannot earn it twice.

    Return the date, task ID, requested state, updated checks, and points
    awarded by this request (zero when no new award was inserted). An invalid
    ID returns HTTP 400; a well-formed ID with no matching routine returns 404.

    This parallels setBuiltinTaskCompletion in server/planner/service.ts and
    awardTaskPoints in server/points/service.ts. Unlike Node, this function
    does not refresh achievements or return newly earned achievements yet.
    """
    id = routine_id(task_id)
    if id is None:
        raise HTTPException(status_code=400, detail="That planner task is invalid.")

    # Keep the check update and its ledger award together: an error rolls both
    # back
    with connection.transaction():
        routine = connection.execute(
            """
            SELECT t.points
            FROM routine_tasks t
            WHERE t.id = %s AND (
                NOT EXISTS (SELECT 1 FROM routine_task_groups tg WHERE tg.task_id = t.id)
                OR EXISTS (
                    SELECT 1 FROM routine_task_groups tg
                    JOIN routine_groups g ON g.id = tg.group_id
                    WHERE tg.task_id = t.id AND g.weekday = %s
                )
            )
            """,
            (id, weekday_name(request.date)),
        ).fetchone()
        if routine is None:
            raise HTTPException(status_code=404, detail="That planner task is invalid.")

        if request.completed:
            connection.execute(
                """
                INSERT INTO routine_task_completions (day, task_id) VALUES (%s, %s)
                ON CONFLICT DO NOTHING
                """,
                (request.date, id),
            )
        else:
            connection.execute(
                "DELETE FROM routine_task_completions WHERE day = %s AND task_id = %s",
                (request.date, id),
            )
        checks = [
            str(row["task_id"])
            for row in connection.execute(
                "SELECT task_id FROM routine_task_completions WHERE day = %s ORDER BY task_id",
                (request.date,),
            ).fetchall()
        ]

        awarded_points = 0
        if request.completed:
            # The partial unique index on earn task_key prevents a second award.
            # Unchecking removes the check but deliberately keeps the award.
            award = connection.execute(
                """
                INSERT INTO point_ledger (amount, entry_type, task_key, task_date)
                VALUES (%s, 'earn', %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (routine["points"], f"builtin:{request.date}:{task_id}", request.date),
            ).fetchone()
            if award is not None:
                awarded_points = routine["points"]

    return {
        "ok": True,
        "date": request.date.isoformat(),
        "taskId": task_id,
        "completed": request.completed,
        "checks": checks,
        "awardedPoints": awarded_points,
    }
