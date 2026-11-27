

import datetime

import psycopg
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, StrictBool
from app.tasks import parse_id
from app.database import get_connection
from app.tasks import WEEKDAYS

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
    routines = connection.execute("""
    SELECT routine.id, routine.list, routine.title, routine.kind, routine.points,
        (
            SELECT routine_group.weekday
            FROM routine_task_groups AS assignment
            JOIN routine_groups AS routine_group
                ON routine_group.id = assignment.group_id
            WHERE assignment.task_id = routine.id
            ORDER BY assignment.group_id
            LIMIT 1
        ) AS weekday
    FROM routine_tasks AS routine
    """).fetchall()
    weekday_positions = {weekday: i for i, weekday in enumerate(WEEKDAYS)}
    routines.sort(key=lambda routine: (
        routine["list"],       # alphabetical: daily, morning, night
        -1 if routine["weekday"] is None else weekday_positions[routine["weekday"]],      # -1 for None; otherwise WEEKDAYS.index(...)
        routine["id"],
    ))
    groups = connection.execute("SELECT id, weekday, title, message FROM routine_groups ORDER BY weekday, id").fetchall()
    groups.sort(key=lambda group: weekday_positions[group["weekday"]])
    # Return the routines and routine groups as dictionaries.
    return {"routines": [dict(row) for row in routines], "routineGroups": [dict(row) for row in groups]}


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
        raise HTTPException(status_code=400, detail="Invalid kind")
    points = kind_to_points[body.kind]
    id = parse_id(routine_id)
    if id is None:
        raise HTTPException(status_code=400, detail="Invalid routine ID")
    result = connection.execute(
        "UPDATE routine_tasks SET kind = %s, points = %s WHERE id = %s RETURNING id, kind",
        (body.kind, points, id),
    ).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Routine not found")
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
            day = datetime.datetime.strptime(selected_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
    else:
        raise HTTPException(status_code=400, detail="Missing date")
    if day.date().isoformat() != selected_date:
        raise HTTPException(status_code=400, detail="Invalid date format")
    result = connection.execute(
        "SELECT day, task_id FROM routine_task_completions WHERE day = %s ORDER BY task_id",
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
    id = parse_id(routine_id)
    if id is None:
        raise HTTPException(status_code=400, detail="Invalid routine ID")
    with connection.transaction():
        try:
            day = datetime.datetime.strptime(selected_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
        if day.date().isoformat() != selected_date:
            raise HTTPException(status_code=400, detail="Invalid date format")
        # Update the completion state if the routine is marked as completed
        if body.completed:
            connection.execute(
                "INSERT INTO routine_task_completions (day, task_id) VALUES (%s, %s) "
                "ON CONFLICT (day, task_id) DO NOTHING",
                (day.date(), id),
            )
        else:
            connection.execute(
                "DELETE FROM routine_task_completions WHERE day = %s AND task_id = %s",
                (day.date(), id),
            )

        rows = connection.execute(
            "SELECT task_id FROM routine_task_completions WHERE day = %s ORDER BY task_id",
            (day.date(),),
        ).fetchall()
        checked_task_ids = [str(row["task_id"]) for row in rows]
        return {
            "date": selected_date,
            "taskId": str(id),
            "completed": body.completed,
            "checkedTaskIds": checked_task_ids,  # Placeholder for the checked task ID list
            "earnedAchievements": [],  # Placeholder for actual achievements
        }
