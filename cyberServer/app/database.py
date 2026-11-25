"""Provide PostgreSQL connections to the experimental Python API.

This parallels server/db/client.ts, but uses psycopg and SQL instead of Prisma.
The Node server still has its own database client and remains in use.
"""

# These are part of Python itself: logging, environment variables, type hints,
# and filesystem paths. They do not need to be installed with pip.
import logging
import os
from collections.abc import Generator
from pathlib import Path

# These come from packages in pyproject.toml: psycopg talks to PostgreSQL,
# dotenv reads .env, and FastAPI turns configuration failures into HTTP errors.
import psycopg
from dotenv import load_dotenv
from fastapi import HTTPException
from psycopg.rows import dict_row

# database.py is in cyberServer/app: two parents up is the repository root.
# Existing environment variables take precedence over values in the .env file.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

# Provide a connection to the PostgreSQL database for each request.
def get_connection() -> Generator[psycopg.Connection, None, None]:
    """Open one connection for a request and close it after the response."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(status_code=503, detail="DATABASE_URL is not configured.")

    try:
        # dict_row lets SQL results be read by column name, such as row["points"].
        connection = psycopg.connect(database_url, row_factory=dict_row)
    except psycopg.OperationalError as error:
        logger.exception("Could not connect to PostgreSQL.")
        raise HTTPException(status_code=503, detail="The database is unavailable.") from error

    try:
        # FastAPI's Depends(get_connection) receives this connection. The code
        # after yield runs when the request finishes, including on errors.
        yield connection
    finally:
        connection.close()
