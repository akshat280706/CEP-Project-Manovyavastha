import { useState, useEffect, useRef } from 'react';
import { getTodaySchedule, regenerateSchedule, completeTask, missTask, skipTask, submitFeedback } from '../services/api';
import toast from 'react-hot-toast';
import { Calendar, RefreshCw, Clock, CheckCircle, XCircle, SkipForward, TrendingUp, Award, Zap, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

// Confetti Component
function Confetti({ active }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!active) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

        for (let i = 0; i < 150; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -20,
                size: Math.random() * 6 + 3,
                speedY: Math.random() * 6 + 3,
                speedX: (Math.random() - 0.5) * 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 8,
            });
        }

        let animationId;
        let startTime = Date.now();

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let allDone = true;
            for (let p of particles) {
                if (p.y < canvas.height) {
                    allDone = false;
                    p.y += p.speedY;
                    p.x += p.speedX;
                    p.rotation += p.rotationSpeed;

                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation * Math.PI / 180);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                    ctx.restore();
                }
            }

            if (!allDone && Date.now() - startTime < 2500) {
                animationId = requestAnimationFrame(animate);
            }
        }

        animate();

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [active]);

    if (!active) return null;
    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" />;
}

// Feedback options for fail/skip
const FEEDBACK_OPTIONS = {
    failed: [
        { code: 'F1', label: 'Task was too difficult', icon: '😓' },
        { code: 'F2', label: 'Was too tired / fatigued', icon: '😴' },
        { code: 'F3', label: 'Didn\'t have enough time', icon: '⏰' },
        { code: 'F4', label: 'Got distracted', icon: '📱' },
        { code: 'F5', label: 'Task took longer than expected', icon: '🐌' },
        { code: 'F8', label: 'Switching context was hard', icon: '🔄' },
    ],
    skipped: [
        { code: 'F1', label: 'Task seems too difficult', icon: '😓' },
        { code: 'F2', label: 'Feeling too tired', icon: '😴' },
        { code: 'F3', label: 'Not enough time right now', icon: '⏰' },
        { code: 'F4', label: 'Not in the right mindset', icon: '🧠' },
        { code: 'F5', label: 'Previous task took longer', icon: '🐌' },
        { code: 'F8', label: 'Hard to switch from previous task', icon: '🔄' },
    ]
};

export default function SchedulePage() {
    const [schedule, setSchedule] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(null);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [selectedAction, setSelectedAction] = useState(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [animateTaskId, setAnimateTaskId] = useState(null);
    const [feedbackData, setFeedbackData] = useState({
        actualDuration: '',
        fatigueAfter: 5,
        selectedFeedbackCodes: []
    });

    useEffect(() => {
        fetchSchedule();
    }, []);

    const fetchSchedule = async () => {
        setLoading(true);
        try {
            const data = await getTodaySchedule();
            setSchedule(data.schedule);
            if (data.schedule?.sessions?.length > 0 && !selectedDate) {
                const firstSession = data.schedule.sessions[0];
                if (firstSession.startTime) {
                    setSelectedDate(new Date(firstSession.startTime).toDateString());
                }
            }
        } catch (error) {
            console.error('Failed to fetch schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerate = async () => {
        toast.loading('Regenerating schedule...', { id: 'regenerate' });
        try {
            await regenerateSchedule();
            toast.success('Schedule regeneration started!', { id: 'regenerate' });
            setTimeout(fetchSchedule, 3000);
        } catch (error) {
            toast.error('Failed to regenerate', { id: 'regenerate' });
        }
    };

    const openFeedbackModal = (taskId, action) => {
        setSelectedTask({ _id: taskId, title: 'Loading...' });
        setSelectedAction(action);
        setFeedbackData({
            actualDuration: '',
            fatigueAfter: 5,
            selectedFeedbackCodes: []
        });
        setShowFeedbackModal(true);
    };

    const toggleFeedbackCode = (code) => {
        setFeedbackData(prev => {
            const codes = prev.selectedFeedbackCodes.includes(code)
                ? prev.selectedFeedbackCodes.filter(c => c !== code)
                : [...prev.selectedFeedbackCodes, code];
            return { ...prev, selectedFeedbackCodes: codes };
        });
    };

    const handleFeedbackSubmit = async () => {
        if (selectedAction === 'complete' && !feedbackData.actualDuration) {
            toast.error('Please enter actual duration');
            return;
        }

        setAnimateTaskId(selectedTask._id);

        try {
            if (selectedAction === 'complete') {
                await completeTask(selectedTask._id, parseInt(feedbackData.actualDuration));
                toast.success('🎉 Task completed! Great job!');
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 2500);
            } else if (selectedAction === 'fail') {
                await missTask(selectedTask._id);
                toast.error('Task marked as failed. It will be rescheduled.');
            } else if (selectedAction === 'skip') {
                await skipTask(selectedTask._id);
                toast('Task skipped. It will appear in next schedule.');
            }

            await submitFeedback({
                taskId: selectedTask._id,
                outcome: selectedAction === 'complete' ? 'completed' : selectedAction === 'fail' ? 'failed' : 'skipped',
                actualDurationMin: selectedAction === 'complete' ? parseInt(feedbackData.actualDuration) : null,
                fatigueAfter: feedbackData.fatigueAfter,
                feedback: feedbackData.selectedFeedbackCodes
            });

            setTimeout(() => setAnimateTaskId(null), 500);
            setShowFeedbackModal(false);
            fetchSchedule();
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to process task');
            setAnimateTaskId(null);
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return 'TBD';
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDateHeader = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="relative">
                    <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    const sessions = schedule?.sessions || [];
    const sessionsByDate = {};
    sessions.forEach(session => {
        if (session.startTime) {
            const dateKey = new Date(session.startTime).toDateString();
            if (!sessionsByDate[dateKey]) sessionsByDate[dateKey] = [];
            sessionsByDate[dateKey].push(session);
        }
    });

    const sessionDates = Object.keys(sessionsByDate).sort((a, b) => new Date(a) - new Date(b));
    let allDates = [];
    if (sessionDates.length > 0) {
        const firstDate = new Date(sessionDates[0]);
        const lastDate = new Date(sessionDates[sessionDates.length - 1]);
        const currentDate = new Date(firstDate);

        while (currentDate <= lastDate) {
            allDates.push(currentDate.toDateString());
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    const dates = allDates.length > 0 ? allDates : sessionDates;

    if (dates.length > 0 && !selectedDate) {
        setSelectedDate(dates[0]);
    }

    const currentDateSessions = selectedDate ? sessionsByDate[selectedDate] || [] : [];
    const hasNoTasks = currentDateSessions.length === 0;
    const totalTasks = sessions.filter(s => s.taskId).length;
    const completedCount = sessions.filter(s => s.status === 'completed').length;
    const completionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    return (
        <>
            <Confetti active={showConfetti} />

            <div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-1">My Schedule</h1>
                        <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Your personalized daily plan
                        </p>
                    </div>
                    <button onClick={handleRegenerate} className="btn-primary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Regenerate
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <Clock className="w-6 h-6 text-blue-500" />
                            <span className="text-2xl font-bold text-gray-800 dark:text-white">{totalTasks}</span>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Total Tasks</p>
                    </div>
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <CheckCircle className="w-6 h-6 text-green-500" />
                            <span className="text-2xl font-bold text-gray-800 dark:text-white">{completedCount}</span>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Completed</p>
                    </div>
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <TrendingUp className="w-6 h-6 text-purple-500" />
                            <span className="text-2xl font-bold text-gray-800 dark:text-white">{completionRate}%</span>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Completion Rate</p>
                    </div>
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <Award className="w-6 h-6 text-yellow-500" />
                            <span className="text-2xl font-bold text-gray-800 dark:text-white">{sessions.filter(s => s.taskId?.difficulty === 2).length}</span>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Hard Tasks</p>
                    </div>
                </div>

                {dates.length > 0 && (
                    <div className="card p-4 mb-6">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => {
                                    const currentIndex = dates.indexOf(selectedDate);
                                    if (currentIndex > 0) setSelectedDate(dates[currentIndex - 1]);
                                }}
                                disabled={dates.indexOf(selectedDate) === 0}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-all"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            <div className="flex gap-2 overflow-x-auto px-2">
                                {dates.map((date) => {
                                    const dateObj = new Date(date);
                                    const isSelected = selectedDate === date;
                                    const hasTasks = sessionsByDate[date]?.length > 0;
                                    return (
                                        <button
                                            key={date}
                                            onClick={() => setSelectedDate(date)}
                                            className={`px-4 py-2 rounded-lg transition-all whitespace-nowrap ${isSelected
                                                ? 'bg-blue-600 text-white'
                                                : hasTasks
                                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700'
                                                }`}
                                        >
                                            <div className="text-sm font-medium">
                                                {dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </div>
                                            <div className="text-xs opacity-70">
                                                {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                                            </div>
                                            {hasTasks && (
                                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mx-auto mt-1"></div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => {
                                    const currentIndex = dates.indexOf(selectedDate);
                                    if (currentIndex < dates.length - 1) setSelectedDate(dates[currentIndex + 1]);
                                }}
                                disabled={dates.indexOf(selectedDate) === dates.length - 1}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-all"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {dates.length === 0 ? (
                    <div className="card p-12 text-center">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Calendar className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">No Schedule Yet</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">Create a goal to generate your personalized schedule</p>
                        <a href="/goal" className="btn-primary inline-flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Create Goal
                        </a>
                    </div>
                ) : (
                    <>
                        <div className="mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                                {formatDateHeader(selectedDate)}
                            </h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                                {hasNoTasks ? 'No tasks scheduled' : `${currentDateSessions.length} tasks scheduled`}
                            </p>
                        </div>

                        {hasNoTasks ? (
                            <div className="card p-8 text-center">
                                <p className="text-gray-500 dark:text-gray-400">📭 No tasks scheduled for this day</p>
                                <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">Enjoy your free time!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {currentDateSessions.map((session) => {
                                    const isTask = !!session.taskId;
                                    const status = session.status;
                                    const isCompleted = status === 'completed';
                                    const isFailed = status === 'failed';
                                    const isSkipped = status === 'skipped';
                                    const isAnimating = animateTaskId === session.taskId?._id;

                                    return (
                                        <div
                                            key={session._id}
                                            className={`card p-4 transition-all duration-300 ${isAnimating ? 'border-green-500 bg-green-50 dark:bg-green-900/20' :
                                                isCompleted ? 'border-green-500' :
                                                    isFailed ? 'border-red-500' :
                                                        ''
                                                }`}
                                        >
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                        {isTask ? (
                                                            <>
                                                                <span className={`font-semibold text-gray-800 dark:text-white ${isCompleted ? 'line-through opacity-70' : ''}`}>
                                                                    {session.taskId?.title}
                                                                </span>
                                                                {session.taskId?.difficulty === 2 && (
                                                                    <span className="badge-hard">Hard</span>
                                                                )}
                                                                {session.taskId?.difficulty === 1 && (
                                                                    <span className="badge-medium">Medium</span>
                                                                )}
                                                                {session.taskId?.difficulty === 0 && (
                                                                    <span className="badge-easy">Easy</span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                                                <Zap className="w-4 h-4 text-yellow-500" />
                                                                Break Time
                                                            </span>
                                                        )}
                                                        {isCompleted && <span className="badge-completed">Completed</span>}
                                                        {isFailed && <span className="badge-failed">Failed</span>}
                                                        {isSkipped && <span className="badge-pending">Skipped</span>}
                                                    </div>

                                                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {formatTime(session.startTime)} - {formatTime(session.endTime)}
                                                        </span>
                                                        {isTask && (
                                                            <>
                                                                <span>📊 {session.scheduledDurationMin} min</span>
                                                                <span>📚 {session.taskId?.taskType}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {isTask && !isCompleted && !isFailed && !isSkipped && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => openFeedbackModal(session.taskId._id, 'complete')}
                                                            className="btn-success text-sm px-3 py-1.5"
                                                        >
                                                            Complete
                                                        </button>
                                                        <button
                                                            onClick={() => openFeedbackModal(session.taskId._id, 'fail')}
                                                            className="btn-danger text-sm px-3 py-1.5"
                                                        >
                                                            Fail
                                                        </button>
                                                        <button
                                                            onClick={() => openFeedbackModal(session.taskId._id, 'skip')}
                                                            className="btn-warning text-sm px-3 py-1.5"
                                                        >
                                                            Skip
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* Feedback Modal - Simplified for Complete, Full for Fail/Skip */}
                {showFeedbackModal && selectedTask && (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
                        <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center gap-3 mb-6">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${selectedAction === 'complete' ? 'bg-green-100 dark:bg-green-900/50' :
                                    selectedAction === 'fail' ? 'bg-red-100 dark:bg-red-900/50' :
                                        'bg-yellow-100 dark:bg-yellow-900/50'
                                    }`}>
                                    {selectedAction === 'complete' ? <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" /> :
                                        selectedAction === 'fail' ? <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" /> :
                                            <SkipForward className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                                        {selectedAction === 'complete' ? 'Complete Task' : selectedAction === 'fail' ? 'Task Failed' : 'Skip Task'}
                                    </h2>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">{selectedTask.title === 'Loading...' ? 'Task' : selectedTask.title}</p>
                                </div>
                            </div>

                            {/* Actual Duration - Only for Complete */}
                            {selectedAction === 'complete' && (
                                <div className="mb-5">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Actual Duration (minutes)</label>
                                    <input
                                        type="number"
                                        value={feedbackData.actualDuration}
                                        onChange={(e) => setFeedbackData({ ...feedbackData, actualDuration: e.target.value })}
                                        className="input-dark"
                                        placeholder="e.g., 45"
                                        required
                                    />
                                </div>
                            )}

                            {/* What happened? - Only for Fail and Skip */}
                            {(selectedAction === 'fail' || selectedAction === 'skip') && (
                                <div className="mb-5">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">What happened? (Select all that apply)</label>
                                    <div className="space-y-2">
                                        {(selectedAction === 'fail' ? FEEDBACK_OPTIONS.failed : FEEDBACK_OPTIONS.skipped).map(option => (
                                            <label key={option.code} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={feedbackData.selectedFeedbackCodes.includes(option.code)}
                                                    onChange={() => toggleFeedbackCode(option.code)}
                                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                                />
                                                <span className="text-lg">{option.icon}</span>
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{option.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Fatigue Level - For all actions */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fatigue Level (1-10)</label>
                                <div className="flex gap-2 flex-wrap">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => (
                                        <button
                                            key={level}
                                            type="button"
                                            onClick={() => setFeedbackData({ ...feedbackData, fatigueAfter: level })}
                                            className={`w-10 h-10 rounded-lg font-medium transition-all ${feedbackData.fatigueAfter === level
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">1 = Full of energy, 10 = Completely exhausted</p>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={handleFeedbackSubmit} className="flex-1 btn-primary">
                                    Submit
                                </button>
                                <button onClick={() => setShowFeedbackModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-white py-2 rounded-lg transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}