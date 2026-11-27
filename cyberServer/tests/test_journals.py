from datetime import date

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


class JournalConnection:
    def __init__(self):
        self.entries = {}
        self.commits = 0
        self.rollbacks = 0

    def execute(self, query, params=()):
        if query.startswith("SELECT day"):
            if "WHERE content <> ''" in query:
                return Cursor([
                    {"day": day}
                    for day, content in sorted(self.entries.items(), reverse=True)
                    if content
                ])
            return Cursor([
                {"day": day, "content": content}
                for day, content in sorted(self.entries.items(), reverse=True)
            ])
        if query.startswith("SELECT content"):
            content = self.entries.get(params[0])
            return Cursor([] if content is None else [{"content": content}])
        if "INSERT INTO journals" in query:
            day = params[0]
            if day in self.entries and "DO NOTHING" in query:
                return Cursor([])
            content = params[1] if len(params) > 1 else ""
            self.entries[day] = content
            return Cursor([{"content": content}])
        if "DELETE FROM journals" in query:
            content = self.entries.pop(params[0], None)
            return Cursor([] if content is None else [{"id": 1}])
        raise AssertionError(f"Unexpected query: {query}")

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


@pytest.fixture
def journal_client():
    connection = JournalConnection()
    app.dependency_overrides[get_connection] = lambda: connection
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, connection
    finally:
        app.dependency_overrides.pop(get_connection, None)


def test_journal_crud_and_bodyless_delete(journal_client):
    client, _connection = journal_client
    path = "/api/journals/2099-01-01"
    assert client.get(path).json() == {"detail": "Journal not found."}
    created = client.post("/api/journals", json={"date": "2099-01-01"})
    assert created.status_code == 201
    assert created.json() == {"date": "2099-01-01", "content": ""}
    duplicate = client.post("/api/journals", json={"date": "2099-01-01", "content": "not saved"})
    assert duplicate.status_code == 409
    assert duplicate.json() == {"detail": "A journal entry already exists for that date."}
    assert client.get(path).json()["content"] == ""

    content = '[{"text":"Snow \u2603"}]' * 10000
    assert client.put(path, json={"content": content}).json() == {
        "date": "2099-01-01", "content": content
    }
    assert client.get(path).json()["content"] == content
    assert client.put("/api/journals/2099-01-02", json={"content": ""}).status_code == 200
    deleted = client.delete(path)
    assert deleted.status_code == 204 and deleted.content == b""
    assert client.delete(path).status_code == 404


def test_collection_and_markers_include_whitespace_content(journal_client):
    client, connection = journal_client
    connection.entries = {
        date(2099, 1, 1): "visible",
        date(2099, 1, 2): "",
        date(2099, 1, 3): " \n",
        date(2099, 1, 4): "more",
    }
    assert client.get("/api/journals").json() == [
        {"date": "2099-01-04", "content": "more"}, {"date": "2099-01-03", "content": " \n"},
        {"date": "2099-01-02", "content": ""}, {"date": "2099-01-01", "content": "visible"},
    ]
    assert client.get("/api/journals/markers").json() == [
        {"date": "2099-01-04"}, {"date": "2099-01-03"}, {"date": "2099-01-01"},
    ]


@pytest.mark.parametrize("value", [
    "not-a-date", "2099-02-29", "2099-1-01", "20990101", "2020-W01-1", "0000-01-01",
])
def test_invalid_dates_return_error(journal_client, value):
    client, connection = journal_client
    response = client.post("/api/journals", json={"date": value})
    assert response.status_code == 400
    assert response.json() == {"detail": "That planner date is invalid."}
    assert client.get(f"/api/journals/{value}").status_code == 400
    assert connection.commits == 0


@pytest.mark.parametrize(
    ("input_date", "expected_date"),
    [("2099-01-01", "2099-01-01"), ("0099-01-01", "0099-01-01")],
)
def test_calendar_dates_round_trip(journal_client, input_date, expected_date):
    client, _connection = journal_client
    response = client.post("/api/journals", json={"date": input_date, "content": "entry"})
    assert response.status_code == 201
    assert response.json() == {"date": expected_date, "content": "entry"}
    assert client.get(f"/api/journals/{input_date}").json() == response.json()
    assert client.put(f"/api/journals/{input_date}", json={"content": "updated"}).json() == {
        "date": expected_date, "content": "updated",
    }


def test_bad_request_and_database_errors(journal_client):
    client, connection = journal_client
    response = client.put("/api/journals/2099-01-01", json={"content": 42})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "content"]
    response = client.post("/api/journals", json={"date": "2099-01-01", "content": None})
    assert response.status_code == 422
    response = client.post("/api/journals", json={})
    assert response.status_code == 422

    def fail(_query, _params=()):
        raise psycopg.OperationalError("database failed")

    connection.execute = fail
    response = client.post("/api/journals", json={"date": "2099-01-01"})
    assert response.status_code == 500
    assert response.text == "Internal Server Error"
