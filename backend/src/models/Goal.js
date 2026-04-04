const mongoose = require('mongoose')

const goalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Goal title is required'],
      trim: true,
      maxlength: [300, 'Title cannot exceed 300 characters']
    },
    goalType: {
      type: String,
      enum: ['learning', 'exam_prep', 'habit', 'project', 'fitness', 'other'],
      default: 'other'
    },
    deadline: {
      type: Date,
      default: null
    },
    hoursPerDay: {
      type: Number,
      default: 2,
      min: [0.5, 'Minimum 30 minutes per day'],
      max: [16, 'Maximum 16 hours per day']
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'abandoned'],
      default: 'active'
    },
    completionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    totalTasks: {
      type: Number,
      default: 0
    },
    completedTasks: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
)

goalSchema.index({ userId: 1, status: 1, createdAt: -1 })

module.exports = mongoose.model('Goal', goalSchema)