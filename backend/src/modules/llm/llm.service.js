const groqClient = require('../../config/groq.js')
const logger = require('../../utils/logger.js')

const SYSTEM_PROMPT = `You are a task decomposition engine for MANOVYAVASTHA, a cognitive-aware productivity scheduler.

A user will give you their goal with context. Your job is to break it into 5-10 specific, actionable subtasks that can be scheduled across days.

STRICT RULES:
1. Return ONLY a valid JSON array. No explanation. No markdown. No extra text.
2. Detect goal type automatically:
   - HABIT goal → recurring daily tasks (frequency: daily)
   - EXAM/INTERVIEW → progressive tasks intensifying near deadline
   - PROJECT → milestone based with dependencies
   - LEARNING → structured topic by topic progression
   - FITNESS → daily/weekly exercise tasks
   - OTHER → use best judgment
3. Make tasks SPECIFIC to any material provided — not generic
4. Respect user's available hours per day when estimating durations
5. Assign dependencies logically — task 2 cannot start before task 1 if they are related
6. Near deadline tasks should have frequency: near_deadline and phase: intensive
7. topic_name should be the specific subject area the task covers

Return this EXACT JSON format with no deviations:
[
  {
    "title": "specific actionable title",
    "description": "exactly what to do in this session",
    "task_type": "theory|coding|revision|practice|reading|problem_solving|writing|exercise|project_work|research",
    "difficulty": 0,
    "base_duration_min": 45,
    "priority": 7,
    "order_index": 1,
    "frequency": "once|daily|weekly|near_deadline",
    "repeat_days": [],
    "phase": "foundation|development|intensive|maintenance",
    "depends_on": [],
    "topic_name": "specific subject area e.g. Graph Theory, Dynamic Programming"
  }
]

Field rules:
- difficulty: 0=easy, 1=medium, 2=hard
- priority: 1-10 (10 = most critical)
- repeat_days: [1,2,3,4,5,6,7] where 1=Monday, 7=Sunday
- depends_on: array of order_index values that must complete first. Empty = no dependency
- phase: foundation=early learning, development=building, intensive=deadline crunch, maintenance=daily habits
- topic_name: specific subject this task belongs to. Group related tasks under same topic_name`

const buildUserMessage = (goalData, material = null) => {
  let message = `Goal: ${goalData.title}`

  if (goalData.description) {
    message += `\nAdditional context: ${goalData.description}`
  }
  if (goalData.goalType) {
    message += `\nGoal type: ${goalData.goalType}`
  }
  if (goalData.deadline) {
    message += `\nDeadline: ${goalData.deadline}`
  }
  if (goalData.hoursPerDay) {
    message += `\nAvailable hours per day: ${goalData.hoursPerDay} hours`
  }
  if (material) {
    if (material.type === 'text') {
      message += `\n\nStudy material provided:\n---\n${material.content}\n---\nCreate tasks specifically based on this material.`
    } else if (material.type === 'image') {
      message += `\n\nThe user has uploaded an image of their study material. Analyze it and create tasks based on its content.`
    }
  }

  return message
}

const parseTasksFromResponse = (content) => {
  try {
    const cleaned = content
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/gi, '')
      .trim()

    const tasks = JSON.parse(cleaned)

    if (!Array.isArray(tasks)) {
      throw new Error('LLM response is not an array')
    }
    if (tasks.length === 0) {
      throw new Error('LLM returned empty task list')
    }

    const validated = tasks.map((task, index) => ({
      title:             task.title || `Task ${index + 1}`,
      description:       task.description || '',
      task_type:         task.task_type || 'theory',
      difficulty:        [0, 1, 2].includes(Number(task.difficulty)) ? Number(task.difficulty) : 1,
      base_duration_min: Number(task.base_duration_min) || 30,
      priority:          Math.min(10, Math.max(1, Number(task.priority) || 5)),
      order_index:       Number(task.order_index) || index + 1,
      frequency:         ['once', 'daily', 'weekly', 'near_deadline'].includes(task.frequency)
                           ? task.frequency : 'once',
      repeat_days:       Array.isArray(task.repeat_days) ? task.repeat_days : [],
      phase:             ['foundation', 'development', 'intensive', 'maintenance'].includes(task.phase)
                           ? task.phase : 'foundation',
      depends_on:        Array.isArray(task.depends_on) ? task.depends_on : [],
      topic_name:        task.topic_name || ''
    }))

    logger.info(`LLM returned ${validated.length} valid tasks`)
    return validated

  } catch (err) {
    logger.error(`Failed to parse LLM response: ${err.message}`)
    logger.error(`Raw LLM output: ${content?.substring(0, 500)}`)
    throw new Error('LLM returned invalid format. Please try again.')
  }
}

const decomposeGoal = async (goalData, material = null) => {
  logger.info(`Decomposing goal: "${goalData.title}"`)

  const userMessage = buildUserMessage(goalData, material)
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage }
  ]

  if (material?.type === 'image') {
    messages[messages.length - 1] = {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${material.mimetype};base64,${material.base64}` }
        },
        { type: 'text', text: userMessage }
      ]
    }
  }

  const response = await groqClient.chat.completions.create({
    model:       process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.3,
    max_tokens:  3000
  })

  const content = response.choices[0].message.content
  return parseTasksFromResponse(content)
}

const refineGoal = async (conversationHistory, newMessage, material = null) => {
  const turnNumber = Math.ceil(conversationHistory.length / 2) + 1
  logger.info(`Refining goal — turn ${turnNumber}`)

  let fullNewMessage = newMessage
  if (material?.type === 'text') {
    fullNewMessage += `\n\nAdditional material uploaded:\n---\n${material.content}\n---`
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: fullNewMessage }
  ]

  const response = await groqClient.chat.completions.create({
    model:       process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.3,
    max_tokens:  3000
  })

  const assistantContent = response.choices[0].message.content
  const tasks = parseTasksFromResponse(assistantContent)

  return {
    tasks,
    assistantMessage: {
      role:    'assistant',
      content: assistantContent
    }
  }
}

module.exports = { decomposeGoal, refineGoal }