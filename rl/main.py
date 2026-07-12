"""
main.py
-------
Entry point for the RL engine.
Listens on Redis queues and processes messages.

FIX: previous versions of this file stripped timezone info and stored
naive local-time datetimes directly, which MongoDB silently treated as
UTC — causing evening-scheduled tasks to display on the wrong calendar
day in the frontend. All datetimes are now explicitly converted to true
UTC before being written to MongoDB (see LOCAL_TZ, parse_datetime, to_utc
below).
"""

from bson import ObjectId
from pymongo import MongoClient
from interface import qtable_writer
from updater import update
from orchestrator import generate_schedule, regenerate_schedule
import os
import json
import redis
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────
# IMPORTS
# ─────────────────────────────────────────────

# ─────────────────────────────────────────────
# REDIS CONNECTION
# ─────────────────────────────────────────────
r = redis.Redis.from_url(
    os.getenv("REDIS_URL"),
    decode_responses=True
)

# ─────────────────────────────────────────────
# MONGODB CONNECTION (for saving sessions)
# ─────────────────────────────────────────────

client = MongoClient(os.getenv("MONGODB_URI"))
db = client["manovyavastha"]


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

# FIX: captures this machine's real local UTC offset at startup, e.g. +05:30
# for IST. Used to correctly convert naive local-time datetimes to true UTC
# before they're ever written to MongoDB.
LOCAL_TZ = datetime.now().astimezone().tzinfo


def parse_datetime(dt_str):
    """
    Convert an ISO string (naive, LOCAL wall-clock time, e.g. from
    orchestrator.py's task_start.isoformat()) into a proper UTC-aware
    datetime, safe to store in MongoDB.

    FIX (this used to be the opposite — it stripped timezone info and
    stored the naive datetime directly). MongoDB/pymongo treats a naive
    Python datetime as if it were ALREADY UTC when storing it. So a task
    scheduled for e.g. 9:00 PM local time was being saved as 9:00 PM UTC —
    a genuinely different, later instant (5.5 hours later, for IST).
    When the frontend later converted that stored UTC timestamp back to
    the user's local timezone for display, it could land on the WRONG
    calendar day entirely (9:00 PM IST -> stored as 21:00 UTC -> displayed
    as 2:30 AM the NEXT day once converted back to IST) — which is exactly
    why tasks appeared to vanish or move between day-tabs.
    """
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            # this string represents LOCAL wall-clock time — attach the
            # real local offset, then convert to true UTC before storing.
            dt = dt.replace(tzinfo=LOCAL_TZ)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def to_utc(local_naive_dt):
    """Same fix as parse_datetime(), for datetime objects (not strings) —
    e.g. the 'now' value used as scheduledDate, which had this exact same bug."""
    if local_naive_dt is None:
        return None
    if local_naive_dt.tzinfo is None:
        local_naive_dt = local_naive_dt.replace(tzinfo=LOCAL_TZ)
    return local_naive_dt.astimezone(timezone.utc)


def save_scheduled_sessions(user_id, goal_id, sections, scheduled_date):
    """
    Save orchestrator output sections to MongoDB as ScheduledSession documents.
    These are later read by Node.js to show the schedule to frontend.
    """
    if not sections:
        return

    session_docs = []
    for section in sections:
        start_time_utc = parse_datetime(section["start_time"])

        # FIX: previously every session in a multi-day batch was stamped
        # with the SAME scheduledDate — the moment "regenerate" was
        # clicked — even though tasks get distributed across many
        # different future calendar days. That meant Node's
        # getTodaySchedule() (which filters strictly on scheduledDate)
        # could only ever find sessions matching the generation day,
        # never the days they were actually scheduled for. Derive each
        # session's own calendar day from its own start time instead.
        if start_time_utc is not None:
            local_start = start_time_utc.astimezone(LOCAL_TZ)
            local_midnight = local_start.replace(
                hour=0, minute=0, second=0, microsecond=0)
            session_scheduled_date = local_midnight.astimezone(timezone.utc)
        else:
            session_scheduled_date = to_utc(scheduled_date)

        doc = {
            "taskId":    ObjectId(section["task_id"]),
            "goalId":    ObjectId(goal_id),
            "userId":    ObjectId(user_id),

            "scheduledDate":        session_scheduled_date,
            "startTime":            start_time_utc,
            "endTime":              parse_datetime(section["end_time"]),
            "scheduledDurationMin": section["scheduled_duration_min"],
            "breakDurationMin":     section["break_duration_min"],

            # agent decisions
            "durationAction":      section["duration_action"],
            "durationState":       section["duration_state"],
            "timeAction":          section["time_action"],
            "timeState":           section["time_state"],
            "breakAction":         section["break_action"],
            "breakState":          section["break_state"],
            "contextSwitchAction": section["context_switch_action"],
            "contextSwitchState":  section["context_switch_state"],

            # fatigue — will be filled from user profile later
            "fatigueBefore": 3,
            "fatigueAfter":  None,

            "outcome":          None,
            "actualDurationMin": None,
            "feedback":         [],
            "status":           "scheduled",
            "rlProcessed":      False,

            "createdAt": datetime.now(),
            "updatedAt": datetime.now(),
        }
        session_docs.append(doc)

    db.scheduledsessions.insert_many(session_docs)
    print(f"  Saved {len(session_docs)} scheduled sessions to MongoDB")


def update_task_status(task_ids, status="scheduled"):
    """Update task status after scheduling"""
    object_ids = [ObjectId(tid) for tid in task_ids]
    db.tasks.update_many(
        {"_id": {"$in": object_ids}},
        {"$set": {"status": status}}
    )


def build_efficiency_profile(user_id):
    """
    FIX: previously the orchestrator always received efficiency_profile={},
    so duration_agent's cold-start personalization branch was dead code.

    This builds a real per-task-type efficiency profile from the user's
    completed sessions: how their actual duration compared to what was
    scheduled, on average, for each task_type.
    """
    pipeline = [
        {"$match": {
            "userId": ObjectId(user_id),
            "outcome": "completed",
            "actualDurationMin": {"$ne": None},
            "scheduledDurationMin": {"$gt": 0},
        }},
        {"$group": {
            "_id": "$durationState.taskType",
            "avg_ratio": {
                "$avg": {"$divide": ["$actualDurationMin", "$scheduledDurationMin"]}
            },
            "visit_count": {"$sum": 1},
        }},
    ]

    profile = {}
    try:
        for row in db.scheduledsessions.aggregate(pipeline):
            task_type = row["_id"]
            if not task_type:
                continue
            profile[task_type] = {
                "multiplier": round(row["avg_ratio"], 2),
                "visit_count": row["visit_count"],
            }
    except Exception as e:
        print(f"  Could not build efficiency profile: {e}")

    return profile


def get_latest_fatigue(user_id, default=3):
    """
    FIX: previously fatigue_raw was hardcoded to 3 everywhere. Use the most
    recently reported fatigueAfter value as a real (if imperfect) proxy for
    the user's current state.
    """
    try:
        last = db.scheduledsessions.find(
            {"userId": ObjectId(user_id), "fatigueAfter": {"$ne": None}}
        ).sort("updatedAt", -1).limit(1)
        last = list(last)
        if last:
            return last[0]["fatigueAfter"]
    except Exception as e:
        print(f"  Could not fetch latest fatigue: {e}")
    return default


# ─────────────────────────────────────────────
# QUEUE HANDLERS
# ─────────────────────────────────────────────

def handle_rl_task_queue(message):
    """
    NOTE (found during code review): as of this fix, the Node.js backend
    never pushes to 'rl_task_queue' — goal creation and manual regeneration
    both go through 'schedule_queue' / handle_schedule_queue instead. This
    handler is kept (in case it's wired up again later) but has no current
    producer. Still updated with the same fixes as handle_schedule_queue
    so it isn't left further out of date.

    Handles new task decomposition from Node.js.
    Runs generate_schedule() and saves sessions to MongoDB.
    """
    data = json.loads(message)
    user_id = data["user_id"]
    goal_id = data["goal_id"]
    tasks = data["tasks"]

    print(f"\n[TASK QUEUE] Received {len(tasks)} tasks for user {user_id}")

    # convert deadline strings to datetime objects
    for task in tasks:
        if task.get("deadline"):
            task["deadline"] = parse_datetime(task["deadline"])
        else:
            # no deadline — set far future
            task["deadline"] = datetime(2099, 12, 31)

    # FIX #5: Use local time, not UTC
    now = datetime.now()

    # FIX: real fatigue instead of hardcoded 3
    user_state = {"fatigue_raw": get_latest_fatigue(user_id)}
    efficiency_profile = build_efficiency_profile(user_id)

    result = generate_schedule(
        user_id=user_id,
        tasks=tasks,
        user_state=user_state,
        now=now,
        efficiency_profile=efficiency_profile,
    )

    sections = result["sections"]
    unschedulable = result["unschedulable"]
    infeasible = result["infeasible"]

    print(f"  Sections generated: {len(sections)}")
    print(f"  Unschedulable:      {len(unschedulable)}")
    print(f"  Infeasible:         {len(infeasible)}")

    if sections:
        save_scheduled_sessions(user_id, goal_id, sections, now)

        # update task status to scheduled
        scheduled_task_ids = [s["task_id"] for s in sections]
        update_task_status(scheduled_task_ids, "scheduled")

        print(f"  Schedule built successfully for user {user_id}")

    if unschedulable:
        print(f"  WARNING: {len(unschedulable)} tasks could not be scheduled")
        for t in unschedulable:
            print(f"    → {t.get('task_name', t['task_id'])} missed deadline")

    if infeasible:
        print(f"  WARNING: {len(infeasible)} tasks are infeasible")


def handle_schedule_queue(message):
    """
    Handles schedule regeneration request from Node.js.
    Runs regenerate_schedule() and saves new sessions.
    """
    data = json.loads(message)
    user_id = data["user_id"]
    pending_tasks = data.get("pending_tasks", [])
    failed_tasks = data.get("failed_tasks", [])
    now_str = data.get("now", datetime.now().isoformat())
    user_state = data.get("user_state") or {}

    # FIX: if Node didn't supply a real fatigue value (or sent the old
    # hardcoded placeholder), fall back to the user's real latest reading.
    if not user_state.get("fatigue_raw"):
        user_state["fatigue_raw"] = get_latest_fatigue(user_id)

    efficiency_profile = build_efficiency_profile(user_id)

    print(f"\n[SCHEDULE QUEUE] Regeneration for user {user_id}")
    print(f"  Pending tasks: {len(pending_tasks)}")
    print(f"  Failed tasks:  {len(failed_tasks)}")

    # FIX #5: Use local time, not UTC
    now = parse_datetime(now_str) or datetime.now()

    # convert deadline strings to datetime
    for task in pending_tasks + failed_tasks:
        if task.get("deadline"):
            task["deadline"] = parse_datetime(task["deadline"])
        else:
            task["deadline"] = datetime(2099, 12, 31)

    result = regenerate_schedule(
        user_id=user_id,
        pending_tasks=pending_tasks,
        failed_tasks=failed_tasks,
        user_state=user_state,
        now=now,
        efficiency_profile=efficiency_profile,
    )

    sections = result["sections"]
    print(f"  Sections generated: {len(sections)}")

    if sections:
        # delete old unstarted sessions first
        # FIX #2 & #4: Delete ALL future sessions for this user (global regenerate)
        today_start = datetime(now.year, now.month, now.day)
        db.scheduledsessions.delete_many({
            "userId": ObjectId(user_id),
            "status": "scheduled",
            "scheduledDate": {"$gte": today_start}
        })

        # need goal_id — get from first task's goalId
        if pending_tasks or failed_tasks:
            first_task_id = (pending_tasks or failed_tasks)[0]["task_id"]
            task_doc = db.tasks.find_one({"_id": ObjectId(first_task_id)})
            goal_id = str(task_doc["goalId"]) if task_doc else "unknown"
        else:
            goal_id = "unknown"

        save_scheduled_sessions(user_id, goal_id, sections, now)
        print(f"  Schedule regenerated for user {user_id}")


def handle_rl_feedback_queue(message):
    """
    Handles feedback from Node.js.
    Runs updater.py update() to update Q-tables.
    """
    data = json.loads(message)

    print(f"\n[FEEDBACK QUEUE] Processing feedback for user {data['user_id']}")
    print(f"  Outcome:  {data['outcome']}")
    print(f"  Feedback: {data['feedback']}")

    update(
        user_id=data["user_id"],

        duration_state=data["duration_state"],
        time_state=data["time_state"],
        break_state=data["break_state"],
        context_switch_state=data["context_switch_state"],

        duration_action=data["duration_action"],
        time_action=data["time_action"],
        break_action=data["break_action"],
        context_switch_action=data["context_switch_action"],

        outcome=data["outcome"],
        actual_duration_min=data.get("actual_duration_min"),
        scheduled_duration_min=data["scheduled_duration_min"],
        fatigue_before=data["fatigue_before"],
        fatigue_after=data["fatigue_after"],

        feedback=data.get("feedback", [])
    )

    # FIX: rlProcessed was set to False by Node when feedback arrived, but
    # nothing anywhere ever set it back to True — so it never actually did
    # its intended job as an idempotency guard. Node must now include
    # "session_id" in the payload (see feedback.service.js) so we know
    # exactly which ScheduledSession document to mark as processed.
    session_id = data.get("session_id")
    if session_id:
        db.scheduledsessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"rlProcessed": True}}
        )
        print(f"  Marked session {session_id} as rlProcessed")
    else:
        print(f"  No session_id in payload — could not mark rlProcessed (likely the no-session fallback case)")

    print(f"  Q-tables updated successfully")


# ─────────────────────────────────────────────
# MAIN LOOP
# ─────────────────────────────────────────────

QUEUES = [
    "rl_task_queue",
    "schedule_queue",
    "rl_feedback_queue"
]

if __name__ == "__main__":
    print("=" * 50)
    print("MANOVYAVASTHA RL Engine started")
    print(f"Listening on queues: {', '.join(QUEUES)}")
    print("Press Ctrl+C to stop")
    print("=" * 50)

    while True:
        try:
            # block until ANY of the queues has a message
            # returns (queue_name, message)
            result = r.brpop(QUEUES, timeout=0)

            if result:
                queue_name, message = result
                print(f"\nMessage received on: {queue_name}")

                if queue_name == "rl_task_queue":
                    handle_rl_task_queue(message)

                elif queue_name == "schedule_queue":
                    handle_schedule_queue(message)

                elif queue_name == "rl_feedback_queue":
                    handle_rl_feedback_queue(message)

        except KeyboardInterrupt:
            print("\nRL Engine stopped.")
            break
        except Exception as e:
            print(f"\nError processing message: {e}")
            import traceback
            traceback.print_exc()
            print("Continuing to listen...")
