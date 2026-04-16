"""
updater.py
----------
Q-value update layer for the Cognitive-Aware Task Scheduler.
Single entry point: update(...)
No decision logic. No agent sampling. Only reward computation and Bellman updates.
All Q-table I/O goes through interface.py (qtable_reader + qtable_writer).

FIX #5: No timezone changes needed (already using naive datetimes)
"""

from interface import qtable_reader, qtable_writer

# ─────────────────────────────────────────────
# HYPERPARAMETERS
# ─────────────────────────────────────────────

ALPHA = 0.1
GAMMA = 0.9
REWARD_CLIP = (-5.0, 5.0)

# ─────────────────────────────────────────────
# REWARD TABLES
# ─────────────────────────────────────────────

BASE_REWARD = {
    "completed": +2.0,
    "failed": -1.0,
    "skipped": -0.5,
}

# time accuracy bonus — keyed by (ratio_lower, ratio_upper): reward
# ratio = actual_duration / scheduled_duration
TIME_ACCURACY_BONUS = [
    (0.85, 1.15,  +1.5),   # within 15% — excellent
    (0.70, 0.85,  +0.5),   # over-allocated slightly
    (1.15, 1.30,  -0.5),   # ran over up to 30%
    (1.30, 9999., -1.5),   # ran over significantly
    (0.00, 0.70,  -0.5),   # severely over-allocated
]

# fatigue delta bonus — keyed by delta upper bound: reward
FATIGUE_BONUS_TABLE = [
    (1,  +0.5),
    (3,   0.0),
    (5,  -0.5),
    (999, -1.5),
]

FEEDBACK_PENALTY = {
    "F1": -1.0,
    "F2": -1.5,
    "F3": -1.0,
    "F4": -0.5,
    "F5": -1.0,
    "F8": -1.0,
}

# which agents get updated for each feedback code
# primary gets full penalty weight, secondary gets 0.5x
FEEDBACK_ROUTING = {
    "F1": {"primary": "duration",       "secondary": None},
    "F2": {"primary": "break",          "secondary": "time"},
    "F3": {"primary": "time",           "secondary": None},
    "F4": {"primary": "duration",       "secondary": None},
    "F5": {"primary": "break",          "secondary": "context_switch"},
    "F8": {"primary": "context_switch", "secondary": None},
}

# per-agent component weights
# reward = sum(component_value * component_weight_for_this_agent)
AGENT_WEIGHTS = {
    #                base   time  fatigue  feedback
    "duration":     (1.0,  1.0,   0.5,    1.0),
    "time":         (1.0,  0.3,   0.5,    1.0),
    "break":        (1.0,  0.3,   1.5,    1.0),
    "context_switch": (1.0, 0.2,   0.8,    1.0),
}

# sigma decay per agent — same as agents.py, kept here for updater's sigma recalculation
SIGMA_DECAY = {
    "duration": {
        (0,  3):   2.0,
        (4,  10):  1.2,
        (11, 20):  0.7,
        (21, 999): 0.3,
    },
    "time": {
        (0,  3):   2.5,
        (4,  10):  1.5,
        (11, 20):  0.8,
        (21, 999): 0.4,
    },
    "break": {
        (0,  3):   1.5,
        (4,  10):  1.0,
        (11, 20):  0.5,
        (21, 999): 0.2,
    },
    "context_switch": {
        (0,  3):   0.0,   # context switch has no Gaussian — sigma unused
        (4,  10):  0.0,
        (11, 20):  0.0,
        (21, 999): 0.0,
    },
}


# ─────────────────────────────────────────────
# REWARD COMPUTATION
# ─────────────────────────────────────────────

def _base_reward(outcome: str) -> float:
    return BASE_REWARD.get(outcome, 0.0)


def _time_accuracy_bonus(
    outcome: str,
    actual_duration_min: int | None,
    scheduled_duration_min: int,
) -> float:
    # only meaningful for completed tasks with a real actual duration
    if outcome != "completed" or actual_duration_min is None:
        return 0.0
    if scheduled_duration_min == 0:
        return 0.0

    ratio = actual_duration_min / scheduled_duration_min
    for lo, hi, bonus in TIME_ACCURACY_BONUS:
        if lo <= ratio < hi:
            return bonus
    return 0.0


def _fatigue_bonus(fatigue_before: int, fatigue_after: int) -> float:
    delta = fatigue_after - fatigue_before
    for upper, bonus in FATIGUE_BONUS_TABLE:
        if delta <= upper:
            return bonus
    return -1.5


def _feedback_penalty_for_agent(agent_name: str, feedback: list[str]) -> float:
    """
    Compute total feedback penalty contribution for a specific agent.
    Primary agent gets full penalty, secondary agent gets 0.5x.
    F-codes not in FEEDBACK_ROUTING are silently scrapped.
    """
    penalty = 0.0
    for code in feedback:
        routing = FEEDBACK_ROUTING.get(code)
        if routing is None:
            continue  # unknown code — scrap it
        if routing["primary"] == agent_name:
            penalty += FEEDBACK_PENALTY[code] * 1.0
        elif routing["secondary"] == agent_name:
            penalty += FEEDBACK_PENALTY[code] * 0.5
    return penalty


def _compute_reward(
    agent_name: str,
    outcome: str,
    actual_duration_min: int | None,
    scheduled_duration_min: int,
    fatigue_before: int,
    fatigue_after: int,
    feedback: list[str],
) -> float:
    w_base, w_time, w_fatigue, w_feedback = AGENT_WEIGHTS[agent_name]

    base = _base_reward(outcome) * w_base
    time_acc = _time_accuracy_bonus(outcome, actual_duration_min,
                                    scheduled_duration_min) * w_time
    fatigue = _fatigue_bonus(fatigue_before, fatigue_after) * w_fatigue
    feedback_pen = _feedback_penalty_for_agent(
        agent_name, feedback) * w_feedback

    raw = base + time_acc + fatigue + feedback_pen
    return max(REWARD_CLIP[0], min(REWARD_CLIP[1], raw))


# ─────────────────────────────────────────────
# SIGMA LOOKUP
# ─────────────────────────────────────────────

def _new_sigma(agent_name: str, new_visit_count: int) -> float:
    table = SIGMA_DECAY[agent_name]
    for (lo, hi), sigma in table.items():
        if lo <= new_visit_count <= hi:
            return sigma
    return 0.3


# ─────────────────────────────────────────────
# BELLMAN UPDATE
# ─────────────────────────────────────────────

def _bellman(old_q: float, reward: float, max_next_q: float) -> float:
    new_q = old_q + ALPHA * (reward + GAMMA * max_next_q - old_q)
    return max(REWARD_CLIP[0], min(REWARD_CLIP[1], new_q))


def _update_agent(
    collection: str,
    agent_name: str,
    user_id: str,
    state: dict,
    action_taken: str,
    reward: float,
) -> None:
    """
    Reads current Q-table rows for this state, runs Bellman on the taken action,
    writes updated row back.

    max_next_q approximation: max Q-value across all actions in the current state.
    This is the known shortcut for episodic/non-MDP domains — acceptable here
    because there is no true next state.
    """
    q_rows = qtable_reader(collection, user_id, state)

    # find the row for the action that was actually taken
    taken_row = next((r for r in q_rows if r["action"] == action_taken), None)
    if taken_row is None:
        # should never happen if qtable_reader is implemented correctly
        # but guard anyway
        return

    old_q = taken_row["q_value"]
    max_next_q = max(r["q_value"]
                     for r in q_rows)  # current state approximation
    new_q = _bellman(old_q, reward, max_next_q)

    new_visit_count = taken_row["visit_count"] + 1
    new_sigma = _new_sigma(agent_name, new_visit_count)

    qtable_writer(
        collection,
        user_id,
        state,
        action_taken,
        new_q,
        new_visit_count,
        new_sigma,
    )


# ─────────────────────────────────────────────
# VALIDATION
# ─────────────────────────────────────────────

def _validate_feedback(outcome: str, feedback: list[str]) -> list[str]:
    """
    Cleans the feedback list before any updates run.

    Rules:
    - completed + feedback flags present → scrap all feedback flags
      (keep completion reward, ignore the flags — likely a UI bug)
    - failed/skipped + no feedback flags → return empty list
      (only base reward applies, no penalty)
    - unknown F-codes → scrapped silently in _feedback_penalty_for_agent
    """
    if outcome == "completed":
        if feedback:
            # bogus — completed tasks should not have feedback penalties
            return []
        return []

    # failed or skipped — feedback is valid, return as-is
    # unknown codes will be scrapped per-agent in _feedback_penalty_for_agent
    return feedback


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

def update(
    user_id: str,

    # state each agent was in when it made its decision
    duration_state:        dict,
    time_state:            dict,
    break_state:           dict,
    context_switch_state:  dict,

    # action each agent took
    duration_action:       str,
    time_action:           str,
    break_action:          str,
    context_switch_action: str,

    # outcome
    outcome:               str,        # "completed" | "failed" | "skipped"
    actual_duration_min:   int | None,  # None if not completed
    scheduled_duration_min: int,
    fatigue_before:        int,        # raw 1–10
    fatigue_after:         int,        # raw 1–10

    # feedback — list of F-codes e.g. ["F1", "F3"]
    feedback:              list[str],
) -> None:
    """
    Single entry point. Call once per task interaction.
    Updates Q-tables for all four agents based on outcome and feedback.
    """

    feedback = _validate_feedback(outcome, feedback)

    # compute reward per agent independently
    agents_to_update = [
        ("qtable_duration",       "duration",
         duration_state,       duration_action),
        ("qtable_time",           "time",
         time_state,           time_action),
        ("qtable_break",          "break",
         break_state,          break_action),
        ("qtable_context_switch", "context_switch",
         context_switch_state, context_switch_action),
    ]

    for collection, agent_name, state, action in agents_to_update:
        reward = _compute_reward(
            agent_name,
            outcome,
            actual_duration_min,
            scheduled_duration_min,
            fatigue_before,
            fatigue_after,
            feedback,
        )
        _update_agent(collection, agent_name, user_id, state, action, reward)
