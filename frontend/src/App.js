import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import GoalPage from './pages/GoalPage';
import SchedulePage from './pages/SchedulePage';
import CalendarPage from './pages/CalendarPage';
import GoalsListPage from './pages/GoalsListPage';
import {
  Brain, LogOut, LayoutDashboard, Target, CalendarDays,
  CalendarIcon, Menu, X, ListTodo, Moon, Sun
} from 'lucide-react';
import { useState, useEffect } from 'react';

function NavLink({ to, icon: Icon, children, collapsed }) {
  return (
    <a
      href={to}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-all duration-200 group ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? children : ''}
    >
      <Icon className="w-5 h-5 group-hover:scale-105 transition-transform" />
      {!collapsed && <span>{children}</span>}
    </a>
  );
}

function Layout({ children }) {
  const { user, loading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin-slow"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 bg-[var(--bg-card)] border-r border-[var(--border)] z-50 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}
      >
        <div className="flex flex-col h-full">
          {/* Logo with Hamburger */}
          <div className={`p-4 border-b border-[var(--border)] flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[var(--accent)] rounded-lg flex items-center justify-center">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-[var(--text-primary)]">Manovyavastha</h1>
                  <p className="text-xs text-[var(--text-secondary)]">Cognitive Scheduler</p>
                </div>
              </div>
            )}
            {sidebarCollapsed && (
              <div className="w-9 h-9 bg-[var(--accent)] rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            >
              {sidebarCollapsed ? <Menu className="w-5 h-5 text-[var(--text-secondary)]" /> : <X className="w-5 h-5 text-[var(--text-secondary)]" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            <NavLink to="/dashboard" icon={LayoutDashboard} collapsed={sidebarCollapsed}>Dashboard</NavLink>
            <NavLink to="/goals" icon={ListTodo} collapsed={sidebarCollapsed}>Current Goals</NavLink>
            <NavLink to="/goal" icon={Target} collapsed={sidebarCollapsed}>Create Goal</NavLink>
            <NavLink to="/schedule" icon={CalendarDays} collapsed={sidebarCollapsed}>Schedule</NavLink>
            <NavLink to="/calendar" icon={CalendarIcon} collapsed={sidebarCollapsed}>Calendar</NavLink>
          </nav>

          {/* User Section */}
          <div className={`p-4 border-t border-[var(--border)] ${sidebarCollapsed ? 'text-center' : ''}`}>
            <div className={`flex items-center gap-3 mb-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-9 h-9 bg-[var(--accent)] rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">{user.name?.charAt(0).toUpperCase()}</span>
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{user.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{user.email}</p>
                </div>
              )}
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all duration-200 mb-2 ${sidebarCollapsed ? '' : ''}`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {!sidebarCollapsed && (isDark ? 'Light Mode' : 'Dark Mode')}
            </button>

            <button
              onClick={() => {
                localStorage.removeItem('token');
                window.location.href = '/login';
              }}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-all duration-200 ${sidebarCollapsed ? '' : ''}`}
            >
              <LogOut className="w-4 h-4" />
              {!sidebarCollapsed && "Logout"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 min-h-screen p-6 ${sidebarCollapsed ? 'ml-20' : 'ml-64'}`}>
        <div className="animate-slideIn">
          {children}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              },
            }}
          />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={<Layout><DashboardPage /></Layout>} />
            <Route path="/goals" element={<Layout><GoalsListPage /></Layout>} />
            <Route path="/goal" element={<Layout><GoalPage /></Layout>} />
            <Route path="/schedule" element={<Layout><SchedulePage /></Layout>} />
            <Route path="/calendar" element={<Layout><CalendarPage /></Layout>} />
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;