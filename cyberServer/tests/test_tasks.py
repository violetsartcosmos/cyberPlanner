from datetime import date

from app.tasks import parse_id, weekday_name


def test_weekday_names_match_dates():
    assert [weekday_name(date(2026, 11, day)) for day in range(23, 30)] == [
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
    ]


def test_positive_integer_task_ids_are_parsed():
    assert parse_id("42") == 42
    assert parse_id("2147483647") == 2147483647


def test_invalid_task_ids_are_rejected():
    for task_id in ("0", "02", "-1", "morning-2", "2147483648", "１", "9" * 10000):
        assert parse_id(task_id) is None
