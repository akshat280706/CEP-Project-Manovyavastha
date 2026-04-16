import { useState, useEffect } from 'react';
import { getMyGoals, deleteGoal } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Target, Calendar, CheckCircle, Clock, Trash2, AlertCircle, RefreshCw, TrendingUp, Award } from 'lucide-react';

export default function GoalsListPage() {
    const { user } = useAuth();
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingGoalId, setDeletingGoalId] = useState(null);

    useEffect(() => {
        fetchGoals();
    }, []);

    const fetchGoals = async () => {
        setLoading(true);
        try {
            const data = await getMyGoals();
            setGoals(data.goals || []);
        } catch (error) {
            console.error('Failed to fetch goals:', error);
            toast.error('Failed to load goals');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGoal = async (goalId, goalTitle) => {
        if (!window.confirm(`Are you sure you want to delete "${goalTitle}"? This will delete all tasks associated with this goal.`)) {
            return;
        }

        setDeletingGoalId(goalId);
        try {
            const result = await deleteGoal(goalId);

            setGoals(prevGoals =>
                prevGoals.map(goal =>
                    goal._id === goalId
                        ? { ...goal, status: 'deleted', completionRate: result.completionRate, tasksDeleted: result.tasksDeleted }
                        : goal
                )
            );

            toast.success(`Goal "${goalTitle}" deleted. ${result.tasksDeleted} tasks removed.`);

            setTimeout(() => {
                fetchGoals();
            }, 2000);
        } catch (error) {
            console.error('Failed to delete goal:', error);
            toast.error(error.response?.data?.message || 'Failed to delete goal');
        } finally {
            setDeletingGoalId(null);
        }
    };

    const getStatusBadge = (status, completionRate) => {
        if (status === 'deleted') {
            return { text: 'Deleted', color: 'badge-deleted' };
        }
        if (status === 'completed' || completionRate === 100) {
            return { text: 'Finished', color: 'badge-completed' };
        }
        if (status === 'abandoned') {
            return { text: 'Abandoned', color: 'badge-deleted' };
        }
        return { text: 'Active', color: 'badge-active' };
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'No deadline';
        const date = new Date(dateString);
        const today = new Date();
        const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return `Expired (${date.toLocaleDateString()})`;
        if (diffDays === 0) return 'Today!';
        if (diffDays === 1) return 'Tomorrow';
        return `${date.toLocaleDateString()} (${diffDays} days left)`;
    };

    const stats = {
        total: goals.length,
        active: goals.filter(g => g.status === 'active' && g.completionRate < 100).length,
        finished: goals.filter(g => g.status === 'completed' || g.completionRate === 100).length,
        deleted: goals.filter(g => g.status === 'deleted' || g.status === 'abandoned').length,
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin-slow"></div>
            </div>
        );
    }

    return (
        <div className="animate-slideIn">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Current Goals</h1>
                <p className="text-[var(--text-secondary)] flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Track all your learning goals and progress
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="card p-4 text-center">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Total Goals</p>
                </div>
                <div className="card p-4 text-center">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.active}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Active</p>
                </div>
                <div className="card p-4 text-center">
                    <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Award className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.finished}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Finished</p>
                </div>
                <div className="card p-4 text-center">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Trash2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.deleted}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Deleted</p>
                </div>
            </div>

            <div className="flex justify-end mb-4">
                <button onClick={fetchGoals} className="btn-secondary text-sm px-4 py-2 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {goals.length === 0 ? (
                <div className="card p-12 text-center">
                    <div className="w-20 h-20 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-4">
                        <Target className="w-10 h-10 text-[var(--text-secondary)]" />
                    </div>
                    <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No Goals Yet</h3>
                    <p className="text-[var(--text-secondary)] mb-6">Create your first goal to start your learning journey</p>
                    <a href="/goal" className="btn-primary inline-flex items-center gap-2">
                        Create Goal
                    </a>
                </div>
            ) : (
                <div className="space-y-4">
                    {goals.map((goal) => {
                        const status = getStatusBadge(goal.status, goal.completionRate);
                        const isDeleted = goal.status === 'deleted' || goal.status === 'abandoned';
                        const completionPercentage = goal.completionRate || 0;

                        return (
                            <div key={goal._id} className={`card p-5 transition-all duration-300 ${isDeleted ? 'opacity-60' : ''}`}>
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                                            <h2 className="text-xl font-semibold text-[var(--text-primary)]">{goal.title}</h2>
                                            <span className={status.color}>{status.text}</span>
                                            {goal.goalType && (
                                                <span className="text-xs px-2 py-1 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                                                    {goal.goalType}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)] mb-3">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                Deadline: {formatDate(goal.deadline)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3 text-green-500" />
                                                Tasks: {goal.completedTasks || 0}/{goal.totalTasks || 0}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Created: {new Date(goal.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>

                                        <div className="w-full">
                                            <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                                                <span>Progress</span>
                                                <span>{completionPercentage}%</span>
                                            </div>
                                            <div className="h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-500"
                                                    style={{ width: `${completionPercentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {!isDeleted && (
                                        <button
                                            onClick={() => handleDeleteGoal(goal._id, goal.title)}
                                            disabled={deletingGoalId === goal._id}
                                            className="btn-danger text-sm px-4 py-2 flex items-center gap-2 self-start"
                                        >
                                            {deletingGoalId === goal._id ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin-slow"></div>
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                            Delete Goal
                                        </button>
                                    )}
                                </div>

                                {isDeleted && (
                                    <div className="mt-3 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                                        <AlertCircle className="w-3 h-3" />
                                        This goal has been deleted. All associated tasks have been removed.
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}