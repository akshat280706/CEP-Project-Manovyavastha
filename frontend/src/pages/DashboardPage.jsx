import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyGoals, getTodaySchedule } from '../services/api';
import { Target, CheckCircle, Calendar, TrendingUp, Brain, ArrowRight, Trophy, Zap, Clock } from 'lucide-react';

export default function DashboardPage() {
    const { user } = useAuth();
    const [goals, setGoals] = useState([]);
    const [schedule, setSchedule] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const goalsData = await getMyGoals();
            setGoals(goalsData.goals || []);
            const scheduleData = await getTodaySchedule();
            setSchedule(scheduleData.schedule);
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const activeGoals = goals.filter(g => g.status === 'active' && g.completionRate < 100);
    const completedCount = goals.reduce((sum, g) => sum + (g.completedTasks || 0), 0);
    const totalTasks = goals.reduce((sum, g) => sum + (g.totalTasks || 0), 0);
    const overallCompletion = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    const stats = [
        { title: 'Active Goals', value: activeGoals.length, icon: Target, color: 'bg-blue-500' },
        { title: 'Tasks Today', value: schedule?.sessions?.filter(s => s.taskId).length || 0, icon: CheckCircle, color: 'bg-green-500' },
        { title: 'Overall Progress', value: overallCompletion, icon: TrendingUp, color: 'bg-purple-500', suffix: '%' },
        { title: 'Tasks Completed', value: completedCount, icon: Zap, color: 'bg-yellow-500' },
    ];

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
                <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
                    Welcome back, <span className="text-[var(--accent)]">{user?.name}!</span>
                </h1>
                <p className="text-[var(--text-secondary)]">Here's your productivity overview</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {stats.map((stat, idx) => (
                    <div key={idx} className="card p-4 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-2">
                            <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center`}>
                                <stat.icon className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}{stat.suffix || ''}</span>
                        </div>
                        <p className="text-[var(--text-secondary)] text-sm">{stat.title}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <Target className="w-5 h-5 text-[var(--accent)]" />
                            Active Goals
                        </h2>
                        <a href="/goal" className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1">
                            New Goal <ArrowRight className="w-3 h-3" />
                        </a>
                    </div>

                    {activeGoals.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-3">
                                <Target className="w-8 h-8 text-[var(--text-secondary)]" />
                            </div>
                            <p className="text-[var(--text-secondary)] mb-3">No active goals</p>
                            <a href="/goal" className="text-[var(--accent)] text-sm hover:underline">
                                Create your first goal →
                            </a>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeGoals.slice(0, 3).map((goal) => (
                                <div key={goal._id} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
                                    <div>
                                        <p className="font-medium text-[var(--text-primary)]">{goal.title}</p>
                                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                                            {goal.completedTasks || 0}/{goal.totalTasks || 0} tasks • {goal.completionRate || 0}% complete
                                        </p>
                                    </div>
                                    <div className="w-24">
                                        <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-[var(--accent)] rounded-full"
                                                style={{ width: `${goal.completionRate || 0}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] text-center mt-1">{goal.completionRate || 0}%</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card p-5">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                        <Brain className="w-5 h-5 text-[var(--accent)]" />
                        Quick Actions
                    </h2>
                    <div className="space-y-3">
                        <a href="/goal" className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg hover:bg-[var(--border)] transition-all group">
                            <div>
                                <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Create New Goal</p>
                                <p className="text-xs text-[var(--text-secondary)]">Let AI decompose your goal into tasks</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all" />
                        </a>
                        <a href="/schedule" className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg hover:bg-[var(--border)] transition-all group">
                            <div>
                                <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">View Today's Schedule</p>
                                <p className="text-xs text-[var(--text-secondary)]">Check your personalized timetable</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all" />
                        </a>
                        <a href="/calendar" className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg hover:bg-[var(--border)] transition-all group">
                            <div>
                                <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">Calendar View</p>
                                <p className="text-xs text-[var(--text-secondary)]">See your schedule month by month</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all" />
                        </a>
                    </div>
                </div>
            </div>

            <div className="mt-6 card p-5 border-l-4 border-l-[var(--accent)]">
                <div className="flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-yellow-500" />
                    <div>
                        <p className="font-semibold text-[var(--text-primary)]">"The secret of getting ahead is getting started."</p>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">Your RL agents are learning to optimize your productivity</p>
                    </div>
                </div>
            </div>
        </div>
    );
}