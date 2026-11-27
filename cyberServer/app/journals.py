"""Provide the experimental journal API using the existing PostgreSQL schema."""

import re
from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, StrictStr

from app.database import get_connection


class JournalCreate(BaseModel):
    """Describe a new entry's ISO date and optional initial content."""

    date: StrictStr
    content: StrictStr = ""


class JournalSave(BaseModel):
    """Describe the replacement content for an existing or new entry."""

    content: StrictStr


# Routes for journal entries and calendar markers.
router = APIRouter(prefix="/api/journals")


# Convert a YYYY-MM-DD string to a calendar date.
# @param value - The journal date.
# @returns The calendar date; invalid dates raise an HTTP 400 error.
def parse_journal_date(value: str) -> date:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise HTTPException(status_code=400, detail="That planner date is invalid.")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="That planner date is invalid.") from error


# List all saved journals, including empty entries.
# @param connection - The database connection supplied for this request.
# @returns Dates and content, newest first.
@router.get("")
def list_journals(connection: psycopg.Connection = Depends(get_connection)) -> list[dict[str, str]]:
    rows = connection.execute("SELECT day, content FROM journals ORDER BY day DESC").fetchall()
    return [{"date": row["day"].isoformat(), "content": row["content"]} for row in rows]


# List dates that have journal content for calendar markers.
# @param connection - The database connection supplied for this request.
# @returns Objects containing dates for non-empty entries, newest first; whitespace counts as content.
@router.get("/markers")
def list_journal_dates_with_content(connection: psycopg.Connection = Depends(get_connection)) -> list[dict[str, str]]:
    rows = connection.execute("SELECT day FROM journals WHERE content <> '' ORDER BY day DESC").fetchall()
    return [{"date": row["day"].isoformat()} for row in rows]


# Create a journal entry for the requested date.
# @param body - The date and optional initial content; omitted content starts empty.
# @param connection - The database connection supplied for this request.
# @returns The created date and content with HTTP 201; an existing date returns 409.
@router.post("", status_code=201)
def create_journal(
    body: JournalCreate, connection: psycopg.Connection = Depends(get_connection)
) -> dict[str, str]:
    day = parse_journal_date(body.date)
    row = connection.execute(
        """INSERT INTO journals (day, content) VALUES (%s, %s)
           ON CONFLICT (day) DO NOTHING RETURNING content""",
        (day, body.content),
    ).fetchone()
    connection.commit()
    if row is None:
        raise HTTPException(status_code=409, detail="A journal entry already exists for that date.")
    return {"date": day.isoformat(), "content": row["content"]}


# Read the journal entry for a requested date.
# @param journal_date - The journal date from the URL.
# @param connection - The database connection supplied for this request.
# @returns The date and saved content; a missing entry returns HTTP 404.
@router.get("/{journal_date}")
def get_journal(
    journal_date: str, connection: psycopg.Connection = Depends(get_connection)
) -> dict[str, str]:
    day = parse_journal_date(journal_date)
    row = connection.execute("SELECT content FROM journals WHERE day = %s", (day,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Journal not found.")
    return {"date": day.isoformat(), "content": row["content"]}


# Replace a journal entry or create it if the date has no entry.
# @param journal_date - The journal date from the URL.
# @param body - The complete replacement content, which may be empty.
# @param connection - The database connection supplied for this request.
# @returns The date and saved content with HTTP 200.
@router.put("/{journal_date}")
def save_journal(
    journal_date: str, body: JournalSave, connection: psycopg.Connection = Depends(get_connection)
) -> dict[str, str]:
    day = parse_journal_date(journal_date)
    connection.execute(
        """
        INSERT INTO journals (day, content) VALUES (%s, %s)
        ON CONFLICT (day) DO UPDATE SET content = EXCLUDED.content
        """,
        (day, body.content),
    )
    connection.commit()
    return {"date": day.isoformat(), "content": body.content}


# Delete the journal entry for a requested date.
# @param journal_date - The journal date from the URL.
# @param connection - The database connection supplied for this request.
# @returns An empty HTTP 204 response; a missing entry returns HTTP 404.
@router.delete("/{journal_date}", status_code=204)
def delete_journal(journal_date: str, connection: psycopg.Connection = Depends(get_connection)) -> Response:
    day = parse_journal_date(journal_date)
    row = connection.execute(
        "DELETE FROM journals WHERE day = %s RETURNING id", (day,)
    ).fetchone()
    connection.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="Journal not found.")
    return Response(status_code=204)
