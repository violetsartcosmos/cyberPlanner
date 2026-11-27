

import datetime

import psycopg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, StrictBool

from app.database import get_connection


# Describe the requested routine kind.
class RoutineKindUpdate(BaseModel):
    kind: str


# Describe the requested completion state.
class RoutineCompletionUpdate(BaseModel):
    completed: StrictBool


router = APIRouter(prefix="/api/routines", tags=["routines"])


# List routine definitions and weekday groups.
# @param connection - The database connection supplied for this request.
# @returns An object with routines and routineGroups arrays.
#
# Each routine has id, list, weekday, title, kind, and points; weekday is
# null for an ungrouped routine. Each group has id, weekday, title, and
# message. Match the ordering and group selection in Node's loadRoutines.
@router.get("")
def list_routines(
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, object]:
    rows = connection.execute("SELECT * FROM routines").fetchall()
    return {"routines": [dict(row) for row in rows], "routineGroups": []}


# Change a routine's kind and its server-owned point value.
# @param routine_id - The positive integer routine ID from the URL.
# @param body - The requested kind: side, main, or boss.
# @param connection - The database connection supplied for this request.
# @returns The numeric id and kind; invalid IDs or kinds return 400, and
# missing routines return 404.
#
# Assign points from the kind (side: 10, main: 50, boss: 150), not from
# client input. Save both fields together and commit the update.
@router.patch("/{routine_id}")
def update_routine_kind(
    routine_id: str,
    body: RoutineKindUpdate,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, object]:
    kind_to_points = {"side": 10, "main": 50, "boss": 150}
    if body.kind not in kind_to_points:
        raise ValueError("Invalid kind")
    points = kind_to_points[body.kind]
    result = connection.execute(
        "UPDATE routines SET kind = %s, points = %s WHERE id = %s RETURNING id, kind",
        (body.kind, points, routine_id),
    ).fetchone()
    if not result:
        raise ValueError("Routine not found")
    connection.commit()
    return dict(result)


# List the checked routine IDs for a planner date.
# @param selected_date - The date query parameter in YYYY-MM-DD format.
# @param connection - The database connection supplied for this request.
# @returns The date and taskIds as strings ordered by numeric task ID.
#
# Node returns 400 for a missing or invalid date.
@router.get("/completions")
def get_routine_completions(
    selected_date: str | None = Query(default=None, alias="date"),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, object]:
    if selected_date:
        try:
            datetime.datetime.strptime(selected_date, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Invalid date")
    else:
        raise ValueError("Missing date")

    result = connection.execute(
        "SELECT date, task_id FROM routine_completions WHERE date = %s ORDER BY task_id",
        (selected_date,),
    ).fetchall()
    return {"date": selected_date, "taskIds": [str(row["task_id"]) for row in result]}


# Set a routine's completion state for a planner date.
# @param routine_id - The positive integer routine ID from the URL.
# @param selected_date - The planner date from the URL in YYYY-MM-DD format.
# @param body - The requested completed state.
# @param connection - The database connection supplied for this request.
# @returns The date, string taskId, completed state, checkedTaskIds, and
# earnedAchievements.
#
# Reject invalid IDs, dates, and completion states with 400; return 404 for
# a missing routine or one not assigned to that weekday. FastAPI's default
# body validation returns 422, so resolve that difference before parity.
# The check, one-time point award, and achievement refresh belong in one
# serializable transaction. Unchecking removes the check, not the award.
# Refresh achievements for the current date, as the Node implementation does.
@router.put("/{routine_id}/completions/{selected_date}")
def set_routine_completion(
    routine_id: str,
    selected_date: str,
    body: RoutineCompletionUpdate,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, object]:
    id = int(routine_id)
    if id is None or id <= 0:
        raise ValueError("Invalid routine ID")
    with connection.transaction():
        try:
            datetime.datetime.strptime(selected_date, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Invalid date")

        # Update the completion state
        connection.execute(
            "INSERT INTO routine_completions (date, task_id, completed) VALUES (%s, %s, %s) "
            "ON CONFLICT (date, task_id) DO UPDATE SET completed = EXCLUDED.completed",
            (selected_date, id, body.completed),
        )
        connection.commit()
        return {
            "date": selected_date,
            "taskId": str(id),
            "completed": body.completed,
            "checkedTaskIds": 1,  # Placeholder for the checked task ID list
            "earnedAchievements": [],  # Placeholder for actual achievements
        }
