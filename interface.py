"""
interface.py
------------
Contract between RL layer (Aryan) and DB layer (Jehan).
Jehan implements these two functions against MongoDB.
agents.py and updater.py import from here — never from mongo directly.
"""


def qtable_reader(collection: str, user_id: str, state: dict) -> list[dict]:
    """
    Returns all action rows for the given (user_id, state) combination.

    Each row must have:
        {
            "action":       str,
            "q_value":      float,
            "visit_count":  int,
            "sigma":        float   # only required for duration and break agents
        }

    If no rows exist for this state (new user / new state), return zeroed rows
    for all actions in the collection's action space.
    Never return an empty list.
    """
    raise NotImplementedError


def qtable_writer(
    collection: str,
    user_id: str,
    state: dict,
    action: str,
    new_q: float,
    new_visit_count: int,
    new_sigma: float,
) -> None:
    """
    Upserts the row for (user_id, state, action) with the new values.
    """
    raise NotImplementedError