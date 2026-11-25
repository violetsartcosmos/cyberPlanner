"""Experiment with Node's point ledger and rewards using the same tables.

This mirrors parts of server/points/service.ts and server/points/actions.ts.
The original Node code still serves the app; these /api/v1 routes are separate.
"""

import time
from datetime import date, datetime, timezone
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_connection

router = APIRouter(prefix="/api/v1", tags=["points"])

# Mirrors shared/planner/definitions.ts for now. Because this is a copy,
# changes to Node's reward list must also be made here until it is shared.
REWARDS = {
    "snacks": ("Snacks", 50),
    "game-time": ("Game time", 100),
    "tv-time": ("TV time", 80),
    "scroll-time": ("Scroll time", 50),
    "small-treat": ("Buy something small", 300),
    "takeout": ("Order pizza or food", 400),
    "paint": ("Paint", 150),
    "self-care": ("Self-care", 150),
    "movie-night": ("Movie night", 200),
    "planner-supplies": ("Planner supplies", 250),
    "day-trip": ("Day trip", 800),
    "stickers": ("Stickers", 100),
}


def _iso_timestamp(value: datetime) -> str:
    """Format a database timestamp as a UTC string with milliseconds.

    value is a datetime from a ledger row; the return value looks like
    "2026-11-23T12:00:00.000Z". This matches the timestamp formatting used by
    getPointsSummary in server/points/service.ts. The leading underscore marks
    it as a helper for this module.
    """
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@router.get("/points")
def get_points(
    selected_date: date = Query(alias="date"),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    """Handle GET /api/v1/points?date=YYYY-MM-DD.

    selected_date comes from the date query parameter; FastAPI supplies the
    connection. Read the point_ledger to calculate the overall balance, points
    earned on that date, all earned task keys, and the ten newest redemptions.
    The return dictionary exposes those values as balance, todayPoints,
    earnedTaskKeys, and redemptions. Redeemed amounts are returned as positive
    numbers even though spending is recorded as a negative ledger entry.

    This parallels getPointsSummary in server/points/service.ts. Unlike Node,
    this route does not filter to visible task keys or read all four results
    in a repeatable-read snapshot.
    """
    # The ledger is the source of truth: earnings are positive, spends negative.
    # Unlike Node's summary, these reads do not yet use a repeatable-read snapshot
    # or filter earned keys to the currently visible tasks.
    balance_row = connection.execute(
        "SELECT COALESCE(SUM(amount), 0) AS balance FROM point_ledger"
    ).fetchone()
    today_row = connection.execute(
        """
        SELECT COALESCE(SUM(amount), 0) AS points
        FROM point_ledger
        WHERE entry_type = 'earn' AND task_date = %s
        """,
        (selected_date,),
    ).fetchone()
    earned_rows = connection.execute(
        "SELECT task_key FROM point_ledger WHERE entry_type = 'earn'"
    ).fetchall()
    redemption_rows = connection.execute(
        """
        SELECT reward_id, reward_name, amount, created_at
        FROM point_ledger
        WHERE entry_type = 'spend'
        ORDER BY created_at DESC
        LIMIT 10
        """
    ).fetchall()

    return {
        "balance": balance_row["balance"],
        "todayPoints": today_row["points"],
        "earnedTaskKeys": [row["task_key"] for row in earned_rows],
        "redemptions": [
            {
                "rewardId": row["reward_id"],
                "rewardName": row["reward_name"],
                "amount": -row["amount"],
                "createdAt": _iso_timestamp(row["created_at"]),
            }
            for row in redemption_rows
        ],
    }


def _redeem_reward(
    connection: psycopg.Connection,
    reward_id: str,
    reward_name: str,
    cost: int,
) -> tuple[int, bool]:
    """Try to redeem one already-validated reward from the points ledger.

    connection is the database connection; reward_id and reward_name identify
    the reward; cost is the positive number of points it requires. Read the
    balance and insert a negative spend entry only if funds are sufficient.
    Return (balance, True) after spending or (current_balance, False) when
    there are not enough points.

    This parallels redeemReward in server/points/service.ts. Each attempt is
    a serializable transaction; serialization failures are retried up to five
    times after the first attempt, then propagated if they still occur.
    """
    # Serializable isolation makes concurrent read-then-spend operations safe.
    # PostgreSQL may abort one conflicting transaction; retry it from the start.
    for attempt in range(6):
        try:
            with connection.transaction():
                connection.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
                row = connection.execute(
                    "SELECT COALESCE(SUM(amount), 0) AS balance FROM point_ledger"
                ).fetchone()
                balance = row["balance"]
                if balance < cost:
                    return balance, False

                connection.execute(
                    """
                    INSERT INTO point_ledger (amount, entry_type, reward_id, reward_name)
                    VALUES (%s, 'spend', %s, %s)
                    """,
                    (-cost, reward_id, reward_name),
                )
                return balance - cost, True
        except psycopg.errors.SerializationFailure:
            if attempt == 5:
                raise
            time.sleep(0.01 * (2**attempt))

    raise RuntimeError("Reward redemption retry loop ended unexpectedly.")


@router.post("/rewards/{reward_id}/redeem")
def redeem_reward(
    reward_id: str,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    """Handle POST /api/v1/rewards/{reward_id}/redeem.

    reward_id comes from the URL; FastAPI supplies the database connection.
    Look up the reward name and cost on the server rather than accepting a
    price from the request. An unknown ID returns HTTP 404. Otherwise,
    _redeem_reward attempts the purchase and this function returns an ok flag
    with either a confirmation message or an insufficient-points error.

    This parallels the redeem_reward action in server/points/actions.ts, but
    uses a separate Python URL instead of Node's /api/planner form action.
    """
    reward = REWARDS.get(reward_id)
    if reward is None:
        raise HTTPException(status_code=404, detail="That reward is not available.")

    reward_name, cost = reward
    balance, redeemed = _redeem_reward(connection, reward_id, reward_name, cost)
    if not redeemed:
        return {
            "ok": False,
            "error": f"You need {cost - balance} more points for {reward_name}.",
        }
    return {"ok": True, "message": f"{reward_name} redeemed for {cost} points."}
