#Manovyavastha

**Cognitive-Aware Task Scheduling System using AI + Reinforcement Learning**

---

##Overview

Manovyavastha is an intelligent task scheduling system that adapts to a user’s cognitive behavior over time.
It uses **LLM-based task decomposition** and **Reinforcement Learning (RL)** to generate personalized schedules based on fatigue, performance, and feedback.

---

##Key Features

* 🔹 AI-based task decomposition (LLM)
* 🔹 Reinforcement Learning-based scheduling
* 🔹 Cognitive feedback integration (fatigue, success/failure)
* 🔹 Adaptive schedule regeneration
* 🔹 Redis queue + Python worker architecture
* 🔹 Full-stack implementation (React + Node.js + MongoDB)

---

#Backend Architecture

## 📁 Structure

```
backend/
│
├── server.js
├── package.json
│
└── src/
    ├── config/
    │   ├── db.js
    │   ├── redis.js
    │   └── swagger.js
    │
    ├── middleware/
    │   ├── auth.middleware.js
    │   └── error.middleware.js
    │
    ├── utils/
    │   └── logger.js
    │
    ├── modules/
    │   ├── auth/
    │   │   ├── auth.controller.js
    │   │   ├── auth.service.js
    │   │   ├── auth.routes.js
    │   │   └── user.model.js
    │
    │   ├── llm/
    │   │   ├── llm.controller.js
    │   │   ├── llm.service.js
    │   │   └── llm.routes.js
    │
    │   ├── goals/
    │   │   ├── goal.controller.js
    │   │   ├── goal.service.js
    │   │   ├── goal.routes.js
    │   │   └── goal.model.js
    │
    │   ├── schedule/
    │   │   ├── schedule.controller.js
    │   │   ├── schedule.service.js
    │   │   ├── schedule.routes.js
    │   │   └── schedule.model.js
    │
    │   └── feedback/
    │       ├── feedback.controller.js
    │       ├── feedback.service.js
    │       └── feedback.routes.js
```

---

##Backend Workflow

```
User → API → Node.js → Redis Queue → Python RL Worker → MongoDB → Response
```

###Flow Explanation
1. User creates a goal
2. LLM decomposes goal into tasks
3. Tasks are pushed to Redis queue
4. Python RL worker:

   * selects order (Selector)
   * decides duration (Duration Agent)
   * schedules breaks (Break Agent)
5. Schedule is stored in MongoDB
6. User gives feedback → RL updates policy
7. New schedule is generated

---

##Reinforcement Learning System

Located in:

```
rl/
├── agents.py
├── worker.py
├── qtable updates
```

### Components:

* **Duration Agent** → decides task duration
* **Break Agent** → inserts optimal breaks
* **Selector** → orders tasks based on:

  * fatigue
  * deadlines
  * retry priority
  * context switching

---

#Frontend Architecture

## 📁 Structure

```
frontend/
│
├── public/
├── node_modules/
│
└── src/
    ├── App.js
    ├── App.css
    ├── pages/
    │   ├── LoginPage.jsx
    │   ├── RegisterPage.jsx
    │   ├── DashboardPage.jsx
    │   ├── GoalPage.jsx
    │   ├── GoalsListPage.jsx
    │   ├── SchedulePage.jsx
    │   └── CalendarPage.jsx
    │
    └── services/
        └── API service handlers
```

---

## 🖥️ Frontend Pages

| Page          | Purpose             |
| ------------- | ------------------- |
| LoginPage     | User authentication |
| RegisterPage  | Create new user     |
| DashboardPage | Overview            |
| GoalPage      | Create goals        |
| GoalsListPage | View goals          |
| SchedulePage  | Daily schedule      |
| CalendarPage  | Visual calendar     |

---

## Frontend ↔ Backend

* Uses REST APIs (`/api/*`)
* JWT authentication
* Axios for API calls

---

# Technologies Used

### Backend

* Node.js
* Express.js
* MongoDB (Mongoose)
* Redis

### Frontend

* React.js
* Context API
* Axios

### AI / ML

* LLM (task decomposition)
* Reinforcement Learning (custom implementation in Python)

---

# Running the Project

## Backend

```bash
cd backend
npm install
npm run dev
```

## Python RL Worker

```bash
cd rl
python main.py
```

## Frontend

```bash
cd frontend
npm install
npm start
```

---

# Demo Flow
1. Register new user
2. Create goal
3. Generate schedule
4. Provide feedback (fatigue, completion)
5. Regenerate schedule
6. Observe adaptive changes

---

# Contributors

* [Bhavya Gothi](https://github.com/Bhavya4523)
* [Jehan Bheda](https://github.com/jehanbheda)
* [Aryan Daga](https://github.com/dagaaryan011)
* [Akshat Chauhan](https://github.com/akshat280706)

---

**Made by MANOVYAVASTHA TEAM **
