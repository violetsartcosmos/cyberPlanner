from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app


class UnusedConnection:
    def execute(self, *_args, **_kwargs):
        raise AssertionError("This request should not query the database.")


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class TaskListConnection:
    def execute(self, query, params=()):
        if "FROM routine_tasks" in query:
            assert params == ("monday",)
            return FakeCursor(
                [
                    {
                        "id": 3,
                        "list": "morning",
                        "weekday": None,
                        "title": "Water",
                        "kind": "side",
                        "points": 10,
                    },
                    {
                        "id": 42,
                        "list": "daily",
                        "weekday": "monday",
                        "title": "Take out trash",
                        "kind": "side",
                        "points": 10,
                    },
                ]
            )
        if "SELECT checks FROM planner_days" in query:
            return FakeCursor([{"checks": ["3"]}])
        raise AssertionError(f"Unexpected query: {query}")


def provide_unused_connection():
    yield UnusedConnection()


def provide_task_list_connection():
    yield TaskListConnection()


def test_health_endpoint():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_task_list_uses_api_date_and_returns_completion_state():
    app.dependency_overrides[get_connection] = provide_task_list_connection
    try:
        response = TestClient(app).get("/api/v1/tasks?date=2026-11-23")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "date": "2026-11-23",
        "tasks": [
            {
                "id": 3,
                "list": "morning",
                "title": "Water",
                "kind": "side",
                "points": 10,
                "completed": True,
            },
            {
                "id": 42,
                "list": "daily",
                "title": "Take out trash",
                "kind": "side",
                "points": 10,
                "completed": False,
            },
        ],
    }


def test_invalid_task_id_is_rejected_without_database_access():
    app.dependency_overrides[get_connection] = provide_unused_connection
    try:
        response = TestClient(app).put(
            "/api/v1/tasks/not-a-routine",
            json={"date": "2026-11-23", "completed": True},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {"detail": "That planner task is invalid."}


def test_unknown_reward_is_rejected_without_database_access():
    app.dependency_overrides[get_connection] = provide_unused_connection
    try:
        response = TestClient(app).post("/api/v1/rewards/unknown/redeem")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json() == {"detail": "That reward is not available."}
