import datetime

import psycopg
from fastapi import APIRouter, Depends, Query

from app.database import get_connection


router = APIRouter(prefix="/api/therapy", tags=["therapy"])


# Read therapy sessions, exercise completion states, and earned points.
# @param selected_date - The date query parameter in YYYY-MM-DD format.
# @param connection - The database connection supplied for this request.
# @returns An object with therapySessions and earnedPoints.
#
# Each session contains id, label, title, and exercises. Each exercise contains
# id, name, prescription, instructions, purpose, assignment points, and
# completed. Order sessions and exercises by their stored positions.
# Count earned points for this date's "pt:" ledger awards, even if an exercise
# was later unchecked. Read the plan, completions, and points consistently.
# Node returns 400 for a missing or invalid date.
@router.get("/sessions")
def get_therapy_sessions(
    selected_date: str | None = Query(default=None, alias="date"),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, object]:
    if not selected_date or selected_date.strip() == "" or datetime.datetime.strptime(selected_date, "%Y-%m-%d") is None:
        raise ValueError("Missing or incorrect date")
    transformed_date = datetime.datetime.strptime(selected_date, "%Y-%m-%d")
    result = connection.execute(
        "SELECT * FROM therapy_sessions WHERE date = %s ORDER BY position",
        (transformed_date,),
    ).fetchall()
    return {"therapySessions": [dict(row) for row in result], "earnedPoints": 0}

