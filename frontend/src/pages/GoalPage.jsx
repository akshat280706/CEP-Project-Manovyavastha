import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { decomposeGoal, confirmGoal } from '../services/api';
import toast from 'react-hot-toast';
import { Target, Calendar, Clock, Sparkles, ChevronRight, CheckCircle, ArrowLeft, Brain, Zap, FileText } from 'lucide-react';

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
        { value: 'learning', label: 'Learning', icon: '📚', color: '#00FFFF' },
        { value: 'exam_prep', label: 'Exam Prep', icon: '📝', color: '#FF3366' },
        { value: 'project', label: 'Project', icon: '🚀', color: '#00FF88' },
        { value: 'habit', label: 'Habit', icon: '⭐', color: '#FFCC00' },
    ];

    if (step === 1) {
        return (
            <div className="max-w-2xl mx-auto animate-slideIn">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-[#00FFFF] to-[#FF00FF] rounded-2xl shadow-[0_0_30px_#00FFFF] mx-auto mb-4 animate-float">
                        <Target className="w-8 h-8 text-[#0A0A0F]" />
                    </div>
                    <h1 className="text-3xl font-bold gradient-text mb-2">Create New Goal</h1>
                    <p className="text-[#888]">Tell AI what you want to achieve</p>
                </div>

                <div className="glass-card p-6">
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-[#AAA] mb-2">What's your goal? *</label>
                            <input
                                type="text"
                                value={goalData.title}
                                onChange={(e) => setGoalData({ ...goalData, title: e.target.value })}
                                className="input-neon"
                                placeholder="e.g., Master Data Structures & Algorithms"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[#AAA] mb-2 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Description (optional)
                            </label>
                            <textarea
                                rows="3"
                                value={goalData.description}
                                onChange={(e) => setGoalData({ ...goalData, description: e.target.value })}
                                className="input-neon"
                                placeholder="Add more details about your goal..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[#AAA] mb-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Target Deadline *
                            </label>
                            <input
                                type="date"
                                value={goalData.deadline}
                                onChange={(e) => setGoalData({ ...goalData, deadline: e.target.value })}
                                className="input-neon"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[#AAA] mb-2">Goal Type</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {goalTypes.map((type) => (
                                    <button
                                        key={type.value}
                                        type="button"
                                        onClick={() => setGoalData({ ...goalData, goalType: type.value })}
                                        className={`px-4 py-2 rounded-xl font-medium transition-all ${goalData.goalType === type.value
                                            ? 'bg-gradient-to-r from-[#00FFFF] to-[#FF00FF] text-[#0A0A0F] shadow-[0_0_15px_#00FFFF]'
                                            : 'bg-[#1A1A2E] border border-[#00FFFF]/20 text-[#AAA] hover:border-[#00FFFF]/50'
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
                            className="w-full btn-cyan flex items-center justify-center gap-2 py-3"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-[#0A0A0F] border-t-transparent rounded-full animate-spin"></div>
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
                className="flex items-center gap-2 text-[#888] hover:text-[#00FFFF] mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to edit goal
            </button>

            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-[#00FF88] to-[#00FFFF] rounded-2xl shadow-[0_0_30px_#00FF88] mx-auto mb-4 animate-float">
                    <CheckCircle className="w-8 h-8 text-[#0A0A0F]" />
                </div>
                <h1 className="text-3xl font-bold gradient-text mb-2">Review AI Tasks</h1>
                <p className="text-[#888]">Your goal has been broken down into manageable tasks</p>
            </div>

            <div className="glass-card p-6">
                <div className="space-y-3 mb-6">
                    {tasks.map((task, idx) => (
                        <div key={idx} className="flex items-start gap-4 p-4 bg-[#1A1A2E] rounded-xl border border-[#00FFFF]/10">
                            <div className="w-8 h-8 bg-gradient-to-r from-[#00FFFF] to-[#FF00FF] rounded-lg flex items-center justify-center text-[#0A0A0F] font-bold text-sm">
                                {idx + 1}
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-white">{task.title}</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    <span className="text-xs px-2 py-1 bg-[#00FFFF]/20 text-[#00FFFF] rounded-full">
                                        {task.task_type}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded-full ${task.difficulty === 0 ? 'bg-[#00FF88]/20 text-[#00FF88]' :
                                        task.difficulty === 1 ? 'bg-[#FFCC00]/20 text-[#FFCC00]' :
                                            'bg-[#FF3366]/20 text-[#FF3366]'
                                        }`}>
                                        {task.difficulty === 0 ? 'Easy' : task.difficulty === 1 ? 'Medium' : 'Hard'}
                                    </span>
                                    <span className="text-xs px-2 py-1 bg-[#1A1A2E] text-[#888] rounded-full border border-[#00FFFF]/20">
                                        {task.base_duration_min} min
                                    </span>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-[#00FFFF]" />
                        </div>
                    ))}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setStep(1)}
                        className="flex-1 btn-outline"
                    >
                        Edit Goal
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className="flex-1 btn-green flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-[#0A0A0F] border-t-transparent rounded-full animate-spin"></div>
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