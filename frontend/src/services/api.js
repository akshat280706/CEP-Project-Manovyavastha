import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// Add token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth APIs
export const registerUser = async (name, email, password) => {
    const response = await api.post('/auth/register', { name, email, password });
    return response.data;
};

export const loginUser = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
};

export const getProfile = async () => {
    const response = await api.get('/auth/profile');
    return response.data;
};

// Goal APIs
export const decomposeGoal = async (goalData) => {
    const response = await api.post('/llm/decompose', goalData);
    return response.data;
};

export const confirmGoal = async (goalData, tasks) => {
    const response = await api.post('/goals/confirm', { goalData, tasks });
    return response.data;
};

export const getMyGoals = async () => {
    const response = await api.get('/goals/my');
    return response.data;
};

export const getGoalById = async (goalId) => {
    const response = await api.get(`/goals/${goalId}`);
    return response.data;
};

export const deleteGoal = async (goalId) => {
    const response = await api.delete(`/goals/${goalId}`);
    return response.data;
};

// Schedule APIs
export const getTodaySchedule = async () => {
    const response = await api.get('/schedule/today');
    return response.data;
};

export const regenerateSchedule = async () => {
    const response = await api.post('/schedule/regenerate');
    return response.data;
};

export const completeTask = async (taskId, actualDurationMin) => {
    const response = await api.post(`/schedule/complete/${taskId}`, { actualDurationMin });
    return response.data;
};

export const missTask = async (taskId) => {
    const response = await api.post(`/schedule/miss/${taskId}`);
    return response.data;
};

export const skipTask = async (taskId) => {
    const response = await api.post(`/schedule/skip/${taskId}`);
    return response.data;
};

// Feedback API
export const submitFeedback = async (feedbackData) => {
    const response = await api.post('/feedback/submit', feedbackData);
    return response.data;
};