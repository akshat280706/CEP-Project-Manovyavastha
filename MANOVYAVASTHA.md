# MANOVYAVASTHA — System Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Team Ownership](#team-ownership)
4. [Complete Data Flow](#complete-data-flow)
5. [Flow 1 — User Registration & Login](#flow-1--user-registration--login)
6. [Flow 2 — Goal Creation & LLM Decomposition](#flow-2--goal-creation--llm-decomposition)
7. [Flow 3 — Goal Refinement (Conversation)](#flow-3--goal-refinement-conversation)
8. [Flow 4 — Confirm Goal (Save to DB + Notify RL)](#flow-4--confirm-goal-save-to-db--notify-rl)
9. [Flow 5 — Schedule Generation (RL Pipeline)](#flow-5--schedule-generation-rl-pipeline)
10. [Flow 6 — How Schedule Reaches Frontend](#flow-6--how-schedule-reaches-frontend)
11. [Flow 7 — Task Completion & Feedback](#flow-7--task-completion--feedback)
12. [Flow 8 — RL Learning Update](#flow-8--rl-learning-update)
13. [Flow 9 — Schedule Regeneration](#flow-9--schedule-regeneration)
14. [API Reference](#api-reference)
15. [Redis Queue Reference](#redis-queue-reference)
16. [MongoDB Collections Reference](#mongodb-collections-reference)
17. [Setup Instructions](#setup-instructions)

---

## Project Overview

MANOVYAVASTHA is a cognitive-aware task scheduler. It uses an LLM to decompose user goals into structured tasks, and a multi-agent Reinforcement Learning system to build a personalized daily schedule that improves over time based on user feedback.

```
User Goal → LLM Decomposition → RL Scheduling → Daily Timetable → Feedback → Learning
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Backend | Node.js + Express |
| Database | MongoDB Atlas |
| Queue / Cache | Upstash Redis |
| LLM | Groq API (LLaMA 3.3 70B) |
| RL Engine | Python (agents.py, updater.py, orchestrator.py) |
| Auth | JWT + bcrypt |
| File Upload | Multer (memory storage) |
| PDF Extraction | pdf-parse + mammoth |

---

## Team Ownership

| Module | Person | Files |
|---|---|---|
| Frontend | Person 1 | `client/` |
| LLM + Goals | Person 2 (Jehan) | `backend/src/modules/llm/`, `backend/src/modules/goals/`, `backend/src/models/Goal.js`, `backend/src/models/Task.js`, `backend/src/models/ScheduledSession.js`, `backend/src/config/groq.js`, `backend/src/utils/pdfExtractor.js`, `backend/src/middleware/upload.middleware.js`, `rl/interface.py` |
| Auth + Schedule + Feedback | Person 3 | `backend/src/modules/auth/`, `backend/src/modules/schedule/`, `backend/src/modules/feedback/`, `backend/src/models/User.js`, `backend/server.js`, `backend/src/config/db.js`, `backend/src/config/redis.js` |
| RL Engine | Person 4 (Aryan) | `rl/agents.py`, `rl/updater.py`, `rl/orchestrator.py` |

---

## Complete Data Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Frontend  │ ──────► │   Backend   │ ──────► │  Groq API   │
│   (React)   │ ◄────── │  (Node.js)  │ ◄────── │    (LLM)    │
└─────────────┘         └──────┬──────┘         └─────────────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
               ┌────▼────┐ ┌──▼───┐ ┌───▼────┐
               │ MongoDB │ │Redis │ │MongoDB │
               │  Atlas  │ │Queue │ │Q-Tables│
               └─────────┘ └──┬───┘ └───▲────┘
                               │         │
                         ┌─────▼─────────┴──┐
                         │   Python RL       │    
                         │  (orchestrator,   │
                         │  agents, updater) │
                         └───────────────────┘
```

---

## Flow 1 — User Registration & Login

### Registration

```
Frontend                    Backend                     MongoDB
   │                           │                           │
   │  POST /api/auth/register  │                           │
   │  {                        │                           │
   │    name: "Jehan",         │                           │
   │    email: "j@gmail.com",  │                           │
   │    password: "pass123"    │                           │
   │  }                        │                           │
   │ ─────────────────────── ► │                           │
   │                           │  hash password (bcrypt)   │
   │                           │  INSERT user document ──► │
   │                           │                           │
   │                           │  generate JWT token       │
   │ ◄─────────────────────── │                           │
   │  {                        │                           │
   │    success: true,         │                           │
   │    token: "eyJhbG...",    │                           │
   │    user: { id, name,      │                           │
   │            email }        │                           │
   │  }                        │                           │
```

**Frontend stores the token** in memory or localStorage. Sends it in every future request as:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

### Login

Identical flow except backend:
1. Finds user by email
2. Compares password with bcrypt hash
3. Returns fresh JWT token

---

## Flow 2 — Goal Creation & LLM Decomposition

### Without File Upload

```
Frontend                    Backend                     Groq API (LLM)
   │                           │                           │
   │  POST /api/llm/decompose  │                           │
   │  Headers:                 │                           │
   │    Authorization: Bearer  │                           │
   │  Body:                    │                           │
   │  {                        │                           │
   │    title: "Prepare DSA",  │                           │
   │    goalType: "exam_prep", │                           │
   │    deadline: "2026-04-16",│                           │
   │    hoursPerDay: 3         │                           │
   │  }                        │                           │
   │ ─────────────────────── ► │                           │
   │                           │  auth middleware checks   │
   │                           │  JWT token ✓              │
   │                           │                           │
   │                           │  build system prompt +    │
   │                           │  user message             │
   │                           │ ─────────────────────── ► │
   │                           │  {                        │
   │                           │    model: "llama-3.3-70b",│
   │                           │    messages: [            │
   │                           │      {role:"system",      │
   │                           │       content: PROMPT},   │
   │                           │      {role:"user",        │
   │                           │       content: goal_msg}  │
   │                           │    ],                     │
   │                           │    temperature: 0.3       │
   │                           │  }                        │
   │                           │ ◄─────────────────────── │
   │                           │  JSON array of 5-10 tasks │
   │                           │                           │
   │                           │  parse + validate JSON    │
   │ ◄─────────────────────── │                           │
   │  {                        │                           │
   │    success: true,         │                           │
   │    tasks: [...],          │                           │
   │    conversationHistory:[  │                           │
   │      {role:"user",...},   │                           │
   │      {role:"assistant",...}                           │
   │    ]                      │                           │
   │  }                        │                           │
```

**IMPORTANT:** Tasks are NOT saved to MongoDB yet. Frontend shows them as a preview.  
**Frontend stores `conversationHistory` in React state** for refinement turns.

### With File Upload (PDF/DOCX/Image)

```
Frontend                    Backend
   │                           │
   │  POST /api/llm/decompose  │
   │  multipart/form-data:     │
   │    goalData: {...}        │
   │    material: [PDF file]   │
   │ ─────────────────────── ► │
   │                           │  multer receives file
   │                           │  (stored in memory, never on disk)
   │                           │
   │                           │  if PDF → pdf-parse extracts text
   │                           │  if DOCX → mammoth extracts text
   │                           │  if image → convert to base64
   │                           │
   │                           │  if text > 2000 words:
   │                           │    extract headings only
   │                           │  else:
   │                           │    use full text
   │                           │
   │                           │  append material to LLM prompt
   │                           │  → Groq API call (same as above)
   │                           │  → tasks based on actual material
```

---

## Flow 3 — Goal Refinement (Conversation)

User can refine tasks up to 6 turns. Frontend sends full conversation history each time.

```
Frontend                    Backend                     Groq API
   │                           │                           │
   │  POST /api/llm/refine     │                           │
   │  {                        │                           │
   │    conversationHistory: [ │                           │
   │      {role:"user",        │                           │
   │       content:"Goal:..."} │                           │
   │      {role:"assistant",   │                           │
   │       content:"[tasks]"}  │                           │
   │    ],                     │                           │
   │    newMessage: "Remove    │                           │
   │      graph theory",       │                           │
   │    turnCount: 1           │                           │
   │  }                        │                           │
   │ ─────────────────────── ► │                           │
   │                           │  check turnCount < 6      │
   │                           │                           │
   │                           │  build messages array:    │
   │                           │  [system prompt,          │
   │                           │   ...conversationHistory, │
   │                           │   new user message]       │
   │                           │ ─────────────────────── ► │
   │                           │ ◄─────────────────────── │
   │                           │  updated tasks JSON       │
   │ ◄─────────────────────── │                           │
   │  {                        │                           │
   │    tasks: [...updated],   │                           │
   │    assistantMessage: {    │                           │
   │      role: "assistant",   │                           │
   │      content: "..."       │                           │
   │    },                     │                           │
   │    turnsRemaining: 4      │                           │
   │  }                        │                           │

Frontend appends assistantMessage to conversationHistory in React state.
Sends updated history on next turn.
After 6 turns → force confirm.
Conversation is NEVER saved to MongoDB — discarded after confirm.
```

---

## Flow 4 — Confirm Goal (Save to DB + Notify RL)

When user is satisfied and clicks confirm:

```
Frontend                 Backend                  MongoDB           Redis
   │                        │                        │                │
   │  POST /api/goals/confirm                        │                │
   │  {                     │                        │                │
   │    goalData: {         │                        │                │
   │      title,goalType,   │                        │                │
   │      deadline,         │                        │                │
   │      hoursPerDay       │                        │                │
   │    },                  │                        │                │
   │    tasks: [            │                        │                │
   │      {title,task_type, │                        │                │
   │       difficulty,      │                        │                │
   │       base_duration,   │                        │                │
   │       priority,        │                        │                │
   │       order_index,     │                        │                │
   │       frequency,       │                        │                │
   │       phase,           │                        │                │
   │       depends_on,      │                        │                │
   │       topic_name},     │                        │                │
   │      ...               │                        │                │
   │    ]                   │                        │                │
   │  }                     │                        │                │
   │ ──────────────────── ► │                        │                │
   │                        │  Step 1:               │                │
   │                        │  INSERT goal ───────► │                │
   │                        │                        │                │
   │                        │  Step 2:               │                │
   │                        │  INSERT all tasks ──► │                │
   │                        │  (insertMany — 1 op)   │                │
   │                        │                        │                │
   │                        │  Step 3:               │                │
   │                        │  transform to RL fmt   │                │
   │                        │  lpush ─────────────────────────────► │
   │                        │  'rl_task_queue'        │                │
   │ ◄──────────────────── │                        │                │
   │  {                     │                        │                │
   │    success: true,      │                        │                │
   │    message: "Goal      │                        │                │
   │     saved. RL queued"  │                        │                │
   │    goal: {...},        │                        │                │
   │    tasks: [...]        │                        │                │
   │  }                     │                        │                │
```

### RL Task Payload Format (pushed to Redis)

```json
{
  "goal_id": "661a2b3c...",
  "user_id": "661a1a1a...",
  "decomposition_metadata": {
    "model_used": "llama-3.3-70b-versatile",
    "total_tasks": 7,
    "estimated_total_hours": 11.5,
    "decomposition_confidence": 0.87
  },
  "tasks": [
    {
      "task_id": "661a3c3c...",
      "task_name": "Learn Graph Theory Basics",
      "task_type": "theory",
      "difficulty": 2,
      "base_duration_min": 90,
      "deadline": "2026-04-16T23:59:00Z",
      "dependency_task_name": null,
      "topic_name": "Graph Theory",
      "priority_hint": 8,
      "source": "new",
      "attempt_count": 0,
      "priority_boost": 0,
      "last_failed_reason": null,
      "llm_order": 1
    }
  ]
}
```

---

## Flow 5 — Schedule Generation (RL Pipeline)

Python is always listening on Redis queues. When it receives the task payload:

```
Redis                    Python RL Engine                    MongoDB
  │                           │                                 │
  │  message arrives          │                                 │
  │  on rl_task_queue         │                                 │
  │ ─────────────────────── ► │                                 │
  │                           │                                 │
  │                           │  orchestrator.py                │
  │                           │  generate_schedule() runs:      │
  │                           │                                 │
  │                           │  1. feasibility check           │
  │                           │     (can tasks fit deadlines?)  │
  │                           │                                 │
  │                           │  2. run_selector()              │
  │                           │     scores and orders tasks     │
  │                           │     considers:                  │
  │                           │     - deadline pressure         │
  │                           │     - fatigue level             │
  │                           │     - context switch cost       │
  │                           │     - retry score               │
  │                           │     - llm_order                 │
  │                           │                                 │
  │                           │  3. _build_sections()           │
  │                           │     for each task:              │
  │                           │                                 │
  │                           │     duration_agent()            │
  │                           │       reads qtable_duration ──► │
  │                           │       decides multiplier        │
  │                           │                                 │
  │                           │     break_agent()               │
  │                           │       reads qtable_break ─────► │
  │                           │       decides break length      │
  │                           │                                 │
  │                           │     time placement              │
  │                           │       calculates start/end time │
  │                           │                                 │
  │                           │     stores agent decisions      │
  │                           │     (states + actions)          │
  │                           │     for updater.py later        │
  │                           │                                 │
  │                           │  4. returns sections[]          │
  │                           │                                 │
  │                           │  INSERT ScheduledSessions ────► │
  │                           │  (one per task with all         │
  │                           │   agent decisions stored)       │
  │                           │                                 │
  │                           │  UPDATE task status             │
  │                           │  pending → scheduled ─────────► │
```

### What Each ScheduledSession Contains

```json
{
  "taskId": "661a3c3c...",
  "scheduledDate": "2026-04-05",
  "startTime": "2026-04-05T09:00:00Z",
  "endTime": "2026-04-05T09:45:00Z",
  "scheduledDurationMin": 45,
  "breakDurationMin": 15,

  "durationAction": "1.0x",
  "durationState": {
    "taskType": "theory",
    "difficulty": 1,
    "deadlinePressure": 0
  },

  "timeAction": "block_2",
  "timeState": {
    "hourBlock": 2,
    "taskType": "theory"
  },

  "breakAction": "15min",
  "breakState": {
    "fatigueLevelBefore": 1,
    "consecutiveMinutesBucket": 2,
    "prevTaskType": "coding",
    "nextTaskType": "theory",
    "nextTaskDifficulty": 1
  },

  "contextSwitchAction": "switch_now",
  "contextSwitchState": {
    "prevTaskType": "coding",
    "nextTaskType": "theory",
    "sessionPosition": 1
  },

  "fatigueBefore": 4,
  "fatigueAfter": null,
  "outcome": null,
  "feedback": [],
  "status": "scheduled",
  "rlProcessed": false
}
```

---

## Flow 6 — How Schedule Reaches Frontend

**The schedule does NOT go directly from Python to Frontend.**  
Python writes to MongoDB. Frontend asks Node.js. Node.js reads from MongoDB.

```
Python RL                MongoDB               Backend              Frontend
   │                        │                     │                    │
   │  INSERT                │                     │                    │
   │  ScheduledSessions ──► │                     │                    │
   │                        │                     │                    │
   │                        │                     │  GET /api/schedule/today
   │                        │                     │ ◄─────────────────│
   │                        │  find sessions      │                    │
   │                        │  where userId=X ◄── │                    │
   │                        │  date = today        │                    │
   │                        │ ──────────────────► │                    │
   │                        │                     │  return sessions   │
   │                        │                     │ ──────────────────►│
   │                        │                     │  {                 │
   │                        │                     │    sessions: [     │
   │                        │                     │      {taskId,      │
   │                        │                     │       startTime,   │
   │                        │                     │       endTime,     │
   │                        │                     │       duration,    │
   │                        │                     │       break...}    │
   │                        │                     │    ]               │
   │                        │                     │  }                 │
```

**Why this design?**
- Python is a background worker — it has no HTTP server to push to frontend
- Frontend always pulls data through Node.js
- Node.js is the single source of truth for the frontend
- Python only writes to MongoDB — never directly to frontend

---

## Flow 7 — Task Completion & Feedback

### Step A — Mark Task Complete

```
Frontend              Backend                MongoDB
   │                     │                      │
   │  POST               │                      │
   │  /api/schedule/     │                      │
   │  complete/:taskId   │                      │
   │  {                  │                      │
   │    actualDuration   │                      │
   │    Min: 50          │                      │
   │  }                  │                      │
   │ ──────────────── ► │                      │
   │                     │  UPDATE task         │
   │                     │  status=completed ─► │
   │                     │                      │
   │                     │  unblockDependents() │
   │                     │  check if any tasks  │
   │                     │  were waiting for    │
   │                     │  this one → unblock  │
   │                     │                      │
   │ ◄──────────────── │                      │
   │  {                  │                      │
   │    needsFeedback:   │                      │
   │    true/false       │                      │
   │  }                  │                      │
```

`needsFeedback: true` → frontend shows feedback form  
`needsFeedback: false` → recurring task, no form needed

### Step B — Submit Feedback (one-time tasks only)

```
Frontend              Backend               MongoDB           Redis
   │                     │                     │                │
   │  POST               │                     │                │
   │  /api/feedback/     │                     │                │
   │  submit             │                     │                │
   │  {                  │                     │                │
   │    taskId: "...",   │                     │                │
   │    outcome:         │                     │                │
   │     "completed",    │                     │                │
   │    feedback: [],    │                     │                │
   │    actualDuration   │                     │                │
   │    Min: 50,         │                     │                │
   │    fatigueAfter: 4  │                     │                │
   │  }                  │                     │                │
   │ ──────────────── ► │                     │                │
   │                     │  load               │                │
   │                     │  ScheduledSession ► │                │
   │                     │  (has all 4 agent   │                │
   │                     │   states+actions)   │                │
   │                     │                     │                │
   │                     │  build RL payload   │                │
   │                     │  (exact format for  │                │
   │                     │   updater.py)       │                │
   │                     │                     │                │
   │                     │  lpush ─────────────────────────── ► │
   │                     │  'rl_feedback_queue'│                │
   │                     │                     │                │
   │                     │  UPDATE session     │                │
   │                     │  outcome, feedback ►│                │
   │ ◄──────────────── │                     │                │
   │  {                  │                     │                │
   │    success: true,   │                     │                │
   │    message: "Feed   │                     │                │
   │    back submitted"  │                     │                │
   │  }                  │                     │                │
```

### Feedback Codes

| Code | Meaning | Agent Updated |
|---|---|---|
| F1 | Not enough time | Duration (primary) |
| F2 | Too tired | Break (primary) + Time (secondary) |
| F3 | Wrong time of day | Time (primary) |
| F4 | Too difficult | Duration (primary) |
| F5 | Distracted | Break (primary) + Context Switch (secondary) |
| F8 | Context switch was bad | Context Switch (primary) |
| (none) | Completed normally | All agents get positive reward |

---

## Flow 8 — RL Learning Update

Python receives feedback from Redis and updates Q-tables:

```
Redis                  Python RL                    MongoDB (Q-Tables)
  │                        │                               │
  │  message arrives       │                               │
  │  on rl_feedback_queue  │                               │
  │ ──────────────────── ► │                               │
  │                        │                               │
  │                        │  updater.py update() runs     │
  │                        │                               │
  │                        │  _validate_feedback()         │
  │                        │  (clean F-codes)              │
  │                        │                               │
  │                        │  for each of 4 agents:        │
  │                        │                               │
  │                        │  _compute_reward()            │
  │                        │    base reward (+2/-1/-0.5)   │
  │                        │    time accuracy bonus        │
  │                        │    fatigue delta bonus        │
  │                        │    feedback penalty           │
  │                        │                               │
  │                        │  _update_agent()              │
  │                        │    qtable_reader() ─────────► │
  │                        │    Bellman equation:          │
  │                        │    Q(s,a) ← Q(s,a) +         │
  │                        │    α[r + γ·maxQ(s') - Q(s,a)] │
  │                        │    qtable_writer() ─────────► │
  │                        │    (upsert new Q-value)       │
  │                        │                               │
  │                        │  mark session                 │
  │                        │  rlProcessed = true ────────► │
```

### RL Feedback Payload Format (Node.js → Redis → Python)

```json
{
  "user_id": "661a1a1a...",

  "duration_state": {
    "task_type": "coding",
    "difficulty": 2,
    "deadline_pressure": 1
  },
  "time_state": {
    "hour_block": 2,
    "task_type": "coding"
  },
  "break_state": {
    "fatigue_level": 1,
    "consecutive_minutes_bucket": 2,
    "prev_task_type": "theory",
    "next_task_type": "coding",
    "next_task_difficulty": 2
  },
  "context_switch_state": {
    "prev_task_type": "theory",
    "next_task_type": "coding",
    "session_position": 1
  },

  "duration_action": "1.0x",
  "time_action": "block_2",
  "break_action": "15min",
  "context_switch_action": "switch_now",

  "outcome": "failed",
  "actual_duration_min": null,
  "scheduled_duration_min": 90,
  "fatigue_before": 4,
  "fatigue_after": 7,

  "feedback": ["F2"]
}
```

---

## Flow 9 — Schedule Regeneration

When user adds a new goal mid-day or skips a task:

```
Frontend              Backend               Redis              Python RL
   │                     │                    │                    │
   │  POST               │                    │                    │
   │  /api/schedule/     │                    │                    │
   │  regenerate         │                    │                    │
   │ ──────────────── ► │                    │                    │
   │                     │  fetch pending     │                    │
   │                     │  tasks from DB     │                    │
   │                     │                    │                    │
   │                     │  fetch failed/     │                    │
   │                     │  skipped tasks     │                    │
   │                     │  (cooldown expired)│                    │
   │                     │                    │                    │
   │                     │  build payload     │                    │
   │                     │  lpush ──────────► │                    │
   │                     │  'schedule_queue'  │                    │
   │ ◄──────────────── │                    │                    │
   │  "Schedule          │                    │  brpop wakes up ► │
   │   regeneration      │                    │                    │
   │   queued"           │                    │  orchestrator.py   │
   │                     │                    │  regenerate_       │
   │                     │                    │  schedule() runs   │
   │                     │                    │                    │
   │                     │                    │  new sessions ────►MongoDB
   │                     │                    │                    │
   │  GET /api/schedule/today (frontend polls)│                    │
   │ ──────────────── ► │                    │                    │
   │                     │  reads updated     │                    │
   │                     │  sessions from DB  │                    │
   │ ◄──────────────── │                    │                    │
   │  new schedule       │                    │                    │
```

### Regeneration Payload Format (Node.js → Redis → Python)

```json
{
  "type": "REGENERATE_SCHEDULE",
  "user_id": "661a1a1a...",
  "now": "2026-04-05T14:00:00Z",
  "user_state": {
    "fatigue_raw": 3
  },
  "pending_tasks": [
    {
      "task_id": "661a3c3c...",
      "task_type": "coding",
      "difficulty": 2,
      "base_duration_min": 90,
      "deadline": "2026-04-10T23:59:00Z",
      "source": "pending",
      "attempt_count": 0,
      "priority_boost": 0,
      "last_failed_reason": null,
      "llm_order": 1
    }
  ],
  "failed_tasks": [
    {
      "task_id": "661a4d4d...",
      "task_type": "theory",
      "difficulty": 1,
      "base_duration_min": 60,
      "deadline": "2026-04-10T23:59:00Z",
      "source": "failed",
      "attempt_count": 2,
      "priority_boost": 3,
      "last_failed_reason": "F2",
      "llm_order": 2
    }
  ]
}
```

---

## API Reference

### Auth Routes
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login user |
| GET | `/api/auth/profile` | Yes | Get logged in user profile |

### LLM Routes
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/llm/decompose` | Yes | Decompose goal into tasks (supports file upload) |
| POST | `/api/llm/refine` | Yes | Refine tasks via conversation (max 6 turns) |

### Goal Routes
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/goals/confirm` | Yes | Save confirmed goal + tasks to MongoDB |
| GET | `/api/goals/my` | Yes | Get all goals for logged in user |
| GET | `/api/goals/stats/weekly` | Yes | Get weekly completion rate |
| GET | `/api/goals/:goalId` | Yes | Get single goal with its tasks |
| DELETE | `/api/goals/:goalId` | Yes | Delete goal (saves completion rate first) |

### Schedule Routes
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/schedule/today` | Yes | Get today's schedule |
| POST | `/api/schedule/regenerate` | Yes | Trigger schedule regeneration |
| POST | `/api/schedule/complete/:taskId` | Yes | Mark task as completed |
| POST | `/api/schedule/miss/:taskId` | Yes | Mark task as missed |
| POST | `/api/schedule/skip/:taskId` | Yes | Skip a task |

### Feedback Routes
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/feedback/submit` | Yes | Submit feedback after task completion |

---

## Redis Queue Reference

| Queue Name | Pushed By | Consumed By | Purpose |
|---|---|---|---|
| `rl_task_queue` | Node.js (goal confirm) | Python | New tasks from LLM decomposition |
| `schedule_queue` | Node.js (regenerate) | Python | Schedule regeneration requests |
| `rl_feedback_queue` | Node.js (feedback submit) | Python | User feedback for Q-table updates |

---

## MongoDB Collections Reference

| Collection | Managed By | Purpose |
|---|---|---|
| `users` | Node.js | User auth data |
| `goals` | Node.js | Goal headers |
| `tasks` | Node.js | Task details from LLM |
| `scheduledsessions` | Python (write) + Node.js (read) | Daily schedule + agent decisions |
| `qtable_duration` | Python only | Duration agent Q-values |
| `qtable_time` | Python only | Time agent Q-values |
| `qtable_break` | Python only | Break agent Q-values |
| `qtable_context_switch` | Python only | Context switch agent Q-values |

---

## Setup Instructions

### Backend

```bash
cd backend
npm install
cp .env.example .env
# fill in your keys in .env
npm run dev
```

### RL Engine

```bash
cd rl
pip install pymongo python-dotenv redis
cp .env.example .env
# fill in MONGODB_URI and REDIS_URL
python listen_test.py   # test Redis connection
python test_rl.py       # test full RL pipeline
```

### Environment Variables

**backend/.env**
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...
REDIS_URL=rediss://default:...@....upstash.io:6379
JWT_SECRET=your_secret_here
JWT_EXPIRES_IN=7d
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

**rl/.env**
```
MONGODB_URI=mongodb+srv://...
REDIS_URL=rediss://default:...@....upstash.io:6379
```

### Frontend

```bash
cd client
npm install
npm start
```

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| Schedule goes Backend → Frontend (not Python → Frontend) | Python is a background worker with no HTTP server. Frontend always pulls through Node.js |
| Conversation history stored in React state not MongoDB | Conversation is temporary — only final tasks are saved. Reduces DB writes |
| ScheduledSession stores all agent decisions | updater.py needs the exact state/action each agent used — must be stored when schedule is built |
| feedback is always an array | updater.py takes list[str] — user can submit multiple F-codes |
| Recurring tasks have no feedback | Habits are done/missed only — no RL update needed, no feedback form |
| fatigue is raw 1-10 in feedback | orchestrator.py and updater.py handle bucketing to 0/1/2 internally |
| interface.py is Node.js team's responsibility | Comment in file: "Jehan implements these two functions against MongoDB" |

