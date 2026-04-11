import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { getTodaySchedule } from '../services/api';

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSchedule();
    }, [currentDate]);

    const fetchSchedule = async () => {
        setLoading(true);
        try {
            const data = await getTodaySchedule();
            const calendarEvents = (data.schedule?.sessions || []).map(session => ({
                id: session._id,
                title: session.taskId?.title || 'Break',
                start: new Date(session.startTime),
                end: new Date(session.endTime),
                type: session.taskId ? 'task' : 'break',
                status: session.status,
            }));
            setEvents(calendarEvents);
        } catch (error) {
            console.error('Failed to fetch schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];

        for (let i = 0; i < firstDay.getDay(); i++) {
            const prevDate = new Date(year, month, -i);
            days.unshift({ date: prevDate, isCurrentMonth: false });
        }

        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push({ date: new Date(year, month, i), isCurrentMonth: true });
        }

        const remainingDays = 42 - days.length;
        for (let i = 1; i <= remainingDays; i++) {
            days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
        }

        return days;
    };

    const getEventsForDay = (date) => {
        return events.filter(event => event.start.toDateString() === date.toDateString());
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="relative">
                    <div className="w-12 h-12 border-2 border-[#00FFFF]/30 border-t-[#00FFFF] rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    const days = getDaysInMonth(currentDate);

    return (
        <div className="animate-slideIn">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold gradient-text mb-1">Calendar View</h1>
                    <p className="text-[#888] flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-[#00FFFF]" />
                        Monthly schedule overview
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                        className="p-2 rounded-xl bg-[#1A1A2E] border border-[#00FFFF]/20 hover:border-[#00FFFF]/50 transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-[#00FFFF]" />
                    </button>
                    <span className="text-lg font-semibold text-white min-w-[160px] text-center">
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                        onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                        className="p-2 rounded-xl bg-[#1A1A2E] border border-[#00FFFF]/20 hover:border-[#00FFFF]/50 transition-colors"
                    >
                        <ChevronRight className="w-5 h-5 text-[#00FFFF]" />
                    </button>
                </div>
            </div>

            <div className="glass-card overflow-hidden">
                <div className="grid grid-cols-7 border-b border-[#00FFFF]/20">
                    {weekDays.map(day => (
                        <div key={day} className="p-3 text-center font-semibold text-[#00FFFF] text-sm">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 auto-rows-fr">
                    {days.map((day, idx) => {
                        const dayEvents = getEventsForDay(day.date);
                        const isToday = day.date.toDateString() === new Date().toDateString();

                        return (
                            <div
                                key={idx}
                                className={`min-h-[100px] p-2 border-b border-r border-[#00FFFF]/10 transition-colors ${!day.isCurrentMonth ? 'bg-[#0A0A0F]/50' : ''
                                    } ${isToday ? 'bg-[#00FFFF]/10' : ''}`}
                            >
                                <div className={`text-right mb-1 text-sm ${isToday ? 'font-bold text-[#00FFFF]' : 'text-[#888]'
                                    }`}>
                                    {day.date.getDate()}
                                </div>
                                <div className="space-y-1">
                                    {dayEvents.slice(0, 2).map(event => (
                                        <div
                                            key={event.id}
                                            className={`text-xs p-1 rounded truncate ${event.type === 'task'
                                                    ? event.status === 'completed'
                                                        ? 'bg-[#00FF88]/20 text-[#00FF88] border border-[#00FF88]/30'
                                                        : 'bg-[#00FFFF]/20 text-[#00FFFF] border border-[#00FFFF]/30'
                                                    : 'bg-[#FFCC00]/20 text-[#FFCC00] border border-[#FFCC00]/30'
                                                }`}
                                            title={event.title}
                                        >
                                            {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {event.title}
                                        </div>
                                    ))}
                                    {dayEvents.length > 2 && (
                                        <div className="text-xs text-[#888] text-center">
                                            +{dayEvents.length - 2} more
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}