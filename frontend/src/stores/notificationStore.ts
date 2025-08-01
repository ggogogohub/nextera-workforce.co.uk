import { create } from 'zustand';
import { apiClient, PaginatedNotificationsResponseData } from '@/lib/api';
import { AppNotification } from '@/types';

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  initialFetchAttempted: boolean; // To track if the first fetch (e.g., for count) has been done
  fetchNotifications: (params?: { page?: number; limit?: number; unread_only?: boolean }, isInitialCountFetch?: boolean) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  setNotifications: (data: PaginatedNotificationsResponseData) => void;
  resetNotifications: () => void; // For logout
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  initialFetchAttempted: false,

  fetchNotifications: async (params = { page: 1, limit: 20, unread_only: undefined }, isInitialCountFetch = false) => {
    if (get().isLoading && !params.page) return; // If already loading a general fetch (not pagination) bail.
    
    // If an initial fetch (for count or first page) has already been attempted and resulted in an error, don't automatically retry.
    if (get().initialFetchAttempted && get().error && (isInitialCountFetch || params.page === 1)) {
        console.warn("NotificationStore: Preventing fetch due to previous initial error.");
        return;
    }

    set({ isLoading: true, error: null }); // Clear previous error on new attempt
    try {
      const response = await apiClient.getNotifications(params);
      if (response.success && response.data) {
        const currentNotifications = get().notifications;
        const newNotifications = response.data.items;
        
        let processedNotifications = newNotifications;
        if (params.page && params.page > 1 && !isInitialCountFetch) {
            // Basic pagination: append new items. Consider more robust de-duplication if needed.
            const existingIds = new Set(currentNotifications.map(n => n.id));
            processedNotifications = [...currentNotifications, ...newNotifications.filter(n => !existingIds.has(n.id))];
        } else if (isInitialCountFetch && currentNotifications.length > 0 && newNotifications.length <= (params.limit || 1)) {
            // If this is just an initial count fetch (e.g., limit 1 from header)
            // and we already have a more substantial list (e.g., from panel opening),
            // don't replace the detailed list with this minimal one. Only update unreadCount.
            processedNotifications = currentNotifications;
        }

        set({
          notifications: processedNotifications,
          unreadCount: response.data.unreadCount,
          isLoading: false,
          initialFetchAttempted: true,
        });
      } else {
        throw new Error(response.message || 'Failed to fetch notifications');
      }
    } catch (error) {
      // Network disconnected or backend offline yields TypeError: Failed to fetch
      const raw = error instanceof Error ? error.message : String(error);
      const friendly = raw.includes('Failed to fetch') || raw.includes('ERR_CONNECTION_REFUSED')
        ? 'Cannot reach server. Please try again later.'
        : raw;
      set({ error: friendly, isLoading: false, initialFetchAttempted: true });
      // Keep console noise low in production; still log in dev for debugging.
      if (import.meta.env.DEV) {
        console.warn("Notification fetch error:", friendly);
      }
    }
  },

  markAsRead: async (notificationId: string) => {
    try {
      const response = await apiClient.markNotificationAsRead(notificationId);
      if (response.success && response.data) {
        const updatedNotification = response.data;
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...updatedNotification, isRead: true } : n
          ),
          // Decrement unreadCount only if the notification was actually unread before this action
          // and is now marked as read by the backend.
          // A more robust way is to re-fetch unreadCount or trust backend's unreadCount after actions.
          // For simplicity now, we'll assume the backend correctly marks it and we update based on current state.
          unreadCount: state.notifications.find(n => n.id === notificationId && !n.isRead) ? Math.max(0, get().unreadCount - 1) : get().unreadCount,
        }));
      } else {
        throw new Error(response.message || 'Failed to mark notification as read');
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      // Optionally set error state
    }
  },

  markAllAsRead: async () => {
    try {
      const response = await apiClient.markAllNotificationsAsRead();
      if (response.success) {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
          unreadCount: 0,
        }));
      } else {
        throw new Error(response.message || 'Failed to mark all notifications as read');
      }
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      // Optionally set error state
    }
  },
  
  setNotifications: (data: PaginatedNotificationsResponseData) => { // Helper to directly set from outside if needed
    set({
        notifications: data.items,
        unreadCount: data.unreadCount,
        isLoading: false,
        error: null,
    });
  },

  resetNotifications: () => {
    set({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      initialFetchAttempted: false,
    });
  }
}));