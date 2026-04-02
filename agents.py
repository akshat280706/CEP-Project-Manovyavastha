"""
agents.py
---------
Pure decision functions for the Cognitive-Aware Task Scheduler.
No reward logic. No DB calls. No side effects.
All Q-table I/O goes through the interface defined in interface.py.
"""

import random
import math
from datetime import datetime, timedelta
from interface import qtable_reader


# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────

ACTION_SPACES = {
    "qtable_duration":       ["0.7x", "0.85x", "1.0x", "1.2x", "1.5x"],
    "qtable_time":           ["block_0", "block_1", "block_2", "block_3", "block_4", "block_5"],
    "qtable_break":          ["no_break", "5min", "15min", "30min"],
    "qtable_context_switch": ["switch_now", "delay_switch", "cluster_with_similar"],
}

COLD_START_THRESHOLD = 3

# Per-agent sigma decay tables
# Keys: (visit_count_lower, visit_count_upper) inclusive
# Values: sigma for that agent
SIGMA_DECAY = {
    "duration": {
        (0,  3):   2.0,
        (4,  10):  1.2,
        (11, 20):  0.7,
        (21, 999): 0.3,
    },
    "time": {
        (0,  3):   2.5,   # time needs more exploration — more blocks to discover
        (4,  10):  1.5,
        (11, 20):  0.8,
        (21, 999): 0.4,
    },
    "break": {
        (0,  3):   1.5,   # break space is small (4 actions), less exploration needed
        (4,  10):  1.0,
        (11, 20):  0.5,
        (21, 999): 0.2,
    },
}

# Max multiplier per difficulty for worst-case duration estimation
MAX_MULTIPLIER = {0: 1.2, 1: 1.35, 2: 1.5}

# Cold start heuristics
TIME_HEURISTIC = {
    "theory":           "block_2",
    "coding":           "block_2",
    "revision":         "block_4",
    "problem_solving":  "block_2",
    "reading":          "block_1",
}

TASK_TYPES = ["theory", "coding", "revision", "problem_solving", "reading"]


# ─────────────────────────────────────────────
# GAUSSIAN SELECTION CORE
# ─────────────────────────────────────────────

def _get_sigma_for_agent(agent_name: str, visit_count: int) -> float:
    """Look up sigma from the agent's decay table given a visit count."""
    table = SIGMA_DECAY[agent_name]
    for (lo, hi), sigma in table.items():
        if lo <= visit_count <= hi:
            return sigma
    return 0.3  # fallback: fully decayed


def gaussian_weights(n_actions: int, best_pos: int, sigma: float) -> list[float]:
    """
    Compute unnormalised Gaussian weights centered on best_pos.
    Each position's weight = exp(-0.5 * ((i - best_pos) / sigma)^2)
    """
    weights = [
        math.exp(-0.5 * ((i - best_pos) / sigma) ** 2)
        for i in range(n_actions)
    ]
    total = sum(weights)
    return [w / total for w in weights]


def gaussian_select(q_rows: list[dict], agent_name: str) -> str:
    """
    Select an action using Gaussian-weighted sampling centered on argmax(Q).
    Sigma is taken as max sigma across all rows — prevents cold neighbor starvation.
    Falls back to uniform if all Q-values are equal (pure cold start).
    """
    actions   = [row["action"]      for row in q_rows]
    q_values  = [row["q_value"]     for row in q_rows]
    visits    = [row["visit_count"] for row in q_rows]

    best_pos  = q_values.index(max(q_values))

    # use max visit_count across rows to derive sigma — avoids collapsing on best action's sigma
    max_visits = max(visits)
    sigma = _get_sigma_for_agent(agent_name, max_visits)

    weights = gaussian_weights(len(actions), best_pos, sigma)
    selected = random.choices(actions, weights=weights, k=1)[0]
    return selected


def _is_cold_start(q_rows: list[dict]) -> bool:
    return all(row["visit_count"] < COLD_START_THRESHOLD for row in q_rows)


# ─────────────────────────────────────────────
# AGENT 1 — DurationAllocationAgent
# ─────────────────────────────────────────────

def duration_agent(
    user_id: str,
    task_type: str,
    difficulty: int,
    deadline_pressure: int,
    base_duration_min: int,
    efficiency_profile: dict,      # {"theory": {"multiplier": 1.0, "visit_count": 2}, ...}
) -> dict:
    """
    Decides duration multiplier for this task.

    Returns:
        {
            "action": "1.2x",
            "scheduled_duration_min": int,
            "cold_start": bool
        }
    """
    state = {
        "task_type":        task_type,
        "difficulty":       difficulty,
        "deadline_pressure": deadline_pressure,
    }

    q_rows = qtable_reader("qtable_duration", user_id, state)

    if _is_cold_start(q_rows):
        # try efficiency profile first
        profile = efficiency_profile.get(task_type, {})
        if profile.get("visit_count", 0) >= COLD_START_THRESHOLD:
            multiplier = profile["multiplier"]
        else:
            multiplier = 1.0
        cold_start = True
    else:
        action     = gaussian_select(q_rows, "duration")
        multiplier = float(action.replace("x", ""))
        cold_start = False

    action = f"{multiplier}x"
    scheduled_duration_min = round(base_duration_min * multiplier)

    return {
        "action":                 action,
        "scheduled_duration_min": scheduled_duration_min,
        "cold_start":             cold_start,
    }


# ─────────────────────────────────────────────
# TIME PREFERENCE SCORE (passive signal for selector)
# ─────────────────────────────────────────────

# maps hour of day → block index
def _hour_to_block(hour: int) -> int:
    if hour < 7:  return 0
    if hour < 9:  return 1
    if hour < 11: return 2
    if hour < 13: return 3
    if hour < 17: return 4
    return 5


def time_preference_score(
    task: dict,
    user_id: str,
    virtual_now: datetime,
) -> float:
    """
    Passive selector signal — reads qtable_time and returns a soft score
    reflecting how well the current hour block matches this user's learned
    time preference for this task type.

    Returns a value in [-0.5, +0.5]. Low weight by design — nudges ordering
    without overriding deadline or prerequisite sequence.

    Cold start → 0.0 (no signal until agent has seen enough data).
    """
    current_block = _hour_to_block(virtual_now.hour)
    state = {
        "hour_block": current_block,
        "task_type":  task["task_type"],
    }

    q_rows = qtable_reader("qtable_time", user_id, state)

    if _is_cold_start(q_rows):
        return 0.0

    # best learned block for this task type at this hour
    best_action = max(q_rows, key=lambda r: r["q_value"])
    best_block  = int(best_action["action"].replace("block_", ""))

    # reward if current hour is already in the preferred block, penalize otherwise
    # scaled so max influence is ±0.5
    if best_block == current_block:
        return +0.5
    distance = abs(best_block - current_block)
    return max(-0.5, -0.1 * distance)


# ─────────────────────────────────────────────
# AGENT 3 — BreakSchedulingAgent
# ─────────────────────────────────────────────

def _break_heuristic(
    fatigue_level: int,
    consecutive_minutes: int,
    prev_task_difficulty: int,
    next_task_difficulty: int,
) -> str:
    """
    Cold start heuristic for break agent.
    Considers fatigue, consecutive time, and task difficulty context.
    """
    if consecutive_minutes >= 90:
        return "15min"
    if consecutive_minutes >= 60 and fatigue_level >= 1:
        return "15min"
    if prev_task_difficulty == 2 and next_task_difficulty == 2:
        return "15min"
    if prev_task_difficulty == 2 or fatigue_level == 2:
        return "5min"
    return "no_break"


def break_agent(
    user_id: str,
    fatigue_level: int,               # 0/1/2
    consecutive_minutes: int,         # raw minutes, bucketed internally
    prev_task_type: str,
    next_task_type: str,
    prev_task_difficulty: int,        # 0/1/2
    next_task_difficulty: int,        # 0/1/2
    section_budget_min: int,          # max break allowed given section ceiling
    scheduled_duration_min: int,      # already decided by DurationAgent
) -> dict:
    """
    Decides break duration before the next task.
    Filters actions to those that fit within remaining section budget.

    Returns:
        {
            "action": "15min",
            "break_duration_min": int,
            "cold_start": bool
        }
    """
    # bucket consecutive minutes
    if consecutive_minutes < 30:
        consecutive_bucket = 0
    elif consecutive_minutes < 60:
        consecutive_bucket = 1
    else:
        consecutive_bucket = 2

    state = {
        "fatigue_level":             fatigue_level,
        "consecutive_minutes_bucket": consecutive_bucket,
        "prev_task_type":            prev_task_type,
        "next_task_type":            next_task_type,
        "next_task_difficulty":      next_task_difficulty,
    }

    q_rows = qtable_reader("qtable_break", user_id, state)

    # compute remaining budget for break
    remaining_budget = section_budget_min - scheduled_duration_min

    # filter to actions that fit within budget
    def action_minutes(action: str) -> int:
        return 0 if action == "no_break" else int(action.replace("min", ""))

    valid_rows = [
        row for row in q_rows
        if action_minutes(row["action"]) <= remaining_budget
    ]

    # if budget is too tight for any break, force no_break
    if not valid_rows:
        return {
            "action":            "no_break",
            "break_duration_min": 0,
            "cold_start":        False,
        }

    if _is_cold_start(valid_rows):
        action     = _break_heuristic(
            fatigue_level, consecutive_minutes,
            prev_task_difficulty, next_task_difficulty
        )
        # ensure heuristic result also respects budget
        if action_minutes(action) > remaining_budget:
            action = "no_break"
        cold_start = True
    else:
        action     = gaussian_select(valid_rows, "break")
        cold_start = False

    break_duration_min = action_minutes(action)

    return {
        "action":            action,
        "break_duration_min": break_duration_min,
        "cold_start":        cold_start,
    }


# ─────────────────────────────────────────────
# SELECTOR
# ─────────────────────────────────────────────

def _estimated_duration_hours(task: dict) -> float:
    """Worst-case estimate used for slack computation."""
    multiplier = MAX_MULTIPLIER[task["difficulty"]]
    return (task["base_duration_min"] * multiplier) / 60


def _compute_slack(task: dict, virtual_now: datetime) -> float:
    """Hours between virtual_now and deadline minus worst-case task duration."""
    deadline = task["deadline"]
    hours_to_deadline = (deadline - virtual_now).total_seconds() / 3600
    return hours_to_deadline - _estimated_duration_hours(task)


def _is_breach_imminent(task: dict, virtual_now: datetime) -> bool:
    """True if even starting this task right now would breach its deadline."""
    return _compute_slack(task, virtual_now) < 0


def _context_switch_score(
    task: dict,
    prev_task_type: str | None,
    user_id: str,
) -> float:
    if prev_task_type is None:
        return 0.0
    if task["task_type"] == prev_task_type:
        return +0.5

    q_rows = qtable_reader("qtable_context_switch", user_id, {
        "prev_task_type": prev_task_type,
        "next_task_type": task["task_type"],
    })

    if _is_cold_start(q_rows):
        return 0.0

    cluster_q_values = [
        row["q_value"] for row in q_rows
        if row["action"] == "cluster_with_similar"
    ]
    if not cluster_q_values:
        return 0.0

    cluster_q = max(cluster_q_values)
    return -max(cluster_q, 0)  # only penalize if Q is positive


def _cognitive_fit_score(task: dict, user_state: dict) -> float:
    table = {
        (0, 0): +0.5, (0, 1):  0.0, (0, 2): +0.5,
        (1, 0): +0.5, (1, 1):  0.0, (1, 2): -0.5,
        (2, 0): +0.5, (2, 1): -0.5, (2, 2): -2.0,
    }
    return table[(user_state["fatigue_level"], task["difficulty"])]


def _retry_score(task: dict) -> float:
    if task["source"] == "failed":
        return 1.0 + 0.5 * task.get("attempt_count", 1)
    if task["source"] == "pending":
        return 0.5
    return 0.0


def score_task(
    task: dict,
    prev_task_type: str | None,
    user_state: dict,
    user_id: str,
    virtual_now: datetime,
) -> float:
    slack            = _compute_slack(task, virtual_now)
    deadline_score   = 1 / max(slack, 0.25)
    cognitive_score  = _cognitive_fit_score(task, user_state)
    retry_score      = _retry_score(task)
    starvation_score = task.get("priority_boost", 0) * 0.3
    context_score    = _context_switch_score(task, prev_task_type, user_id)
    time_score       = time_preference_score(task, user_id, virtual_now)

    return (
        deadline_score   * 3.0 +
        cognitive_score  * 1.0 +
        retry_score      * 1.5 +
        starvation_score * 1.0 +
        context_score    * 1.0 +
        time_score       * 0.5   # low weight — nudge only, never overrides prerequisites
    )


def run_selector(
    pool: list[dict],
    user_state: dict,
    user_id: str,
    now: datetime,
) -> tuple[list[dict], list[dict]]:
    """
    Selects and orders all tasks from pool into a schedule sequence.

    Returns:
        (scheduled: list[dict], unschedulable: list[dict])
        unschedulable = tasks that would breach deadline no matter when scheduled
    """
    remaining     = [dict(t) for t in pool]  # shallow copy — don't mutate caller's pool
    scheduled     = []
    unschedulable = []
    prev_task_type = None
    virtual_now    = now

    while remaining:

        # HARD CHECK — remove imminently breaching tasks
        still_feasible = []
        for t in remaining:
            if _is_breach_imminent(t, virtual_now):
                unschedulable.append(t)
            else:
                still_feasible.append(t)
        remaining = still_feasible

        if not remaining:
            break

        # HARD OVERRIDE — starvation cap (priority_boost >= 5, pick earliest deadline)
        starved = [t for t in remaining if t.get("priority_boost", 0) >= 5]
        if starved:
            selected = min(starved, key=lambda t: t["deadline"])

        else:
            # filter out F2-failed tasks if user is still fatigued
            candidates = [
                t for t in remaining
                if not (
                    t.get("last_failed_reason") == "F2"
                    and user_state["fatigue_level"] >= 1
                )
            ]
            if not candidates:
                candidates = remaining  # all are F2-failed, schedule anyway

            # score and select — tiebreak on earliest deadline
            selected = min(
                candidates,
                key=lambda t: (
                    -score_task(t, prev_task_type, user_state, user_id, virtual_now),
                    t["deadline"],
                )
            )

        # increment priority_boost for all tasks not selected this round
        for t in remaining:
            if t["task_id"] != selected["task_id"]:
                t["priority_boost"] = t.get("priority_boost", 0) + 1

        scheduled.append(selected)
        remaining.remove(selected)

        prev_task_type = selected["task_type"]
        # advance virtual clock by worst-case duration for next iteration's slack computation
        virtual_now += timedelta(hours=_estimated_duration_hours(selected))

    return scheduled, unschedulable