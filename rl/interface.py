"""
interface.py
------------
Implementation of the Q-table read/write contract.
Connects to MongoDB. Called by agents.py and updater.py.

FIX #5: Use local system time (no timezone)
"""

from pymongo import MongoClient
from datetime import datetime
import os

# ─────────────────────────────────────────────
# ACTION SPACES — must match agents.py exactly
# ─────────────────────────────────────────────

ACTION_SPACES = {
    "qtable_duration":       ["0.7x", "0.85x", "1.0x", "1.2x", "1.5x"],
    "qtable_time":           ["block_0", "block_1", "block_2", "block_3", "block_4", "block_5"],
    "qtable_break":          ["no_break", "5min", "15min", "30min"],
    "qtable_context_switch": ["switch_now", "delay_switch", "cluster_with_similar"],
}

DEFAULT_SIGMA = {
    "qtable_duration":       2.0,
    "qtable_time":           2.5,
    "qtable_break":          1.5,
    "qtable_context_switch": 0.0,
}

# ─────────────────────────────────────────────
# DB CONNECTION — single connection reused
# ─────────────────────────────────────────────

_client = None
_db = None


def _get_db():
    global _client, _db
    if _db is None:
        _client = MongoClient(os.getenv("MONGODB_URI"))
        _db = _client["manovyavastha"]
    return _db


# ─────────────────────────────────────────────
# READER
# ─────────────────────────────────────────────

def qtable_reader(collection: str, user_id: str, state: dict) -> list[dict]:
    """
    Returns all action rows for (user_id, state).
    Never returns empty list — missing actions get zeroed defaults.
    """
    db = _get_db()
    col = db[collection]

    existing = list(col.find(
        {"user_id": user_id, "state": state},
        {"_id": 0, "action": 1, "q_value": 1, "visit_count": 1, "sigma": 1}
    ))

    existing_map = {row["action"]: row for row in existing}

    result = []
    for action in ACTION_SPACES[collection]:
        if action in existing_map:
            result.append(existing_map[action])
        else:
            result.append({
                "action":      action,
                "q_value":     0.0,
                "visit_count": 0,
                "sigma":       DEFAULT_SIGMA[collection]
            })

    return result


# ─────────────────────────────────────────────
# WRITER
# ─────────────────────────────────────────────

def qtable_writer(
    collection:      str,
    user_id:         str,
    state:           dict,
    action:          str,
    new_q:           float,
    new_visit_count: int,
    new_sigma:       float,
) -> None:
    """
    Upserts the row for (user_id, state, action).
    Creates if not exists. Updates if exists.
    """
    db = _get_db()
    col = db[collection]

    # FIX #5: Use local time, not UTC
    col.update_one(
        {
            "user_id": user_id,
            "state":   state,
            "action":  action
        },
        {
            "$set": {
                "q_value":     new_q,
                "visit_count": new_visit_count,
                "sigma":       new_sigma,
                "updated_at":  datetime.now()
            },
            "$setOnInsert": {
                "user_id": user_id,
                "state":   state,
                "action":  action
            }
        },
        upsert=True
    )
