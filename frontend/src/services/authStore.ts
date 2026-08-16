/**
 * Authentication Zustand Store
 */

import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const savedToken = localStorage.getItem('resumeiq_token');
const savedUser = localStorage.getItem('resumeiq_user')
  ? JSON.parse(localStorage.getItem('resumeiq_user')!)
  : null;

export const useAuthStore = create<AuthState>((set) => ({
  token: savedToken,
  user: savedUser,
  isAuthenticated: !!savedToken,

  login: (token: string, user: User) => {
    localStorage.setItem('resumeiq_token', token);
    localStorage.setItem('resumeiq_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('resumeiq_token');
    localStorage.removeItem('resumeiq_user');
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
