const mongoose = require('mongoose')

const scheduledSessionSchema = new mongoose.Schema(
  {
    taskId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Task',  required: true },
    goalId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Goal',  required: true },
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },

    scheduledDate:        { type: Date,   required: true },
    startTime:            { type: Date,   required: true },
    endTime:              { type: Date,   required: true },
    scheduledDurationMin: { type: Number, required: true },
    breakDurationMin:     { type: Number, default: 0 },

    // Duration agent decision
    durationAction: String,
    durationState: {
      taskType:         String,
      difficulty:       Number,
      deadlinePressure: Number
    },

    // Time agent decision
    timeAction: String,
    timeState: {
      hourBlock: Number,
      taskType:  String
    },

    // Break agent decision
    breakAction: String,
    breakState: {
      fatigueLevelBefore:          Number,
      consecutiveMinutesBucket:    Number,
      prevTaskType:                String,
      nextTaskType:                String,
      nextTaskDifficulty:          Number
    },

    // Context switch agent decision
    contextSwitchAction: String,
    contextSwitchState: {
      prevTaskType:    String,
      nextTaskType:    String,
      sessionPosition: Number
    },

    // raw 1-10 as updater.py expects
    fatigueBefore: { type: Number, default: null },
    fatigueAfter:  { type: Number, default: null },

    // filled when user marks task
    outcome: {
      type: String,
      enum: ['completed', 'failed', 'skipped', null],
      default: null
    },
    actualDurationMin: { type: Number, default: null },

    // array — updater.py takes list[str]
    feedback: {
      type: [String],
      default: []
    },

    status: {
      type: String,
      enum: ['scheduled', 'in_progress', 'completed', 'failed', 'skipped'],
      default: 'scheduled'
    },

    rlProcessed: { type: Boolean, default: false }
  },
  { timestamps: true }
)

scheduledSessionSchema.index({ userId: 1, scheduledDate: 1 })
scheduledSessionSchema.index({ taskId: 1 })
scheduledSessionSchema.index({ userId: 1, rlProcessed: 1 })

module.exports = mongoose.model('ScheduledSession', scheduledSessionSchema)