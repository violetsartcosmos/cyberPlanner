import datetime

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, StrictBool

from app.database import get_connection


# Describe the requested exercise completion state.
class TherapyCompletionUpdate(BaseModel):
    completed: StrictBool


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
        "SELECT * FROM therapy_sessions ORDER BY position",
    ).fetchall()
    return {"therapySessions": [dict(row) for row in result], "earnedPoints": 0}


# Set an exercise's completion state for a therapy session and date.
# @param session_id - The therapy session ID from the URL.
# @param exercise_id - The exercise ID from the URL.
# @param selected_date - The planner date from the URL in YYYY-MM-DD format.
# @param body - The requested completed state.
# @param connection - The database connection supplied for this request.
# @returns The date, sessionId, exerciseId, completed, and earnedAchievements.
#
# Check that the exercise is assigned to the session before saving. Completing
# creates a row in therapy_completions and awards points only once using the
# key pt:{date}:{session_id}:{exercise_id}; unchecking deletes the completion
# row but retains the award. Refresh today's achievements after either change.
# Keep the completion, award, and refresh in one serializable transaction.
# Node returns 400 for invalid input and 404 for a missing assignment.
# FastAPI's default body validation returns 422; resolve that before parity.
@router.put("/sessions/{session_id}/exercises/{exercise_id}/completions/{selected_date}")
def set_therapy_completion(
    session_id: str,
    exercise_id: str,
    selected_date: str,
    body: TherapyCompletionUpdate,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, object]:
    if not selected_date or selected_date.strip() == "":
        raise HTTPException(status_code=400, detail="Missing date")
    try:
        day = datetime.datetime.strptime(selected_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Incorrect date format")
    if day.date().isoformat() != selected_date:
        raise HTTPException(status_code=400, detail="Invalid date format")
    therapy_session_exercise = connection.execute(
        "SELECT * FROM therapy_session_exercises WHERE session_id = %s AND exercise_id = %s",
        (session_id, exercise_id)
    ).fetchone()
    if not therapy_session_exercise:
        raise HTTPException(status_code=404, detail="Exercise not assigned to session")
    if not body.completed:
        connection.execute(
            "DELETE FROM therapy_completions WHERE day = %s AND session_id = %s AND exercise_id = %s",
            (day.date(), session_id, exercise_id)
        )
    else:
        connection.execute(
            "INSERT INTO therapy_completions (day, session_id, exercise_id) VALUES (%s, %s, %s) ON CONFLICT (day, session_id, exercise_id) DO NOTHING",
            (day.date(), session_id, exercise_id)
        )
    connection.commit()
    return {
        "date": selected_date,
        "sessionId": session_id,
        "exerciseId": exercise_id,
        "completed": body.completed,
        "earnedAchievements": ["Milestone"]
    }

