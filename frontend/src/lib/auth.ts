import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState, User } from '@/types';
import { apiClient } from './api';

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  checkAuth: () => Promise<void>;
  updateProfile: (profileData: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true });
          const response = await apiClient.login(email, password);
          
          if (response.success && response.data) {
            const rawUser = response.data.user as User & { _id?: string }; // Cast to include potential _id
            const processedUser = {
              ...rawUser,
              id: rawUser.id || rawUser._id!, // Ensure id is present
            };
            set({
              user: processedUser, // Store the processed user
              token: response.data.token,
              isAuthenticated: true,
              isLoading: false
            });
            apiClient.setToken(response.data.token);
          } else {
            // Login API responded but credentials invalid
            set({ isLoading: false });
            throw new Error('Invalid email or password.');
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await apiClient.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({ 
            user: null, 
            token: null, 
            isAuthenticated: false 
          });
          apiClient.setToken(null);
        }
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      setToken: (token: string | null) => {
        set({ token });
        apiClient.setToken(token);
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return;
        }

        try {
          set({ isLoading: true });
          const response = await apiClient.getCurrentUser();
          
          if (response.success && response.data) {
            const rawUser = response.data as User & { _id?: string }; // response.data is the user object
            const processedUser = {
              ...rawUser,
              id: rawUser.id || rawUser._id!, // Ensure id is present
            };
            set({
              user: processedUser,
              isAuthenticated: true,
              isLoading: false
            });
          } else {
            set({ 
              user: null, 
              token: null, 
              isAuthenticated: false, 
              isLoading: false 
            });
            apiClient.setToken(null);
          }
        } catch (error) {
          console.error('Auth check error:', error);
          set({ 
            user: null, 
            token: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
          apiClient.setToken(null);
        }
      },

      updateProfile: async (profileData: Partial<User>) => {
        // Removed unnecessary try...catch
        const response = await apiClient.updateProfile(profileData);
        
        if (response.success && response.data) {
          set({ user: response.data });
        }
        // If apiClient.updateProfile throws, it will propagate up as intended
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);

// Session timeout handler
let sessionTimeout: NodeJS.Timeout;

export const startSessionTimeout = () => {
  const timeoutDuration = (parseInt(import.meta.env.VITE_SESSION_TIMEOUT) || 30) * 60 * 1000;
  
  clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => {
    useAuthStore.getState().logout();
  }, timeoutDuration);
};

export const resetSessionTimeout = () => {
  startSessionTimeout();
};

// Activity listeners for session management
const activities = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

export const initializeSessionManagement = () => {
  activities.forEach(activity => {
    document.addEventListener(activity, resetSessionTimeout, true);
  });
  
  // Listen for auth errors from apiClient to trigger logout
  window.addEventListener('auth-error-logout', () => {
    console.log('Auth error detected, logging out...');
    useAuthStore.getState().logout();
  });

  startSessionTimeout();
};

export const cleanupSessionManagement = () => {
  activities.forEach(activity => {
    document.removeEventListener(activity, resetSessionTimeout, true);
  });
  
  clearTimeout(sessionTimeout);
};
