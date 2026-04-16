// const ScheduledSession = require('../../models/ScheduleSession.js')
// const Task = require('../../models/Task.js')
// const logger = require('../../utils/logger.js')

// const FEEDBACK_ROUTING = {
//   F1: { primary: 'duration', secondary: null },
//   F2: { primary: 'break', secondary: 'time' },
//   F3: { primary: 'time', secondary: null },
//   F4: { primary: 'duration', secondary: null },
//   F5: { primary: 'break', secondary: 'context_switch' },
//   F8: { primary: 'context_switch', secondary: null },
// }

// const submitFeedback = async (userId, taskId, feedbackData, redisClient) => {
//   const { outcome, feedback, actualDurationMin, fatigueAfter } = feedbackData

//   const feedbackArray = Array.isArray(feedback) ? feedback : []

//   const task = await Task.findOne({ _id: taskId, userId })
//   if (!task) {
//     const err = new Error('Task not found')
//     err.statusCode = 404
//     throw err
//   }

//   // Only allow feedback for failed tasks (per new design)
//   if (outcome !== 'failed') {
//     logger.info(`Feedback only processed for failed tasks. Received: ${outcome}`)
//     return { message: 'Feedback only for failed tasks', agentsUpdating: [] }
//   }

//   // Load the scheduled session - contains all agent states and actions
//   const session = await ScheduledSession.findOne({
//     taskId: taskId,
//     userId: userId,
//     status: { $in: ['scheduled', 'in_progress', 'failed'] }
//   })

//   if (!session) {
//     // For failed tasks, we can still send feedback with default values
//     logger.info(`No session found for failed task ${taskId}, using default values`)

//     const rlPayload = {
//       user_id: userId.toString(),
//       duration_state: {
//         task_type: task.taskType,
//         difficulty: task.difficulty,
//         deadline_pressure: 1
//       },
//       time_state: {
//         hour_block: 2,
//         task_type: task.taskType
//       },
//       break_state: {
//         fatigue_level: 1,
//         consecutive_minutes_bucket: 0,
//         prev_task_type: 'none',
//         next_task_type: task.taskType,
//         next_task_difficulty: task.difficulty
//       },
//       context_switch_state: {
//         prev_task_type: 'none',
//         next_task_type: task.taskType,
//         session_position: 0
//       },
//       duration_action: '1.0x',
//       time_action: 'block_2',
//       break_action: 'no_break',
//       context_switch_action: 'switch_now',
//       outcome,
//       actual_duration_min: null,
//       scheduled_duration_min: task.baseDurationMin,
//       fatigue_before: 3,
//       fatigue_after: fatigueAfter || 5,
//       feedback: feedbackArray
//     }

//     await redisClient.lpush('rl_feedback_queue', JSON.stringify(rlPayload))
//     logger.info(`Feedback pushed for failed task ${taskId} (no session found)`)

//     await Task.findByIdAndUpdate(taskId, {
//       lastFailedReason: feedbackArray[0] || null,
//       attemptCount: task.attemptCount + 1,
//       source: 'failed'
//     })

//     return { message: 'Feedback submitted', agentsUpdating: feedbackArray.map(f => FEEDBACK_ROUTING[f]?.primary).filter(Boolean) }
//   }

//   // Build exact payload updater.py update() expects
//   const rlPayload = {
//     user_id: userId.toString(),

//     duration_state: {
//       task_type: session.durationState.taskType,
//       difficulty: session.durationState.difficulty,
//       deadline_pressure: session.durationState.deadlinePressure
//     },
//     time_state: {
//       hour_block: session.timeState.hourBlock,
//       task_type: session.timeState.taskType
//     },
//     break_state: {
//       fatigue_level: session.breakState.fatigueLevelBefore,
//       consecutive_minutes_bucket: session.breakState.consecutiveMinutesBucket,
//       prev_task_type: session.breakState.prevTaskType,
//       next_task_type: session.breakState.nextTaskType,
//       next_task_difficulty: session.breakState.nextTaskDifficulty
//     },
//     context_switch_state: {
//       prev_task_type: session.contextSwitchState.prevTaskType,
//       next_task_type: session.contextSwitchState.nextTaskType,
//       session_position: session.contextSwitchState.sessionPosition
//     },

//     duration_action: session.durationAction,
//     time_action: session.timeAction,
//     break_action: session.breakAction,
//     context_switch_action: session.contextSwitchAction,

//     outcome,
//     actual_duration_min: null,
//     scheduled_duration_min: session.scheduledDurationMin,

//     fatigue_before: session.fatigueBefore,
//     fatigue_after: fatigueAfter,

//     feedback: feedbackArray
//   }

//   // Push to Redis
//   await redisClient.lpush('rl_feedback_queue', JSON.stringify(rlPayload))

//   // Update session record
//   await ScheduledSession.findByIdAndUpdate(session._id, {
//     outcome,
//     actualDurationMin: null,
//     fatigueAfter,
//     feedback: feedbackArray,
//     status: outcome,
//     rlProcessed: false
//   })

//   // Update task
//   await Task.findByIdAndUpdate(taskId, {
//     lastFailedReason: feedbackArray[0] || null,
//     attemptCount: task.attemptCount + 1,
//     source: 'failed'
//   })

//   logger.info(`Feedback pushed to rl_feedback_queue — task: ${taskId}, outcome: ${outcome}`)

//   return {
//     message: 'Feedback submitted',
//     agentsUpdating: feedbackArray.map(f => FEEDBACK_ROUTING[f]?.primary).filter(Boolean)
//   }
// }

// module.exports = { submitFeedback }

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

  const feedbackArray = Array.isArray(feedback) ? feedback : []

  const task = await Task.findOne({ _id: taskId, userId })
  if (!task) {
    const err = new Error('Task not found')
    err.statusCode = 404
    throw err
  }

  // Allow BOTH completed and failed tasks
  if (outcome !== 'failed' && outcome !== 'completed') {
    logger.info(`Feedback only processed for failed or completed tasks. Received: ${outcome}`)
    return { message: 'Feedback only for failed/completed tasks', agentsUpdating: [] }
  }

  // Load the scheduled session - contains all agent states and actions
  const session = await ScheduledSession.findOne({
    taskId: taskId,
    userId: userId,
    status: { $in: ['scheduled', 'in_progress', 'completed', 'failed'] }
  })

  if (!session) {
    // If no session found, use default values
    logger.info(`No session found for task ${taskId}, using default values`)
    
    const rlPayload = {
      user_id: userId.toString(),
      duration_state: {
        task_type: task.taskType,
        difficulty: task.difficulty,
        deadline_pressure: 1
      },
      time_state: {
        hour_block: 2,
        task_type: task.taskType
      },
      break_state: {
        fatigue_level: 1,
        consecutive_minutes_bucket: 0,
        prev_task_type: 'none',
        next_task_type: task.taskType,
        next_task_difficulty: task.difficulty
      },
      context_switch_state: {
        prev_task_type: 'none',
        next_task_type: task.taskType,
        session_position: 0
      },
      duration_action: '1.0x',
      time_action: 'block_2',
      break_action: 'no_break',
      context_switch_action: 'switch_now',
      outcome,
      actual_duration_min: actualDurationMin || null,
      scheduled_duration_min: task.baseDurationMin,
      fatigue_before: 3,
      fatigue_after: fatigueAfter || 5,
      feedback: feedbackArray
    }

    await redisClient.lpush('rl_feedback_queue', JSON.stringify(rlPayload))
    logger.info(`Feedback pushed for ${outcome} task ${taskId} (no session found)`)

    if (outcome === 'failed') {
      await Task.findByIdAndUpdate(taskId, {
        lastFailedReason: feedbackArray[0] || null,
        attemptCount: task.attemptCount + 1,
        source: 'failed'
      })
    }

    return { message: 'Feedback submitted', agentsUpdating: feedbackArray.map(f => FEEDBACK_ROUTING[f]?.primary).filter(Boolean) }
  }

  // Build exact payload updater.py update() expects
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
    actual_duration_min: actualDurationMin || null,
    scheduled_duration_min: session.scheduledDurationMin,

    fatigue_before: session.fatigueBefore || 3,
    fatigue_after:  fatigueAfter || 5,

    feedback: feedbackArray
  }

  // Push to Redis
  await redisClient.lpush('rl_feedback_queue', JSON.stringify(rlPayload))

  // Update session record
  await ScheduledSession.findByIdAndUpdate(session._id, {
    outcome,
    actualDurationMin: actualDurationMin || null,
    fatigueAfter: fatigueAfter || 5,
    feedback: feedbackArray,
    status: outcome,
    rlProcessed: false
  })

  // Update task if failed
  if (outcome === 'failed') {
    await Task.findByIdAndUpdate(taskId, {
      lastFailedReason: feedbackArray[0] || null,
      attemptCount: task.attemptCount + 1,
      source: 'failed'
    })
  }

  logger.info(`Feedback pushed to rl_feedback_queue — task: ${taskId}, outcome: ${outcome}`)

  return {
    message: 'Feedback submitted',
    agentsUpdating: feedbackArray.map(f => FEEDBACK_ROUTING[f]?.primary).filter(Boolean)
  }
}

module.exports = { submitFeedback }