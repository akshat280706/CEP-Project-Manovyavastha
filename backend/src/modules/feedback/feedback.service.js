const ScheduledSession = require('../../models/ScheduleSession.js')
const Task             = require('../../models/Task.js')
const logger           = require('../../utils/logger.js')

const FEEDBACK_ROUTING = {
  F1: { primary: 'duration',        secondary: null },
  F2: { primary: 'break',           secondary: 'time' },
  F3: { primary: 'time',            secondary: null },
  F4: { primary: 'duration',        secondary: null },
  F5: { primary: 'break',           secondary: 'context_switch' },
  F8: { primary: 'context_switch',  secondary: null },
}

const submitFeedback = async (userId, taskId, feedbackData, redisClient) => {
  const { outcome, feedback, actualDurationMin, fatigueAfter } = feedbackData

  // feedback must always be an array
  const feedbackArray = Array.isArray(feedback) ? feedback : []

  const task = await Task.findOne({ _id: taskId, userId })
  if (!task) {
    const err = new Error('Task not found')
    err.statusCode = 404
    throw err
  }

  if (task.frequency === 'daily' || task.frequency === 'weekly') {
    const err = new Error('Recurring tasks do not require feedback')
    err.statusCode = 400
    throw err
  }

  // load the scheduled session — contains all agent states and actions
  const session = await ScheduledSession.findOne({
    taskId: taskId,
    userId: userId,
    status: { $in: ['scheduled', 'in_progress', 'completed'] }
  })

  if (!session) {
    const err = new Error('No scheduled session found for this task')
    err.statusCode = 404
    throw err
  }

  // build exact payload updater.py update() expects
  const rlPayload = {
    user_id: userId.toString(),

    duration_state: {
      task_type:         session.durationState.taskType,
      difficulty:        session.durationState.difficulty,
      deadline_pressure: session.durationState.deadlinePressure
    },
    time_state: {
      hour_block: session.timeState.hourBlock,
      task_type:  session.timeState.taskType
    },
    break_state: {
      fatigue_level:                session.breakState.fatigueLevelBefore,
      consecutive_minutes_bucket:   session.breakState.consecutiveMinutesBucket,
      prev_task_type:               session.breakState.prevTaskType,
      next_task_type:               session.breakState.nextTaskType,
      next_task_difficulty:         session.breakState.nextTaskDifficulty
    },
    context_switch_state: {
      prev_task_type:   session.contextSwitchState.prevTaskType,
      next_task_type:   session.contextSwitchState.nextTaskType,
      session_position: session.contextSwitchState.sessionPosition
    },

    duration_action:       session.durationAction,
    time_action:           session.timeAction,
    break_action:          session.breakAction,
    context_switch_action: session.contextSwitchAction,

    outcome,
    actual_duration_min:    actualDurationMin || null,
    scheduled_duration_min: session.scheduledDurationMin,

    // raw 1-10 as updater.py expects
    fatigue_before: session.fatigueBefore,
    fatigue_after:  fatigueAfter,

    // array of F-codes — updater.py _validate_feedback() expects list
    feedback: feedbackArray
  }

  // push to Redis — Python wakes up instantly
  await redisClient.lpush('rl_feedback_queue', JSON.stringify(rlPayload))

  // update session record
  await ScheduledSession.findByIdAndUpdate(session._id, {
    outcome,
    actualDurationMin: actualDurationMin || null,
    fatigueAfter,
    feedback:          feedbackArray,
    status:            outcome,
    rlProcessed:       false  // Python will flip this to true after processing
  })

  // update task if not already done
  if (outcome === 'failed' || outcome === 'skipped') {
    await Task.findByIdAndUpdate(taskId, {
      lastFailedReason: feedbackArray[0] || null,
      attemptCount:     task.attemptCount + 1,
      source:           'failed'
    })
  }

  logger.info(`Feedback pushed to rl_feedback_queue — task: ${taskId}, outcome: ${outcome}`)

  return {
    message:       'Feedback submitted',
    agentsUpdating: feedbackArray.map(f => FEEDBACK_ROUTING[f]?.primary).filter(Boolean)
  }
}

module.exports = { submitFeedback }