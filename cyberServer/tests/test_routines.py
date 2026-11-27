from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_connection
from app.routines import router as routines_router


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class RoutineConnection:
    def __init__(self):
        self.routines = [
            {"id": 8, "list": "night", "weekday": "sunday", "title": "Wind down", "kind": "main", "points": 50},
            {"id": 6, "list": "daily", "weekday": "monday", "title": "Plan week", "kind": "side", "points": 10},
            {"id": 4, "list": "daily", "weekday": "friday", "title": "Review", "kind": "side", "points": 10},
            {"id": 2, "list": "daily", "weekday": None, "title": "Hydrate", "kind": "side", "points": 10},
        ]
        self.groups = [
            {"id": 3, "weekday": "wednesday", "title": "Midweek", "message": "Keep going"},
            {"id": 1, "weekday": "monday", "title": "Start", "message": "Begin"},
        ]
        self.queries = []
        self.commits = 0

    def execute(self, query, params=()):
        self.queries.append((query, params))
        if query.lstrip().startswith("SELECT routine.id, routine.list"):
            return FakeCursor(self.routines)
        if query.startswith("SELECT id, weekday, title, message"):
            return FakeCursor(self.groups)
        if query.startswith("UPDATE routine_tasks"):
            kind, points, routine_id = params
            if routine_id == 42:
                return FakeCursor([{"id": routine_id, "kind": kind}])
            return FakeCursor([])
        raise AssertionError(f"Unexpected query: {query}")

    def commit(self):
        self.commits += 1


def create_routines_client(connection):
    test_app = FastAPI()
    test_app.include_router(routines_router)
    test_app.dependency_overrides[get_connection] = lambda: connection
    return TestClient(test_app)


def test_list_routines_returns_stable_weekday_and_group_order():
    connection = RoutineConnection()
    with create_routines_client(connection) as client:
        response = client.get("/api/routines")

    assert response.status_code == 200
    assert response.json() == {
        "routines": [
            {"id": 2, "list": "daily", "weekday": None, "title": "Hydrate", "kind": "side", "points": 10},
            {"id": 6, "list": "daily", "weekday": "monday", "title": "Plan week", "kind": "side", "points": 10},
            {"id": 4, "list": "daily", "weekday": "friday", "title": "Review", "kind": "side", "points": 10},
            {"id": 8, "list": "night", "weekday": "sunday", "title": "Wind down", "kind": "main", "points": 50},
        ],
        "routineGroups": [
            {"id": 1, "weekday": "monday", "title": "Start", "message": "Begin"},
            {"id": 3, "weekday": "wednesday", "title": "Midweek", "message": "Keep going"},
        ],
    }


def test_update_routine_kind_assigns_points_and_commits():
    connection = RoutineConnection()
    with create_routines_client(connection) as client:
        response = client.patch("/api/routines/42", json={"kind": "boss"})

    assert response.status_code == 200
    assert response.json() == {"id": 42, "kind": "boss"}
    assert connection.queries[-1][1] == ("boss", 150, 42)
    assert connection.commits == 1
