import { useState, useEffect, useRef } from 'react';
import { getTodaySchedule, regenerateSchedule, completeTask, missTask, skipTask, submitFeedback } from '../services/api';
import toast from 'react-hot-toast';
import { Calendar, RefreshCw, Clock, CheckCircle, XCircle, SkipForward, TrendingUp, Award, Zap, ChevronLeft, ChevronRight, Brain, Trophy, Target } from 'lucide-react';

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
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

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
    return <canvas ref={canvasRef} className="confetti-canvas" />;
}

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
        feedbackCodes: []
    });

    useEffect(() => {
        fetchSchedule();
    }, []);

    const fetchSchedule = async () => {
        setLoading(true);
        try {
            const data = await getTodaySchedule();
            setSchedule(data.schedule);

            const allSessions = data.schedule?.sessions || [];
            const sessionsByDateMap = {};
            allSessions.forEach(session => {
                if (session.startTime) {
                    const dateKey = new Date(session.startTime).toDateString();
                    if (!sessionsByDateMap[dateKey]) sessionsByDateMap[dateKey] = [];
                    sessionsByDateMap[dateKey].push(session);
                }
            });

            setSessionsByDate(sessionsByDateMap);

            const datesWithSessions = Object.keys(sessionsByDateMap);
            if (datesWithSessions.length > 0 && !selectedDate) {
                setSelectedDate(datesWithSessions[0]);
            } else if (!selectedDate) {
                setSelectedDate(new Date().toDateString());
            }
        } catch (error) {
            console.error('Failed to fetch schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    const [sessionsByDate, setSessionsByDate] = useState({});

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

    const openFeedbackModal = (taskId, action, taskTitle, goalTitle) => {
        setSelectedTask({ _id: taskId, title: taskTitle, goalTitle: goalTitle });
        setSelectedAction(action);

        if (action === 'skip') {
            if (window.confirm(`Are you sure you want to skip "${taskTitle}"?`)) {
                handleSkipTask(taskId);
            }
            return;
        }

        if (action === 'complete') {
            setFeedbackData({
                actualDuration: '',
                fatigueAfter: 5,
                feedbackCodes: []
            });
        } else if (action === 'fail') {
            setFeedbackData({
                actualDuration: '',
                fatigueAfter: 5,
                feedbackCodes: []
            });
        }

        setShowFeedbackModal(true);
    };

    const handleSkipTask = async (taskId) => {
        setAnimateTaskId(taskId);
        try {
            await skipTask(taskId);
            toast('Task skipped. It will appear in next schedule.');
            setTimeout(() => setAnimateTaskId(null), 500);
            fetchSchedule();
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to skip task');
            setAnimateTaskId(null);
        }
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

                await submitFeedback({
                    taskId: selectedTask._id,
                    outcome: 'failed',
                    actualDurationMin: null,
                    fatigueAfter: feedbackData.fatigueAfter,
                    feedback: feedbackData.feedbackCodes,
                });
            }

            setTimeout(() => setAnimateTaskId(null), 500);
            setShowFeedbackModal(false);
            fetchSchedule();
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to process task');
            setAnimateTaskId(null);
        }
    };

    const toggleFeedbackCode = (code) => {
        setFeedbackData(prev => ({
            ...prev,
            feedbackCodes: prev.feedbackCodes.includes(code)
                ? prev.feedbackCodes.filter(c => c !== code)
                : [...prev.feedbackCodes, code]
        }));
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

    const feedbackOptions = [
        { code: 'F1', label: 'Not enough time', description: 'Task took longer than scheduled' },
        { code: 'F2', label: 'Too tired', description: 'Couldn\'t focus due to fatigue' },
        { code: 'F3', label: 'Wrong time of day', description: 'This time didn\'t work for me' },
        { code: 'F4', label: 'Too difficult', description: 'Task was harder than expected' },
        { code: 'F5', label: 'Distracted', description: 'Couldn\'t maintain focus' },
        { code: 'F8', label: 'Bad context switch', description: 'Switching tasks was hard' },
    ];

    const getDateRange = () => {
        const today = new Date();
        const dates = [];
        for (let i = -30; i <= 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            dates.push(date.toDateString());
        }
        return dates;
    };

    const allDates = getDateRange();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin-slow"></div>
            </div>
        );
    }

    const currentDateSessions = selectedDate ? sessionsByDate[selectedDate] || [] : [];
    const hasNoTasks = currentDateSessions.length === 0;
    const totalTasks = Object.values(sessionsByDate).flat().filter(s => s.taskId).length;
    const completedCount = Object.values(sessionsByDate).flat().filter(s => s.status === 'completed').length;
    const completionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    const selectedIndex = allDates.indexOf(selectedDate);
    const visibleDates = allDates;

    return (
        <>
            <Confetti active={showConfetti} />

            <div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1">Schedule</h1>
                        <p className="text-[var(--text-secondary)] flex items-center gap-2">
                            <Brain className="w-4 h-4" />
                            AI-optimized multi-day schedule
                        </p>
                    </div>
                    <button onClick={handleRegenerate} className="btn-secondary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Regenerate
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <Clock className="w-6 h-6 text-blue-500" />
                            <span className="text-2xl font-bold text-[var(--text-primary)]">{totalTasks}</span>
                        </div>
                        <p className="text-[var(--text-secondary)] text-sm">Total Tasks</p>
                    </div>
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <CheckCircle className="w-6 h-6 text-green-500" />
                            <span className="text-2xl font-bold text-[var(--text-primary)]">{completedCount}</span>
                        </div>
                        <p className="text-[var(--text-secondary)] text-sm">Completed</p>
                    </div>
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <TrendingUp className="w-6 h-6 text-purple-500" />
                            <span className="text-2xl font-bold text-[var(--text-primary)]">{completionRate}%</span>
                        </div>
                        <p className="text-[var(--text-secondary)] text-sm">Completion Rate</p>
                    </div>
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <Award className="w-6 h-6 text-yellow-500" />
                            <span className="text-2xl font-bold text-[var(--text-primary)]">
                                {Object.values(sessionsByDate).flat().filter(s => s.taskId?.difficulty === 2).length}
                            </span>
                        </div>
                        <p className="text-[var(--text-secondary)] text-sm">Hard Tasks</p>
                    </div>
                </div>

                {/* Date Selector */}
                <div className="card p-4 mb-6">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => {
                                const currentIndex = allDates.indexOf(selectedDate);
                                if (currentIndex > 0) setSelectedDate(allDates[currentIndex - 1]);
                            }}
                            disabled={selectedIndex === 0}
                            className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-30 transition-all"
                        >
                            <ChevronLeft className="w-5 h-5 text-[var(--text-secondary)]" />
                        </button>

                        <div className="flex gap-2 overflow-x-auto px-2" style={{ maxWidth: 'calc(100% - 80px)' }}>
                            {visibleDates.map((date) => {
                                const dateObj = new Date(date);
                                const isSelected = selectedDate === date;
                                const hasTasks = sessionsByDate[date]?.length > 0;
                                const isToday = date === new Date().toDateString();

                                return (
                                    <button
                                        key={date}
                                        onClick={() => setSelectedDate(date)}
                                        className={`px-4 py-2 rounded-lg transition-all whitespace-nowrap ${isSelected
                                                ? 'bg-[var(--accent)] text-white'
                                                : hasTasks
                                                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border)]'
                                                    : 'bg-[var(--bg-secondary)]/50 text-[var(--text-secondary)]'
                                            } ${isToday && !isSelected ? 'border border-[var(--accent)]/50' : ''}`}
                                    >
                                        <div className="text-sm font-medium">
                                            {dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                        <div className="text-xs opacity-70">
                                            {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </div>
                                        {hasTasks && (
                                            <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full mx-auto mt-1"></div>
                                        )}
                                        {isToday && !hasTasks && (
                                            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full mx-auto mt-1"></div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => {
                                const currentIndex = allDates.indexOf(selectedDate);
                                if (currentIndex < allDates.length - 1) setSelectedDate(allDates[currentIndex + 1]);
                            }}
                            disabled={selectedIndex === allDates.length - 1}
                            className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-30 transition-all"
                        >
                            <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
                        </button>
                    </div>
                </div>

                <div className="mb-4 pb-2 border-b border-[var(--border)]">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                        {formatDateHeader(selectedDate)}
                    </h2>
                    <p className="text-[var(--text-secondary)] text-sm mt-1">
                        {hasNoTasks ? 'No tasks scheduled' : `${currentDateSessions.length} tasks scheduled`}
                    </p>
                </div>

                {hasNoTasks ? (
                    <div className="card p-8 text-center">
                        <p className="text-[var(--text-secondary)]">📭 No tasks scheduled for this day</p>
                        <p className="text-[var(--text-secondary)] text-sm mt-2">Enjoy your free time!</p>
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
                            const goalTitle = session.goalTitle || 'Unknown Goal';

                            return (
                                <div
                                    key={session._id}
                                    className={`card p-4 transition-all duration-300 ${isAnimating ? 'bg-green-50 dark:bg-green-900/20 border-green-500' : ''
                                        } ${isCompleted ? 'border-l-4 border-l-green-500' : isFailed ? 'border-l-4 border-l-red-500' : ''}`}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                {isTask ? (
                                                    <>
                                                        <span className={`font-semibold text-[var(--text-primary)] ${isCompleted ? 'line-through opacity-70' : ''}`}>
                                                            {session.taskId?.title}
                                                        </span>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
                                                            <Target className="w-3 h-3" />
                                                            {goalTitle}
                                                        </span>
                                                        {session.taskId?.difficulty === 2 && (
                                                            <span className="badge-hard">🔥 Hard</span>
                                                        )}
                                                        {session.taskId?.difficulty === 1 && (
                                                            <span className="badge-medium">📘 Medium</span>
                                                        )}
                                                        {session.taskId?.difficulty === 0 && (
                                                            <span className="badge-easy">📗 Easy</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                                        <Zap className="w-4 h-4 text-yellow-500" />
                                                        Break Time
                                                    </span>
                                                )}
                                                {isCompleted && <span className="badge-completed">✓ Completed</span>}
                                                {isFailed && <span className="badge-failed">✗ Failed</span>}
                                                {isSkipped && <span className="badge-pending">⏭ Skipped</span>}
                                            </div>

                                            <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
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
                                                    onClick={() => openFeedbackModal(session.taskId._id, 'complete', session.taskId?.title, goalTitle)}
                                                    className="btn-success text-sm px-3 py-1.5 flex items-center gap-1"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                    Complete
                                                </button>
                                                <button
                                                    onClick={() => openFeedbackModal(session.taskId._id, 'fail', session.taskId?.title, goalTitle)}
                                                    className="btn-danger text-sm px-3 py-1.5 flex items-center gap-1"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                    Fail
                                                </button>
                                                <button
                                                    onClick={() => openFeedbackModal(session.taskId._id, 'skip', session.taskId?.title, goalTitle)}
                                                    className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1"
                                                >
                                                    <SkipForward className="w-4 h-4" />
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

                {/* Feedback Modal - Only for Complete and Fail */}
                {showFeedbackModal && selectedTask && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="card max-w-md w-full p-6 animate-slideIn">
                            <div className="flex items-center gap-3 mb-6">
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${selectedAction === 'complete' ? 'bg-green-100 dark:bg-green-900/30' :
                                        'bg-red-100 dark:bg-red-900/30'
                                    }`}>
                                    {selectedAction === 'complete' ?
                                        <Trophy className="w-6 h-6 text-green-600 dark:text-green-400" /> :
                                        <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                    }
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-[var(--text-primary)]">
                                        {selectedAction === 'complete' ? 'Complete Task' : 'Task Failed'}
                                    </h2>
                                    <p className="text-[var(--text-secondary)] text-sm">{selectedTask.title}</p>
                                    <p className="text-xs text-purple-500 mt-1 flex items-center gap-1">
                                        <Target className="w-3 h-3" />
                                        Goal: {selectedTask.goalTitle}
                                    </p>
                                </div>
                            </div>

                            {selectedAction === 'complete' && (
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Actual Duration (minutes)</label>
                                    <input
                                        type="number"
                                        value={feedbackData.actualDuration}
                                        onChange={(e) => setFeedbackData({ ...feedbackData, actualDuration: e.target.value })}
                                        className="input"
                                        placeholder="e.g., 45"
                                        autoFocus
                                    />
                                </div>
                            )}

                            {selectedAction === 'fail' && (
                                <>
                                    <div className="mb-4">
                                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Fatigue Level</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    onClick={() => setFeedbackData({ ...feedbackData, fatigueAfter: level })}
                                                    className={`w-9 h-9 rounded-lg font-medium transition-all ${feedbackData.fatigueAfter === level
                                                            ? 'bg-[var(--accent)] text-white'
                                                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
                                                        }`}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] mt-2">1 = Energetic, 10 = Exhausted</p>
                                    </div>

                                    <div className="mb-6">
                                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">What went wrong?</label>
                                        <div className="space-y-2">
                                            {feedbackOptions.map(option => (
                                                <label
                                                    key={option.code}
                                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${feedbackData.feedbackCodes.includes(option.code)
                                                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                                                            : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                                                        }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={feedbackData.feedbackCodes.includes(option.code)}
                                                        onChange={() => toggleFeedbackCode(option.code)}
                                                        className="mt-0.5 accent-[var(--accent)]"
                                                    />
                                                    <div>
                                                        <div className="font-medium text-[var(--text-primary)] text-sm">{option.code} — {option.label}</div>
                                                        <div className="text-xs text-[var(--text-secondary)]">{option.description}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="flex gap-3">
                                <button onClick={handleFeedbackSubmit} className="flex-1 btn-primary">
                                    Submit
                                </button>
                                <button onClick={() => setShowFeedbackModal(false)} className="flex-1 btn-secondary">
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