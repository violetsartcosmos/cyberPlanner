import os
from datetime import date

import psycopg
from fastapi.testclient import TestClient

from app.main import app
from app.tasks import weekday_name


def test_numeric_tasks_share_checks_and_awards_with_node():
    """Run only against a disposable database with the Prisma migrations applied."""
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise RuntimeError("TEST_DATABASE_URL must point to a disposable migrated database.")

    selected_date = date(2098, 1, 6)
    with psycopg.connect(url) as connection:
        existing = connection.execute(
            "SELECT 1 FROM routine_task_completions WHERE day = %s", (selected_date,)
        ).fetchone()
        if existing:
            raise RuntimeError("The disposable test date already contains planner data.")
        routine = connection.execute(
            "SELECT id, points FROM routine_tasks WHERE list = 'morning' ORDER BY id LIMIT 1"
        ).fetchone()
        other_day = connection.execute(
            """
            SELECT t.id FROM routine_tasks t
            JOIN routine_task_groups tg ON tg.task_id = t.id
            JOIN routine_groups g ON g.id = tg.group_id
            WHERE t.list = 'daily' AND g.weekday <> %s
              AND NOT EXISTS (
                SELECT 1 FROM routine_task_groups other
                JOIN routine_groups matching ON matching.id = other.group_id
                WHERE other.task_id = t.id AND matching.weekday = %s
              )
            LIMIT 1
            """,
            (weekday_name(selected_date), weekday_name(selected_date)),
        ).fetchone()
        matching_day = connection.execute(
            """
            SELECT t.id, t.points FROM routine_tasks t
            JOIN routine_task_groups tg ON tg.task_id = t.id
            JOIN routine_groups g ON g.id = tg.group_id
            WHERE t.list = 'daily' AND g.weekday = %s LIMIT 1
            """,
            (weekday_name(selected_date),),
        ).fetchone()
    assert routine is not None and other_day is not None and matching_day is not None
    task_id, points = routine

    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    try:
        with TestClient(app) as client:
            body = {"date": selected_date.isoformat(), "completed": True}
            response = client.put(f"/api/v1/tasks/{task_id}", json=body)
            assert response.status_code == 200
            assert response.json()["awardedPoints"] == points
            assert client.put(f"/api/v1/tasks/{task_id}", json=body).json()["awardedPoints"] == 0
            body["completed"] = False
            assert client.put(f"/api/v1/tasks/{task_id}", json=body).status_code == 200
            body["completed"] = True
            assert client.put(f"/api/v1/tasks/{task_id}", json=body).json()["awardedPoints"] == 0
            assert client.put(f"/api/v1/tasks/{other_day[0]}", json=body).status_code == 404
            assert client.put(f"/api/v1/tasks/{matching_day[0]}", json=body).json()["awardedPoints"] == matching_day[1]
            tasks = client.get(f"/api/v1/tasks?date={selected_date}").json()["tasks"]
            assert next(item for item in tasks if item["id"] == task_id)["completed"] is True
            assert next(item for item in tasks if item["id"] == matching_day[0])["completed"] is True
            assert not any(item["id"] == other_day[0] for item in tasks)
    finally:
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url

    with psycopg.connect(url) as connection:
        checks = connection.execute(
            """
            SELECT task_id FROM routine_task_completions WHERE day = %s
            """,
            (selected_date,),
        ).fetchall()
        award = connection.execute(
            "SELECT amount FROM point_ledger WHERE task_key = %s",
            (f"builtin:{selected_date}:{task_id}",),
        ).fetchall()
    assert (task_id,) in checks
    assert award == [(points,)]
