import React, { createContext, useState, useContext, useEffect } from 'react';
import { loginUser, registerUser, getProfile } from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const token = localStorage.getItem('token');

        if (!token) {
            setLoading(false);
            return;
        }

        try {
            const data = await getProfile();
            setUser(data.user);
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.removeItem('token');
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        try {
            const data = await loginUser(email, password);
            localStorage.setItem('token', data.token);
            setUser(data.user);
            toast.success(`Welcome back, ${data.user.name}!`);
            return { success: true };
        } catch (error) {
            toast.error(error.message || 'Login failed');
            return { success: false, error: error.message };
        }
    };

    const register = async (name, email, password) => {
        try {
            await registerUser(name, email, password);
            toast.success('Account created! Please login.');
            return { success: true };
        } catch (error) {
            toast.error(error.message || 'Registration failed');
            return { success: false, error: error.message };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        toast.success('Logged out successfully');
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
};