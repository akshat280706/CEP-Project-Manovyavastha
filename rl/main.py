"""
main.py
-------
Entry point for the RL engine.
Listens on Redis queues and processes messages.

Run with: python main.py
"""

import os
import json
import redis
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────
# IMPORTS
# ─────────────────────────────────────────────
from orchestrator import generate_schedule, regenerate_schedule
from updater import update
from interface import qtable_writer

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
from pymongo import MongoClient
from bson import ObjectId

client = MongoClient(os.getenv("MONGODB_URI"))
db     = client["manovyavastha"]


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def parse_datetime(dt_str):
    """Convert ISO string to datetime object"""
    if not dt_str:
        return None
    try:
        return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except:
        return None


def save_scheduled_sessions(user_id, goal_id, sections, scheduled_date):
    """
    Save orchestrator output sections to MongoDB as ScheduledSession documents.
    These are later read by Node.js to show the schedule to frontend.
    """
    if not sections:
        return

    session_docs = []
    for section in sections:
        doc = {
            "taskId":    ObjectId(section["task_id"]),
            "goalId":    ObjectId(goal_id),
            "userId":    ObjectId(user_id),

            "scheduledDate":        scheduled_date,
            "startTime":            parse_datetime(section["start_time"]),
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

            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc),
        }
        session_docs.append(doc)

    db.scheduledsessions.insert_many(session_docs)
    print(f"  Saved {len(session_docs)} scheduled sessions to MongoDB")


def update_task_status(task_ids, status="scheduled"):
    """Update task status after scheduling"""
    object_ids = [ObjectId(tid) for tid in task_ids]
    db.tasks.update_many(
        { "_id": { "$in": object_ids } },
        { "$set": { "status": status } }
    )


# ─────────────────────────────────────────────
# QUEUE HANDLERS
# ─────────────────────────────────────────────

def handle_rl_task_queue(message):
    """
    Handles new task decomposition from Node.js.
    Runs generate_schedule() and saves sessions to MongoDB.
    """
    data    = json.loads(message)
    user_id = data["user_id"]
    goal_id = data["goal_id"]
    tasks   = data["tasks"]

    print(f"\n[TASK QUEUE] Received {len(tasks)} tasks for user {user_id}")

    # convert deadline strings to datetime objects
    for task in tasks:
        if task.get("deadline"):
            task["deadline"] = parse_datetime(task["deadline"])
        else:
            # no deadline — set far future
            task["deadline"] = datetime(2099, 12, 31, tzinfo=timezone.utc)

    now        = datetime.now(timezone.utc)
    user_state = { "fatigue_raw": 3 }  # default — later from user profile

    result = generate_schedule(
        user_id    = user_id,
        tasks      = tasks,
        user_state = user_state,
        now        = now,
    )

    sections      = result["sections"]
    unschedulable = result["unschedulable"]
    infeasible    = result["infeasible"]

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
    data          = json.loads(message)
    user_id       = data["user_id"]
    pending_tasks = data.get("pending_tasks", [])
    failed_tasks  = data.get("failed_tasks", [])
    now_str       = data.get("now", datetime.now(timezone.utc).isoformat())
    user_state    = data.get("user_state", { "fatigue_raw": 3 })

    print(f"\n[SCHEDULE QUEUE] Regeneration for user {user_id}")
    print(f"  Pending tasks: {len(pending_tasks)}")
    print(f"  Failed tasks:  {len(failed_tasks)}")

    now = parse_datetime(now_str) or datetime.now(timezone.utc)

    # convert deadline strings to datetime
    for task in pending_tasks + failed_tasks:
        if task.get("deadline"):
            task["deadline"] = parse_datetime(task["deadline"])
        else:
            task["deadline"] = datetime(2099, 12, 31, tzinfo=timezone.utc)

    result = regenerate_schedule(
        user_id       = user_id,
        pending_tasks = pending_tasks,
        failed_tasks  = failed_tasks,
        user_state    = user_state,
        now           = now,
    )

    sections = result["sections"]
    print(f"  Sections generated: {len(sections)}")

    if sections:
        # delete old unstarted sessions first
        db.scheduledsessions.delete_many({
            "userId": ObjectId(user_id),
            "status": "scheduled",
            "scheduledDate": {
                "$gte": datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
            }
        })

        # need goal_id — get from first task's goalId
        if pending_tasks or failed_tasks:
            first_task_id = (pending_tasks or failed_tasks)[0]["task_id"]
            task_doc = db.tasks.find_one({ "_id": ObjectId(first_task_id) })
            goal_id  = str(task_doc["goalId"]) if task_doc else "unknown"
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
        user_id = data["user_id"],

        duration_state       = data["duration_state"],
        time_state           = data["time_state"],
        break_state          = data["break_state"],
        context_switch_state = data["context_switch_state"],

        duration_action       = data["duration_action"],
        time_action           = data["time_action"],
        break_action          = data["break_action"],
        context_switch_action = data["context_switch_action"],

        outcome                = data["outcome"],
        actual_duration_min    = data.get("actual_duration_min"),
        scheduled_duration_min = data["scheduled_duration_min"],
        fatigue_before         = data["fatigue_before"],
        fatigue_after          = data["fatigue_after"],

        feedback = data.get("feedback", [])
    )

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