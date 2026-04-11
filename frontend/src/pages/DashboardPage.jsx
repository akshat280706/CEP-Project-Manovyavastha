import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyGoals, getTodaySchedule } from '../services/api';
import { Target, CheckCircle, Calendar, TrendingUp, Brain, Sparkles, ArrowRight, Trophy, Zap, Clock, Activity, BarChart3 } from 'lucide-react';

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

    const stats = [
        { title: 'Active Goals', value: goals.filter(g => g.status === 'active').length, icon: Target, color: '#00FFFF' },
        { title: 'Tasks Today', value: schedule?.sessions?.filter(s => s.taskId).length || 0, icon: CheckCircle, color: '#00FF88' },
        { title: 'Completion Rate', value: goals[0]?.completionRate || 0, icon: TrendingUp, color: '#FF00FF', suffix: '%' },
        { title: 'Streak', value: 0, icon: Zap, color: '#FFCC00' },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="relative">
                    <div className="w-12 h-12 border-2 border-[#00FFFF]/30 border-t-[#00FFFF] rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-slideIn">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">
                    Welcome back, <span className="gradient-text">{user?.name}!</span>
                </h1>
                <p className="text-[#888]">Here's your productivity overview</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {stats.map((stat, idx) => (
                    <div key={idx} className="glass-card p-4 group hover:scale-105 transition-all">
                        <div className="flex items-center justify-between mb-2">
                            <div className="w-10 h-10 rounded-xl bg-[#00FFFF]/10 flex items-center justify-center">
                                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                            </div>
                            <span className="text-2xl font-bold text-white">{stat.value}{stat.suffix || ''}</span>
                        </div>
                        <p className="text-[#888] text-sm">{stat.title}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Target className="w-5 h-5 text-[#00FFFF]" />
                            Recent Goals
                        </h2>
                        <a href="/goal" className="text-[#00FFFF] hover:text-[#FF00FF] text-sm font-medium flex items-center gap-1 transition-colors">
                            New Goal <ArrowRight className="w-3 h-3" />
                        </a>
                    </div>

                    {goals.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-[#1A1A2E] rounded-full flex items-center justify-center mx-auto mb-3">
                                <Target className="w-8 h-8 text-[#00FFFF]" />
                            </div>
                            <p className="text-[#888] mb-3">No goals yet</p>
                            <a href="/goal" className="text-[#00FFFF] hover:text-[#FF00FF] text-sm font-medium">
                                Create your first goal →
                            </a>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {goals.slice(0, 3).map((goal) => (
                                <div key={goal._id} className="flex items-center justify-between p-3 bg-[#1A1A2E] rounded-xl border border-[#00FFFF]/10">
                                    <div>
                                        <p className="font-medium text-white">{goal.title}</p>
                                        <p className="text-xs text-[#888] mt-1">
                                            {goal.completedTasks || 0}/{goal.totalTasks || 0} tasks • {goal.completionRate || 0}% complete
                                        </p>
                                    </div>
                                    <div className="w-24">
                                        <div className="h-1.5 bg-[#2A2A3E] rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-[#00FFFF] to-[#FF00FF] rounded-full"
                                                style={{ width: `${goal.completionRate || 0}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-[#888] text-center mt-1">{goal.completionRate || 0}%</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="glass-card p-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-[#FF00FF]" />
                        Quick Actions
                    </h2>
                    <div className="space-y-3">
                        <a href="/goal" className="flex items-center justify-between p-3 bg-[#1A1A2E] rounded-xl border border-[#00FFFF]/10 hover:border-[#00FFFF]/50 transition-all group">
                            <div>
                                <p className="font-medium text-white group-hover:text-[#00FFFF] transition-colors">Create New Goal</p>
                                <p className="text-xs text-[#888]">Let AI decompose your goal into tasks</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[#00FFFF] opacity-0 group-hover:opacity-100 transition-all" />
                        </a>
                        <a href="/schedule" className="flex items-center justify-between p-3 bg-[#1A1A2E] rounded-xl border border-[#00FF88]/10 hover:border-[#00FF88]/50 transition-all group">
                            <div>
                                <p className="font-medium text-white group-hover:text-[#00FF88] transition-colors">View Today's Schedule</p>
                                <p className="text-xs text-[#888]">Check your personalized timetable</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[#00FF88] opacity-0 group-hover:opacity-100 transition-all" />
                        </a>
                        <a href="/calendar" className="flex items-center justify-between p-3 bg-[#1A1A2E] rounded-xl border border-[#FF00FF]/10 hover:border-[#FF00FF]/50 transition-all group">
                            <div>
                                <p className="font-medium text-white group-hover:text-[#FF00FF] transition-colors">Calendar View</p>
                                <p className="text-xs text-[#888]">See your schedule month by month</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[#FF00FF] opacity-0 group-hover:opacity-100 transition-all" />
                        </a>
                    </div>
                </div>
            </div>

            <div className="mt-6 glass-card p-5 border-l-4 border-l-[#00FFFF]">
                <div className="flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-[#FFCC00] animate-glow" />
                    <div>
                        <p className="font-semibold text-white">"The secret of getting ahead is getting started."</p>
                        <p className="text-sm text-[#888] mt-1">Your RL agents are learning to optimize your productivity</p>
                    </div>
                </div>
            </div>
        </div>
    );
}