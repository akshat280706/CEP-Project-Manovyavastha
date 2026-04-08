"""
orchestrator.py
---------------
Single entry point for schedule generation.
Now includes day-level allocation before scheduling.

Pipeline:
    day_allocator → selector → duration_agent → break_agent → section construction
"""

from datetime import datetime, timedelta
from collections import defaultdict
from agents import run_selector, duration_agent, break_agent


# ─────────────────────────────────────────────
# SECTION BUDGET
# ─────────────────────────────────────────────

SECTION_CEILING = {
    0: {"multiplier": 1.2, "break_budget": 10},
    1: {"multiplier": 1.35, "break_budget": 15},
    2: {"multiplier": 1.5,  "break_budget": 30},
}


# ─────────────────────────────────────────────
# DAY ALLOCATOR (NEW)
# ─────────────────────────────────────────────

def day_allocator(tasks: list[dict], now: datetime, hours_per_day: int):
    capacity_per_day = hours_per_day * 60  # minutes

    tasks_sorted = sorted(
        tasks,
        key=lambda t: (t["deadline"], -t.get("priority_boost", 0))
    )

    day_map = defaultdict(list)
    day_load = defaultdict(int)
    unschedulable = []

    for task in tasks_sorted:
        duration = task["base_duration_min"]

        current_day = now.date()
        last_day = task["deadline"].date()

        placed = False

        while current_day <= last_day:
            if day_load[current_day] + duration <= capacity_per_day:
                day_map[current_day].append(task)
                day_load[current_day] += duration
                placed = True
                break
            current_day += timedelta(days=1)

        if not placed:
            unschedulable.append(task)

    return dict(day_map), unschedulable


# ─────────────────────────────────────────────
# DEADLINE PRESSURE
# ─────────────────────────────────────────────

def _deadline_pressure(deadline: datetime, now: datetime) -> int:
    hours = (deadline - now).total_seconds() / 3600
    if hours >= 72:  return 0
    if hours >= 24:  return 1
    return 2


# ─────────────────────────────────────────────
# FATIGUE BUCKET
# ─────────────────────────────────────────────

def _fatigue_bucket(raw: int) -> int:
    if raw <= 3: return 0
    if raw <= 6: return 1
    return 2


# ─────────────────────────────────────────────
# SESSION POSITION
# ─────────────────────────────────────────────

def _session_position(index: int, total: int) -> int:
    ratio = index / max(total, 1)
    if ratio < 0.3:  return 0
    if ratio < 0.7:  return 1
    return 2


# ─────────────────────────────────────────────
# SECTION CONSTRUCTION (UNCHANGED)
# ─────────────────────────────────────────────

def _build_sections(ordered_tasks, user_id, user_state, now):
    sections = []
    cursor = now
    consecutive_min = 0
    prev_task = None

    for i, task in enumerate(ordered_tasks):
        difficulty = task["difficulty"]
        ceiling = SECTION_CEILING[difficulty]

        section_budget = round(
            task["base_duration_min"] * ceiling["multiplier"]
            + ceiling["break_budget"]
        )

        deadline_pressure = _deadline_pressure(task["deadline"], cursor)

        dur = duration_agent(
            user_id=user_id,
            task_type=task["task_type"],
            difficulty=difficulty,
            deadline_pressure=deadline_pressure,
            base_duration_min=task["base_duration_min"],
            efficiency_profile={},
        )

        scheduled_duration_min = dur["scheduled_duration_min"]

        if prev_task is None:
            brk = {"action": "no_break", "break_duration_min": 0, "cold_start": True}
        else:
            brk = break_agent(
                user_id=user_id,
                fatigue_level=_fatigue_bucket(user_state["fatigue_raw"]),
                consecutive_minutes=consecutive_min,
                prev_task_type=prev_task["task_type"],
                next_task_type=task["task_type"],
                prev_task_difficulty=prev_task["difficulty"],
                next_task_difficulty=difficulty,
                section_budget_min=section_budget,
                scheduled_duration_min=scheduled_duration_min,
            )

        break_duration_min = brk["break_duration_min"]

        task_start = cursor + timedelta(minutes=break_duration_min)
        task_end = task_start + timedelta(minutes=scheduled_duration_min)

        duration_state = {
            "task_type": task["task_type"],
            "difficulty": difficulty,
            "deadline_pressure": deadline_pressure,
        }

        fatigue_bucket = _fatigue_bucket(user_state["fatigue_raw"])
        consecutive_bucket = (
            0 if consecutive_min < 30 else
            1 if consecutive_min < 60 else 2
        )

        break_state = {
            "fatigue_level": fatigue_bucket,
            "consecutive_minutes_bucket": consecutive_bucket,
            "prev_task_type": prev_task["task_type"] if prev_task else "none",
            "next_task_type": task["task_type"],
            "next_task_difficulty": difficulty,
        }

        context_switch_state = {
            "prev_task_type": prev_task["task_type"] if prev_task else "none",
            "next_task_type": task["task_type"],
            "session_position": _session_position(i, len(ordered_tasks)),
        }

        time_state = {
            "hour_block": (
                0 if task_start.hour < 7 else
                1 if task_start.hour < 9 else
                2 if task_start.hour < 11 else
                3 if task_start.hour < 13 else
                4 if task_start.hour < 17 else 5
            ),
            "task_type": task["task_type"],
        }

        sections.append({
            "task_id": task["task_id"],
            "task_type": task["task_type"],
            "difficulty": difficulty,
            "break_duration_min": break_duration_min,
            "scheduled_duration_min": scheduled_duration_min,
            "start_time": task_start.isoformat(),
            "end_time": task_end.isoformat(),
            "duration_action": dur["action"],
            "break_action": brk["action"],
            "context_switch_action": "switch_now",
            "time_action": f"block_{time_state['hour_block']}",
            "duration_state": duration_state,
            "break_state": break_state,
            "context_switch_state": context_switch_state,
            "time_state": time_state,
            "cold_start_duration": dur["cold_start"],
            "cold_start_break": brk["cold_start"],
            "source": task.get("source", "new"),
        })

        cursor = task_end
        prev_task = task

        if break_duration_min > 0:
            consecutive_min = scheduled_duration_min
        else:
            consecutive_min += scheduled_duration_min

    return sections


# ─────────────────────────────────────────────
# FEASIBILITY CHECK (UNCHANGED)
# ─────────────────────────────────────────────

def _check_feasibility(tasks, now):
    from agents import MAX_MULTIPLIER
    infeasible = []
    for t in tasks:
        worst_min = t["base_duration_min"] * MAX_MULTIPLIER[t["difficulty"]]
        hours_left = (t["deadline"] - now).total_seconds() / 3600
        if worst_min / 60 > hours_left:
            infeasible.append(t)
    return infeasible


# ─────────────────────────────────────────────
# INTERNAL RUNNER (UPDATED)
# ─────────────────────────────────────────────

def _run(user_id, pool, user_state, now):
    infeasible = _check_feasibility(pool, now)
    infeasible_ids = {t["task_id"] for t in infeasible}
    schedulable_pool = [t for t in pool if t["task_id"] not in infeasible_ids]

    if not schedulable_pool:
        return {
            "sections": [],
            "unschedulable": [],
            "infeasible": infeasible,
        }

    # ── NEW: DAY ALLOCATION ───────────────────
    day_map, allocator_unsched = day_allocator(
        tasks=schedulable_pool,
        now=now,
        hours_per_day=user_state.get("hours_per_day", 6),
    )

    all_sections = []
    all_unschedulable = list(allocator_unsched)

    for day, day_tasks in sorted(day_map.items()):
        day_start = datetime.combine(day, now.time())

        ordered_tasks, day_unsched = run_selector(
            pool=day_tasks,
            user_state={"fatigue_level": _fatigue_bucket(user_state["fatigue_raw"])},
            user_id=user_id,
            now=day_start,
        )

        all_unschedulable.extend(day_unsched)

        if not ordered_tasks:
            continue

        sections = _build_sections(
            ordered_tasks=ordered_tasks,
            user_id=user_id,
            user_state=user_state,
            now=day_start,
        )

        all_sections.extend(sections)

    return {
        "sections": all_sections,
        "unschedulable": all_unschedulable,
        "infeasible": infeasible,
    }


# ─────────────────────────────────────────────
# PUBLIC API (UNCHANGED)
# ─────────────────────────────────────────────

def generate_schedule(user_id, tasks, user_state, now):
    return _run(user_id, tasks, user_state, now)


def regenerate_schedule(user_id, pending_tasks, failed_tasks, user_state, now):
    for t in pending_tasks:
        t["source"] = "pending"
    for t in failed_tasks:
        t["source"] = "failed"

    pool = pending_tasks + failed_tasks
    return _run(user_id, pool, user_state, now)