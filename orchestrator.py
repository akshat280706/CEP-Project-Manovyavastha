"""
orchestrator.py
---------------
Single entry point for schedule generation.
Wires together: selector → duration_agent → break_agent → section construction.

Two public functions:
    generate_schedule()    — full flow, called after LLM decomposition
    regenerate_schedule()  — skips LLM, uses existing pool directly

Both return identical output shapes so Jehan's endpoint logic is the same for both.
"""

from datetime import datetime, timedelta
from agents import run_selector, duration_agent, break_agent


# ─────────────────────────────────────────────
# SECTION BUDGET
# difficulty → (duration_multiplier_ceiling, break_budget_min)
# section ceiling = base_duration * multiplier_ceiling + break_budget
# agents must fit within this — break_agent filters automatically
# ─────────────────────────────────────────────

SECTION_CEILING = {
    0: {"multiplier": 1.2, "break_budget": 10},   # easy
    1: {"multiplier": 1.35, "break_budget": 15},  # medium
    2: {"multiplier": 1.5,  "break_budget": 30},  # hard
}


# ─────────────────────────────────────────────
# DEADLINE PRESSURE COMPUTATION
# ─────────────────────────────────────────────

def _deadline_pressure(deadline: datetime, now: datetime) -> int:
    hours = (deadline - now).total_seconds() / 3600
    if hours >= 72:  return 0   # 3+ days
    if hours >= 24:  return 1   # 1–3 days
    return 2                    # < 1 day


# ─────────────────────────────────────────────
# FATIGUE BUCKETING
# raw 1–10 scale → 0/1/2
# ─────────────────────────────────────────────

def _fatigue_bucket(raw: int) -> int:
    if raw <= 3: return 0
    if raw <= 6: return 1
    return 2


# ─────────────────────────────────────────────
# SESSION POSITION BUCKETING
# ─────────────────────────────────────────────

def _session_position(index: int, total: int) -> int:
    ratio = index / max(total, 1)
    if ratio < 0.3:  return 0  # early
    if ratio < 0.7:  return 1  # mid
    return 2                   # late


# ─────────────────────────────────────────────
# SECTION CONSTRUCTION
# builds one section per task after selector ordering is decided
# ─────────────────────────────────────────────

def _build_sections(
    ordered_tasks: list[dict],
    user_id: str,
    user_state: dict,
    now: datetime,
) -> list[dict]:
    """
    For each task in selector order:
        1. compute section budget from difficulty
        2. run duration_agent → scheduled_duration_min
        3. run break_agent → break_duration_min
        4. assign start/end times sequentially (no gaps)

    Returns a list of section dicts — one per task.
    """
    sections      = []
    cursor        = now          # rolling clock — no gaps
    consecutive_min = 0          # resets after each break
    prev_task     = None

    for i, task in enumerate(ordered_tasks):
        difficulty  = task["difficulty"]
        ceiling     = SECTION_CEILING[difficulty]
        section_budget = round(
            task["base_duration_min"] * ceiling["multiplier"]
            + ceiling["break_budget"]
        )

        # ── duration agent ──────────────────────────────
        deadline_pressure = _deadline_pressure(task["deadline"], cursor)
        dur = duration_agent(
            user_id         = user_id,
            task_type       = task["task_type"],
            difficulty      = difficulty,
            deadline_pressure = deadline_pressure,
            base_duration_min = task["base_duration_min"],
            efficiency_profile = {},
        )
        scheduled_duration_min = dur["scheduled_duration_min"]

        # ── break agent ──────────────────────────────────
        # first task of the session has no prev — skip break agent entirely
        if prev_task is None:
            brk = {"action": "no_break", "break_duration_min": 0, "cold_start": True}
        else:
            brk = break_agent(
                user_id               = user_id,
                fatigue_level         = _fatigue_bucket(user_state["fatigue_raw"]),
                consecutive_minutes   = consecutive_min,
                prev_task_type        = prev_task["task_type"],
                next_task_type        = task["task_type"],
                prev_task_difficulty  = prev_task["difficulty"],
                next_task_difficulty  = difficulty,
                section_budget_min    = section_budget,
                scheduled_duration_min = scheduled_duration_min,
            )

        break_duration_min = brk["break_duration_min"]

        # ── time placement ───────────────────────────────
        task_start = cursor + timedelta(minutes=break_duration_min)
        task_end   = task_start + timedelta(minutes=scheduled_duration_min)

        # ── states stored for updater.py ─────────────────
        # these are passed back so Jehan can hand them to update() later
        duration_state = {
            "task_type":         task["task_type"],
            "difficulty":        difficulty,
            "deadline_pressure": deadline_pressure,
        }

        fatigue_bucket = _fatigue_bucket(user_state["fatigue_raw"])
        consecutive_bucket = (
            0 if consecutive_min < 30 else
            1 if consecutive_min < 60 else 2
        )
        break_state = {
            "fatigue_level":              fatigue_bucket,
            "consecutive_minutes_bucket": consecutive_bucket,
            "prev_task_type":             prev_task["task_type"] if prev_task else "none",
            "next_task_type":             task["task_type"],
            "next_task_difficulty":       difficulty,
        }
        context_switch_state = {
            "prev_task_type":  prev_task["task_type"] if prev_task else "none",
            "next_task_type":  task["task_type"],
            "session_position": _session_position(i, len(ordered_tasks)),
        }
        time_state = {
            "hour_block": (
                0 if task_start.hour < 7  else
                1 if task_start.hour < 9  else
                2 if task_start.hour < 11 else
                3 if task_start.hour < 13 else
                4 if task_start.hour < 17 else 5
            ),
            "task_type": task["task_type"],
        }

        section = {
            # identity
            "task_id":    task["task_id"],
            "task_type":  task["task_type"],
            "difficulty": difficulty,

            # timing
            "break_duration_min":    break_duration_min,
            "scheduled_duration_min": scheduled_duration_min,
            "start_time":            task_start.isoformat(),
            "end_time":              task_end.isoformat(),

            # agent decisions — needed by updater.py when outcome comes in
            "duration_action":        dur["action"],
            "break_action":           brk["action"],
            "context_switch_action":  "switch_now",   # passive — no active decision made
            "time_action":            f"block_{time_state['hour_block']}",

            # states at decision time — needed by updater.py
            "duration_state":        duration_state,
            "break_state":           break_state,
            "context_switch_state":  context_switch_state,
            "time_state":            time_state,

            # metadata
            "cold_start_duration":   dur["cold_start"],
            "cold_start_break":      brk["cold_start"],
            "source":                task.get("source", "new"),
        }

        sections.append(section)

        # ── advance state for next iteration ────────────
        cursor = task_end
        prev_task = task

        # consecutive minutes resets if a real break was taken
        if break_duration_min > 0:
            consecutive_min = scheduled_duration_min
        else:
            consecutive_min += scheduled_duration_min

    return sections


# ─────────────────────────────────────────────
# FEASIBILITY CHECK
# run before agents to surface infeasible input early
# ─────────────────────────────────────────────

def _check_feasibility(tasks: list[dict], now: datetime) -> list[dict]:
    """
    Returns list of tasks that are already infeasible before scheduling starts.
    A task is infeasible if its worst-case duration alone exceeds time to deadline.
    These are returned to Jehan to surface to the user — never silently dropped.
    """
    from agents import MAX_MULTIPLIER
    infeasible = []
    for t in tasks:
        worst_min = t["base_duration_min"] * MAX_MULTIPLIER[t["difficulty"]]
        hours_left = (t["deadline"] - now).total_seconds() / 3600
        if worst_min / 60 > hours_left:
            infeasible.append(t)
    return infeasible


# ─────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────

def generate_schedule(
    user_id: str,
    tasks: list[dict],           # from LLM decomposition, all source="new"
    user_state: dict,            # {"fatigue_raw": int (1–10)}
    now: datetime,
) -> dict:
    """
    Full schedule generation. Called after LLM decomposes a user goal.

    Input tasks shape (minimum required fields):
        {
            "task_id":          str,
            "task_type":        str,   # theory/coding/revision/problem_solving/reading
            "difficulty":       int,   # 0/1/2
            "base_duration_min": int,
            "deadline":         datetime,
            "source":           str,   # "new"
            "attempt_count":    int,   # 0 for new tasks
            "priority_boost":   int,   # 0 for new tasks
            "last_failed_reason": None,
        }

    Returns:
        {
            "sections":       list[dict],   # ordered schedule, one entry per task
            "unschedulable":  list[dict],   # tasks that can't fit before deadline
            "infeasible":     list[dict],   # tasks infeasible before scheduling even starts
        }
    """
    return _run(user_id, tasks, user_state, now)


def regenerate_schedule(
    user_id: str,
    pending_tasks: list[dict],   # scheduled but not yet attempted
    failed_tasks: list[dict],    # failed or skipped, from task buffer
    user_state: dict,
    now: datetime,
) -> dict:
    """
    Regeneration flow. Skips LLM. Called when user hits Regenerate on calendar page.
    Pulls incomplete + failed tasks, re-runs full pipeline.
    Completed/locked sections are NOT passed in — caller filters them out.

    Returns same shape as generate_schedule().
    """
    # merge pools — pending and failed feed into one unified pool
    for t in pending_tasks:
        t["source"] = "pending"
    for t in failed_tasks:
        t["source"] = "failed"

    pool = pending_tasks + failed_tasks
    return _run(user_id, pool, user_state, now)


# ─────────────────────────────────────────────
# INTERNAL RUNNER
# ─────────────────────────────────────────────

def _run(
    user_id: str,
    pool: list[dict],
    user_state: dict,
    now: datetime,
) -> dict:
    # 1. pre-flight feasibility check
    infeasible = _check_feasibility(pool, now)
    infeasible_ids = {t["task_id"] for t in infeasible}
    schedulable_pool = [t for t in pool if t["task_id"] not in infeasible_ids]

    if not schedulable_pool:
        return {
            "sections":      [],
            "unschedulable": [],
            "infeasible":    infeasible,
        }

    # 2. selector — determines order
    ordered_tasks, unschedulable = run_selector(
        pool       = schedulable_pool,
        user_state = {"fatigue_level": _fatigue_bucket(user_state["fatigue_raw"])},
        user_id    = user_id,
        now        = now,
    )

    if not ordered_tasks:
        return {
            "sections":      [],
            "unschedulable": unschedulable,
            "infeasible":    infeasible,
        }

    # 3. section construction — duration + break per task, sequential placement
    sections = _build_sections(
        ordered_tasks = ordered_tasks,
        user_id       = user_id,
        user_state    = user_state,
        now           = now,
    )

    return {
        "sections":      sections,
        "unschedulable": unschedulable,
        "infeasible":    infeasible,
    }