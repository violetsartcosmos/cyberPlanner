"""Verify journal persistence only on a separately configured disposable database."""

import os
from datetime import date
from urllib.parse import unquote, urlparse

import psycopg
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from app.database import get_connection
from app.main import app


def test_journal_persistence_on_disposable_database(monkeypatch):
    test_url = os.environ.get("TEST_DATABASE_URL")
    app_url = os.environ.get("DATABASE_URL")
    if not test_url or not app_url:
        raise RuntimeError("Both DATABASE_URL and TEST_DATABASE_URL are required.")
    test_connection = urlparse(test_url)
    app_connection = urlparse(app_url)
    test_name = unquote(test_connection.path.lstrip("/"))
    app_name = unquote(app_connection.path.lstrip("/"))
    if (
        test_connection.scheme not in ("postgres", "postgresql")
        or app_connection.scheme not in ("postgres", "postgresql")
        or not app_name
        or not test_name.endswith("_test")
        or test_name == app_name
    ):
        raise RuntimeError("A separate disposable database ending in _test is required.")

    fixture_dates = [
        date(2099, 12, 27), date(2099, 12, 28),
        date(2099, 12, 29), date(2099, 12, 30),
    ]
    with psycopg.connect(test_url) as connection:
        actual = connection.execute(
            "SELECT current_database(), current_schema(), to_regclass('public.journals')"
        ).fetchone()
        if actual != (test_name, "public", "journals"):
            raise RuntimeError("The disposable public journal schema is not ready.")
        if connection.execute(
            "SELECT 1 FROM journals WHERE day = ANY(%s)", (fixture_dates,)
        ).fetchone():
            raise RuntimeError("The journal fixture dates are already in use.")
        before = connection.execute(
            """SELECT (SELECT count(*) FROM point_ledger),
                      (SELECT count(*) FROM routine_task_completions),
                      (SELECT count(*) FROM therapy_completions),
                      (SELECT count(*) FROM achievements)"""
        ).fetchone()

    def provide_test_connection():
        with psycopg.connect(test_url, row_factory=dict_row) as connection:
            yield connection

    owned_ids = []

    def remember_id(day):
        with psycopg.connect(test_url) as connection:
            row = connection.execute(
                "SELECT id, content FROM journals WHERE day = %s", (day,)
            ).fetchone()
        assert row is not None
        owned_ids.append(row[0])
        return row

    app.dependency_overrides[get_connection] = provide_test_connection
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            first, second, third, failed = [day.isoformat() for day in fixture_dates]
            created = client.post(
                "/api/journals",
                json={"date": first, "content": "fictional \u2603"},
            )
            assert created.status_code == 201
            assert created.json()["date"] == first
            original_id, content = remember_id(fixture_dates[0])
            assert content == "fictional \u2603"
            assert client.post("/api/journals", json={"date": first}).status_code == 409
            assert client.get(f"/api/journals/{first}").json()["content"] == content

            assert client.put(f"/api/journals/{first}", json={"content": "replacement"}).status_code == 200
            with psycopg.connect(test_url) as connection:
                row = connection.execute(
                    "SELECT id, content FROM journals WHERE day = %s", (fixture_dates[0],)
                ).fetchone()
            assert row == (original_id, "replacement")
            assert client.post("/api/journals", json={"date": second}).status_code == 201
            assert remember_id(fixture_dates[1])[1] == ""
            assert client.put(f"/api/journals/{third}", json={"content": " \n"}).status_code == 200
            remember_id(fixture_dates[2])
            entries = client.get("/api/journals").json()
            marker_dates = [item["date"] for item in client.get("/api/journals/markers").json()]
            assert [entry for entry in entries if entry["date"] in (first, second, third)] == [
                {"date": third, "content": " \n"},
                {"date": second, "content": ""},
                {"date": first, "content": "replacement"},
            ]
            assert [day for day in marker_dates if day in (first, second, third)] == [third, first]
            deleted = client.delete(f"/api/journals/{first}")
            assert deleted.status_code == 204 and deleted.content == b""
            assert client.get(f"/api/journals/{first}").status_code == 404
            assert client.delete(f"/api/journals/{first}").status_code == 404
            with psycopg.connect(test_url) as connection:
                after = connection.execute(
                    """SELECT (SELECT count(*) FROM point_ledger),
                              (SELECT count(*) FROM routine_task_completions),
                              (SELECT count(*) FROM therapy_completions),
                              (SELECT count(*) FROM achievements)"""
                ).fetchone()
            assert after == before

            class FailedCommitConnection:
                def __init__(self, connection):
                    self.connection = connection

                def execute(self, query, params):
                    return self.connection.execute(query, params)

                def commit(self):
                    raise psycopg.OperationalError("simulated commit failure")

                def close(self):
                    self.connection.close()

            original_connect = psycopg.connect
            app.dependency_overrides.pop(get_connection, None)
            with monkeypatch.context() as patch:
                patch.setenv("DATABASE_URL", test_url)
                patch.setattr(
                    psycopg, "connect",
                    lambda *args, **kwargs: FailedCommitConnection(original_connect(*args, **kwargs)),
                )
                response = client.post("/api/journals", json={"date": failed, "content": "not saved"})
                assert response.status_code == 500
                assert response.text == "Internal Server Error"
            with psycopg.connect(test_url) as connection:
                assert connection.execute(
                    "SELECT 1 FROM journals WHERE day = %s", (fixture_dates[3],)
                ).fetchone() is None
    finally:
        app.dependency_overrides.pop(get_connection, None)
        if owned_ids:
            with psycopg.connect(test_url) as connection:
                connection.execute("DELETE FROM journals WHERE id = ANY(%s)", (owned_ids,))
