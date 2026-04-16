import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { decomposeGoal, confirmGoal } from '../services/api';
import toast from 'react-hot-toast';
import { Target, Calendar, Clock, Brain, ChevronRight, CheckCircle, ArrowLeft, Zap, FileText } from 'lucide-react';

export default function GoalPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [goalData, setGoalData] = useState({
        title: '',
        description: '',
        goalType: 'learning',
        deadline: '',
        hoursPerDay: 4,
    });
    const [tasks, setTasks] = useState([]);

    const handleDecompose = async () => {
        if (!goalData.title || !goalData.deadline) {
            toast.error('Please fill title and deadline');
            return;
        }

        setLoading(true);
        try {
            const data = await decomposeGoal({
                title: goalData.title,
                description: goalData.description,
                goalType: goalData.goalType,
                deadline: new Date(goalData.deadline).toISOString(),
                hoursPerDay: goalData.hoursPerDay,
            });
            setTasks(data.tasks);
            setStep(2);
            toast.success(`✨ Decomposed into ${data.tasks.length} tasks!`);
        } catch (error) {
            toast.error('Failed to decompose goal');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await confirmGoal(goalData, tasks);
            toast.success('🎉 Goal saved! Schedule is being generated...');
            setTimeout(() => navigate('/schedule'), 3000);
        } catch (error) {
            toast.error('Failed to save goal');
        } finally {
            setLoading(false);
        }
    };

    const goalTypes = [
        { value: 'learning', label: 'Learning', icon: '📚' },
        { value: 'exam_prep', label: 'Exam Prep', icon: '📝' },
        { value: 'project', label: 'Project', icon: '🚀' },
        { value: 'habit', label: 'Habit', icon: '⭐' },
    ];

    if (step === 1) {
        return (
            <div className="max-w-2xl mx-auto animate-slideIn">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--accent)] rounded-2xl mb-4">
                        <Target className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Create New Goal</h1>
                    <p className="text-[var(--text-secondary)]">Tell AI what you want to achieve</p>
                </div>

                <div className="card p-6">
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">What's your goal? *</label>
                            <input
                                type="text"
                                value={goalData.title}
                                onChange={(e) => setGoalData({ ...goalData, title: e.target.value })}
                                className="input"
                                placeholder="e.g., Master Data Structures & Algorithms"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Description (optional)
                            </label>
                            <textarea
                                rows="3"
                                value={goalData.description}
                                onChange={(e) => setGoalData({ ...goalData, description: e.target.value })}
                                className="input"
                                placeholder="Add more details about your goal..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Target Deadline *
                            </label>
                            <input
                                type="date"
                                value={goalData.deadline}
                                onChange={(e) => setGoalData({ ...goalData, deadline: e.target.value })}
                                className="input"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Goal Type</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {goalTypes.map((type) => (
                                    <button
                                        key={type.value}
                                        type="button"
                                        onClick={() => setGoalData({ ...goalData, goalType: type.value })}
                                        className={`px-4 py-2 rounded-lg font-medium transition-all ${goalData.goalType === type.value
                                                ? 'bg-[var(--accent)] text-white'
                                                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
                                            }`}
                                    >
                                        <span className="mr-2">{type.icon}</span>
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleDecompose}
                            disabled={loading}
                            className="w-full btn-primary flex items-center justify-center gap-2 py-3"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin-slow"></div>
                                    Analyzing your goal...
                                </>
                            ) : (
                                <>
                                    <Brain className="w-5 h-5" />
                                    Decompose Goal with AI
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto animate-slideIn">
            <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent)] mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to edit goal
            </button>

            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-2xl mb-4">
                    <CheckCircle className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Review AI Tasks</h1>
                <p className="text-[var(--text-secondary)]">Your goal has been broken down into manageable tasks</p>
            </div>

            <div className="card p-6">
                <div className="space-y-3 mb-6">
                    {tasks.map((task, idx) => (
                        <div key={idx} className="flex items-start gap-4 p-4 bg-[var(--bg-secondary)] rounded-lg">
                            <div className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center text-white font-bold text-sm">
                                {idx + 1}
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-[var(--text-primary)]">{task.title}</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                        {task.task_type}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded-full ${task.difficulty === 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                            task.difficulty === 1 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        }`}>
                                        {task.difficulty === 0 ? 'Easy' : task.difficulty === 1 ? 'Medium' : 'Hard'}
                                    </span>
                                    <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                                        {task.base_duration_min} min
                                    </span>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-[var(--accent)]" />
                        </div>
                    ))}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setStep(1)}
                        className="flex-1 btn-secondary"
                    >
                        Edit Goal
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className="flex-1 btn-primary flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin-slow"></div>
                                Generating...
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4" />
                                Confirm & Generate Schedule
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}