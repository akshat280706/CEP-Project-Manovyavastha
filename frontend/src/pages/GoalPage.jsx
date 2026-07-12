import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { decomposeGoal, confirmGoal, refineGoal } from '../services/api';
import toast from 'react-hot-toast';
import { Target, Calendar, Clock, Brain, ChevronRight, CheckCircle, ArrowLeft, Zap, FileText, Upload, X, Send, MessageSquare } from 'lucide-react';

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

    // FIX: file upload was fully wired on the backend (pdfExtractor.js,
    // Groq vision path) but had no UI at all.
    const [selectedFile, setSelectedFile] = useState(null);

    // FIX: /llm/refine had a full backend implementation but no UI to
    // ever call it.
    const [conversationHistory, setConversationHistory] = useState([]);
    const [showRefine, setShowRefine] = useState(false);
    const [refineMessages, setRefineMessages] = useState([]); // for display only
    const [refineInput, setRefineInput] = useState('');
    const [refineFile, setRefineFile] = useState(null);
    const [turnCount, setTurnCount] = useState(0);
    const [turnsRemaining, setTurnsRemaining] = useState(6);
    const [refining, setRefining] = useState(false);

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const validTypes = ['application/pdf', 'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg', 'image/png'];
        if (!validTypes.includes(file.type)) {
            toast.error('Please upload a PDF, DOCX, TXT, JPEG, or PNG file');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('File must be under 10MB');
            return;
        }
        setSelectedFile(file);
    };

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
            }, selectedFile);
            setTasks(data.tasks);
            setConversationHistory(data.conversationHistory || []);
            setTurnCount(0);
            setTurnsRemaining(6);
            setRefineMessages([]);
            setStep(2);
            toast.success(`✨ Decomposed into ${data.tasks.length} tasks!`);
        } catch (error) {
            toast.error('Failed to decompose goal');
        } finally {
            setLoading(false);
        }
    };

    const handleRefine = async () => {
        if (!refineInput.trim()) return;
        if (turnsRemaining <= 0) {
            toast.error('Maximum refinement turns reached — please confirm your tasks.');
            return;
        }

        const userMsg = refineInput.trim();
        setRefineMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
        setRefineInput('');
        setRefining(true);

        try {
            const data = await refineGoal(conversationHistory, userMsg, turnCount, refineFile);
            setTasks(data.tasks);
            setRefineMessages((prev) => [...prev, { role: 'assistant', content: data.assistantMessage }]);
            setConversationHistory((prev) => [
                ...prev,
                { role: 'user', content: userMsg },
                { role: 'assistant', content: data.assistantMessage },
            ]);
            setTurnCount((prev) => prev + 1);
            setTurnsRemaining(data.turnsRemaining);
            setRefineFile(null);
            toast.success('Tasks updated!');
        } catch (error) {
            toast.error('Failed to refine tasks');
        } finally {
            setRefining(false);
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
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                                <Upload className="w-4 h-4" />
                                Upload study material (optional)
                            </label>
                            {selectedFile ? (
                                <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
                                    <span className="text-sm text-[var(--text-primary)] truncate">{selectedFile.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFile(null)}
                                        className="text-[var(--text-secondary)] hover:text-red-500"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[var(--border)] rounded-lg cursor-pointer hover:border-[var(--accent)] transition-colors text-sm text-[var(--text-secondary)]">
                                    <Upload className="w-4 h-4" />
                                    PDF, DOCX, TXT, or an image of your notes
                                    <input
                                        type="file"
                                        accept=".pdf,.docx,.txt,image/jpeg,image/png"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                </label>
                            )}
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

                <button
                    type="button"
                    onClick={() => setShowRefine((v) => !v)}
                    className="w-full flex items-center justify-center gap-2 py-2 mb-4 text-sm text-[var(--accent)] hover:underline"
                >
                    <MessageSquare className="w-4 h-4" />
                    {showRefine ? 'Hide' : 'Refine with AI'} ({turnsRemaining} turns left)
                </button>

                {showRefine && (
                    <div className="mb-6 border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-secondary)]">
                        {refineMessages.length > 0 && (
                            <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
                                {refineMessages.map((msg, i) => (
                                    <div
                                        key={i}
                                        className={`text-sm p-2 rounded-lg ${msg.role === 'user'
                                                ? 'bg-[var(--accent)] text-white ml-8'
                                                : 'bg-[var(--bg-primary)] text-[var(--text-primary)] mr-8'
                                            }`}
                                    >
                                        {msg.content}
                                    </div>
                                ))}
                            </div>
                        )}

                        {refineFile && (
                            <div className="flex items-center justify-between p-2 mb-2 bg-[var(--bg-primary)] rounded text-xs">
                                <span className="truncate">{refineFile.name}</span>
                                <button type="button" onClick={() => setRefineFile(null)}>
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <label className="flex items-center px-3 border border-[var(--border)] rounded-lg cursor-pointer hover:border-[var(--accent)]">
                                <Upload className="w-4 h-4 text-[var(--text-secondary)]" />
                                <input
                                    type="file"
                                    accept=".pdf,.docx,.txt,image/jpeg,image/png"
                                    onChange={(e) => e.target.files?.[0] && setRefineFile(e.target.files[0])}
                                    className="hidden"
                                />
                            </label>
                            <input
                                type="text"
                                value={refineInput}
                                onChange={(e) => setRefineInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !refining && handleRefine()}
                                placeholder="e.g., split task 3 into two smaller tasks"
                                className="input flex-1"
                                disabled={refining || turnsRemaining <= 0}
                            />
                            <button
                                onClick={handleRefine}
                                disabled={refining || turnsRemaining <= 0 || !refineInput.trim()}
                                className="btn-primary px-4 flex items-center justify-center"
                            >
                                {refining ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin-slow"></div>
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>
                )}

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