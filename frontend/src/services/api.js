import axios from 'axios';

// FIX: this was hardcoded to 'http://localhost:5000/api', which only works
// when running the backend on your own machine. Any real deployment
// (Vercel/Netlify frontend + a hosted backend) would silently try to call
// localhost from the user's browser and fail every request.
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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
// FIX: decomposeGoal previously never accepted a file at all — the backend's
// upload.single('material') + pdfExtractor.js + Groq vision-image path were
// fully built but unreachable from the UI. When a file is given, send
// multipart/form-data instead of plain JSON.
export const decomposeGoal = async (goalData, file) => {
    if (file) {
        const formData = new FormData();
        Object.entries(goalData).forEach(([key, value]) => {
            if (value !== undefined && value !== null) formData.append(key, value);
        });
        formData.append('material', file);
        const response = await api.post('/llm/decompose', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    }
    const response = await api.post('/llm/decompose', goalData);
    return response.data;
};

// FIX: llm.service.js's refineGoal (multi-turn conversational task
// refinement) had a full backend route (/llm/refine) but no frontend
// wrapper at all, so the whole feature was unreachable.
export const refineGoal = async (conversationHistory, newMessage, turnCount, file) => {
    if (file) {
        const formData = new FormData();
        formData.append('conversationHistory', JSON.stringify(conversationHistory));
        formData.append('newMessage', newMessage);
        formData.append('turnCount', turnCount);
        formData.append('material', file);
        const response = await api.post('/llm/refine', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    }
    const response = await api.post('/llm/refine', { conversationHistory, newMessage, turnCount });
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