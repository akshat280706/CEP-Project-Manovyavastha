const mongoose = require('mongoose')

const taskSchema = new mongoose.Schema(
  {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [300, 'Title cannot exceed 300 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: ''
    },
    taskType: {
      type: String,
      enum: [
        'theory', 'coding', 'revision', 'practice',
        'reading', 'problem_solving', 'writing',
        'exercise', 'project_work', 'research',
        'listening'
      ],
      default: 'theory'
    },
    difficulty: {
      type: Number,
      enum: [0, 1, 2],
      default: 1
    },
    baseDurationMin: {
      type: Number,
      default: 30,
      min: 5,
      max: 480
    },
    priority: {
      type: Number,
      min: 1,
      max: 10,
      default: 5
    },
    orderIndex: {
      type: Number,
      default: 0
    },
    frequency: {
      type: String,
      enum: ['once', 'daily', 'weekly', 'near_deadline'],
      default: 'once'
    },
    repeatDays: {
      type: [Number],
      default: []
    },
    phase: {
      type: String,
      enum: ['foundation', 'development', 'intensive', 'maintenance'],
      default: 'foundation'
    },
    topicName: {
      type: String,
      trim: true,
      default: ''
    },
    dependsOn: {
      type: [Number],
      default: []
    },
    status: {
      type: String,
      enum: [
        'pending', 'scheduled', 'in_progress',
        'completed', 'failed', 'skipped', 'blocked', 'deleted'
      ],
      default: 'pending'
    },

    // RL fields — needed by orchestrator.py
    source: {
      type: String,
      enum: ['new', 'pending', 'failed', 'deleted'],
      default: 'new'
    },
    attemptCount: {
      type: Number,
      default: 0
    },
    lastFailedReason: {
      type: String,
      enum: ['F1', 'F2', 'F3', 'F4', 'F5', 'F8', null],
      default: null
    },

    // task buffer fields
    priorityBoost: {
      type: Number,
      default: 0
    },
    cooldownUntil: {
      type: Date,
      default: null
    },
    skipCount: {
      type: Number,
      default: 0
    },

    // filled when task completes
    actualDurationMin: {
      type: Number,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
)

taskSchema.index({ userId: 1, status: 1, priority: -1 })
taskSchema.index({ goalId: 1, orderIndex: 1 })
taskSchema.index({ userId: 1, frequency: 1, status: 1 })

module.exports = mongoose.model('Task', taskSchema)