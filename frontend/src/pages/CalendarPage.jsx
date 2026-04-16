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
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin-slow"></div>
            </div>
        );
    }

    const days = getDaysInMonth(currentDate);

    return (
        <div className="animate-slideIn">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1">Calendar View</h1>
                    <p className="text-[var(--text-secondary)] flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4" />
                        Monthly schedule overview
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                        className="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-[var(--text-secondary)]" />
                    </button>
                    <span className="text-lg font-semibold text-[var(--text-primary)] min-w-[160px] text-center">
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                        onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                        className="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] transition-colors"
                    >
                        <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />
                    </button>
                </div>
            </div>

            <div className="card overflow-hidden">
                <div className="grid grid-cols-7 border-b border-[var(--border)]">
                    {weekDays.map(day => (
                        <div key={day} className="p-3 text-center font-semibold text-[var(--accent)] text-sm">
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
                                className={`min-h-[100px] p-2 border-b border-r border-[var(--border)] transition-colors ${!day.isCurrentMonth ? 'bg-[var(--bg-secondary)]/30' : ''
                                    } ${isToday ? 'bg-[var(--accent)]/10' : ''}`}
                            >
                                <div className={`text-right mb-1 text-sm ${isToday ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                                    }`}>
                                    {day.date.getDate()}
                                </div>
                                <div className="space-y-1">
                                    {dayEvents.slice(0, 2).map(event => (
                                        <div
                                            key={event.id}
                                            className={`text-xs p-1 rounded truncate ${event.type === 'task'
                                                    ? event.status === 'completed'
                                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                }`}
                                            title={event.title}
                                        >
                                            {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {event.title}
                                        </div>
                                    ))}
                                    {dayEvents.length > 2 && (
                                        <div className="text-xs text-[var(--text-secondary)] text-center">
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