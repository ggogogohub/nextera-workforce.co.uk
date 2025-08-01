/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: Gradually replace `any` with precise types from `@/types`.
// This pragma silences the linter for now so the pipeline remains clean while
// we iterate.  Remove it once the full typing pass is complete.
import {
  ApiResponse,
  PaginatedResponse,
  TimeOffFormData,
  TimeOffRequest,
  User,
  AddEmployeeFormData,
  EditEmployeeFormData,
  WorkforceMetricsOut,
  AttendanceReportData,
  HoursReportData,
  TimeOffReportData,
  AppNotification, // Added AppNotification import
  Schedule as ScheduleType, // Import Schedule type
  MessageType // Added MessageType import
} from '@/types';

// Define a type for the paginated notification response matching backend
export interface PaginatedNotificationsResponseData {
  items: AppNotification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unreadCount: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  private isRefreshing = false;
  private failedQueue: { resolve: (value?: any) => void; reject: (reason?: any) => void; config: RequestInit; endpoint: string }[] = [];

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('authToken');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  private processFailedQueue(error: Error | null, token: string | null = null) {
    this.failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(this.request(prom.endpoint, { ...prom.config, headers: { ...prom.config.headers, Authorization: `Bearer ${token}` } }));
      }
    });
    this.failedQueue = [];
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    // const currentToken = this.token; // Not strictly needed here as getHeaders() uses this.token
    
    const config: RequestInit = {
      ...options,
      credentials: 'include',
      headers: {
        ...this.getHeaders(), // This will use currentToken
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
        
        // Handle unauthorized errors (401)
        // Only attempt automatic refresh for regular API calls where we already have
        // a valid access token. Skip refresh for explicit auth endpoints like
        // /auth/login and /auth/refresh to avoid an infinite retry loop that would
        // leave the UI stuck in a loading state.
        const isAuthLogin = endpoint.startsWith('/auth/login');
        const isAuthRefresh = endpoint.startsWith('/auth/refresh');

        if (response.status === 401 && !isRetry && this.token && !isAuthLogin && !isAuthRefresh) {
          if (!this.isRefreshing) {
            this.isRefreshing = true;
            try {
              console.log('Access token expired or invalid, attempting to refresh...');
              const refreshResponse = await this.refreshToken(); // Assumes refreshToken updates this.token via setToken
              if (refreshResponse.success && refreshResponse.data.token) {
                console.log('Token refreshed successfully.');
                this.setToken(refreshResponse.data.token);
                this.processFailedQueue(null, refreshResponse.data.token);
                // Retry the original request with the new token
                // Update headers for the retry
                const newHeaders = { ...config.headers, Authorization: `Bearer ${refreshResponse.data.token}` };
                return this.request<T>(endpoint, { ...options, headers: newHeaders }, true);
              } else {
                console.error('Failed to refresh token:', refreshResponse.message);
                this.setToken(null); // Clear token
                this.processFailedQueue(new Error('Session expired. Please log in again.'), null);
                // Optionally, trigger a logout event or redirect here
                window.dispatchEvent(new Event('auth-error-logout'));
                throw new Error(errorData.message || `HTTP error! status: ${response.status} - Refresh failed`);
              }
            } catch (refreshError) {
              console.error('Error during token refresh:', refreshError);
              this.setToken(null);
              this.processFailedQueue(refreshError as Error, null);
              window.dispatchEvent(new Event('auth-error-logout'));
              throw refreshError; // Re-throw refresh error
            } finally {
              this.isRefreshing = false;
            }
          } else {
            // Add request to queue if refresh is already in progress
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject, config: options, endpoint });
            }) as Promise<ApiResponse<T>>;
          }
        }
        
        // Improved error message extraction
        let errorMessage = 'An error occurred';
        
        if (errorData) {
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.detail) {
            // FastAPI often uses 'detail' for error messages
            if (typeof errorData.detail === 'string') {
              errorMessage = errorData.detail;
            } else if (Array.isArray(errorData.detail)) {
              // FastAPI validation errors are often arrays
              errorMessage = errorData.detail.map((err: any) => {
                if (typeof err === 'string') return err;
                if (err.msg) return `${err.loc?.join('.')}: ${err.msg}`;
                return JSON.stringify(err);
              }).join(', ');
            } else {
              errorMessage = JSON.stringify(errorData.detail);
            }
          } else {
            errorMessage = JSON.stringify(errorData);
          }
        }
        
        errorMessage = errorMessage || `HTTP error! status: ${response.status}`;
        
        console.error(`API Error [${response.status}]:`, errorMessage);
        throw new Error(errorMessage);
      }
      
      // If response is OK, but no content (e.g., 204)
      if (response.status === 204) {
        return { success: true, data: null as any };
      }

      const data = await response.json();
      return { success: true, data: data as T }; // Cast data to T
    } catch (error) {
      const err = error as Error;
      console.error(`API request to ${endpoint} failed:`, err.message);
      // Ensure that if it's a caught refresh error, it's re-thrown correctly
      if (err.message.includes("Refresh failed") || err.message.includes("Session expired")) {
         this.setToken(null);
         window.dispatchEvent(new Event('auth-error-logout'));
      }
      // Re-throw a consistent error structure if possible, or the original error
      throw new Error(err.message || 'API request failed');
    }
  }

  // Authentication endpoints
  async login(email: string, password: string) {
    return this.request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout() {
    return this.request<void>('/auth/logout', {
      method: 'POST',
    });
  }

  async refreshToken() {
    return this.request<{ token: string }>('/auth/refresh', {
      method: 'POST',
    });
  }

  async forgotPassword(email: string) {
    return this.request<void>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, password: string) {
    return this.request<void>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  // User endpoints
  async getUsers(params?: any) {
    const queryString = params ? new URLSearchParams(params).toString() : '';
    return this.request<PaginatedResponse<any>>(`/users/${queryString ? `?${queryString}` : ''}`);
  }

  async createUser(userData: AddEmployeeFormData) {
    return this.request<User>('/users/', { // Expect User object in response
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(id: string, userData: EditEmployeeFormData | { isActive: boolean }) { // Allow isActive toggle too
    return this.request<User>(`/users/${id}/`, { // Expect User object in response
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  async deleteUser(id: string) {
    return this.request<void>(`/users/${id}/`, {
      method: 'DELETE',
    });
  }

  async getCurrentUser() {
    return this.request<any>('/users/me/');
  }

  async updateProfile(profileData: Partial<User>) { // Changed 'any' to Partial<User>
    return this.request<User>('/users/me/', { // Expect User in response
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  // Schedule endpoints
  async getSchedules(params?: {
    employeeId?: string;      // Changed from employee_id
    start_date?: string;      // Keep for now, though backend only uses 'date'
    end_date?: string;        // Keep for now
    department?: string;      // Changed from department_id
    date?: string;            // Add direct date filter if needed
    status?: string;          // Add status filter
    page?: number;
    limit?: number;
    // Backend does not yet support location or role filters for schedules
  }) {
    // Filter out undefined params before creating URLSearchParams
    const definedParams: Record<string, string> = {};
    if (params) {
      for (const key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key) && params[key as keyof typeof params] !== undefined) {
          // Special handling for date range if backend doesn't support it directly
          // For now, we pass start_date and end_date, and client will filter if needed.
          // Or, if backend supports 'date', we might need to make multiple calls or adjust.
          // The current backend 'list_schedules' uses single 'date', not range.
          definedParams[key] = String(params[key as keyof typeof params]);
        }
      }
    }
    const queryString = Object.keys(definedParams).length > 0 ? new URLSearchParams(definedParams).toString() : '';
    return this.request<PaginatedResponse<ScheduleType>>(`/schedules/${queryString ? `?${queryString}` : ''}`);
  }

  async createSchedule(scheduleData: any) { // TODO: Type scheduleData properly
    return this.request<any>('/schedules/', {
      method: 'POST',
      body: JSON.stringify(scheduleData),
    });
  }

  async updateSchedule(id: string, scheduleData: any) {
    return this.request<any>(`/schedules/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(scheduleData),
    });
  }

  async deleteSchedule(id: string) {
    return this.request<void>(`/schedules/${id}/`, {
      method: 'DELETE',
    });
  }

  async generateSchedule(constraintsId: string, dateRange: { startDate: string; endDate: string }) {
    return this.request<any>('/schedules/generate/', {
      method: 'POST',
      body: JSON.stringify({ constraintsId, ...dateRange }),
    });
  }

  async analyzeSchedulingConflicts(constraintsId: string, dateRange: { startDate: string; endDate: string }) {
    return this.request<any>('/schedules/analyze-conflicts/', {
      method: 'POST',
      body: JSON.stringify({ constraintsId, ...dateRange }),
    });
  }

  async applyAutoFixes(constraintsId: string, conflictAnalysis: any) {
    return this.request<{
      success: boolean;
      message: string;
      applied_fixes: any[];
      fix_count: number;
      updated_constraints: any;
    }>('/schedules/apply-auto-fixes/', {
      method: 'POST',
      body: JSON.stringify({ 
        constraints_id: constraintsId, 
        conflict_analysis: conflictAnalysis 
      }),
    });
  }

  async publishSchedules(scheduleIds: string[]) {
    const requestBody = { schedule_ids: scheduleIds };
    return this.request<any>('/schedules/publish/', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  // Time-off endpoints
  async getTimeOffRequests(params?: any) {
    const queryString = params ? new URLSearchParams(params).toString() : '';
    return this.request<PaginatedResponse<TimeOffRequest>>(`/time-off/${queryString ? `?${queryString}` : ''}`);
  }

  async createTimeOffRequest(requestData: TimeOffFormData) {
    return this.request<TimeOffRequest>('/time-off/', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  async updateTimeOffRequest(id: string, requestData: any) {
    return this.request<any>(`/time-off/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(requestData),
    });
  }

  async reviewTimeOffRequest(id: string, reviewData: any) {
    return this.request<any>(`/time-off/${id}/review/`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
  }

  async cancelTimeOffRequest(id: string) {
    // Uses the update endpoint to set status to 'cancelled'
    return this.updateTimeOffRequest(id, { status: 'cancelled' });
  }

  // Messages endpoints
  async getMessages(params?: any) {
    const queryString = params ? new URLSearchParams(params).toString() : '';
    return this.request<PaginatedResponse<any>>(`/messages/${queryString ? `?${queryString}` : ''}`);
  }

  async sendMessage(messageData: any) {
    return this.request<MessageType>("/messages/", {
      method: "POST",
      body: JSON.stringify(messageData),
    });
  }

  async updateMessage(messageId: string, messageData: Partial<MessageType>) {
    return this.request<MessageType>(`/messages/${messageId}/`, {
      method: "PUT",
      body: JSON.stringify(messageData),
    });
  }

  async deleteMessage(messageId: string) {
    return this.request<void>(`/messages/${messageId}/`, { method: "DELETE" });
  }

  async markMessageAsRead(id: string) {
    return this.request<void>(`/messages/${id}/read/`, { method: "POST" });
  }

  async acknowledgeMessage(id: string) {
    return this.request<void>(`/messages/${id}/acknowledge/`, {
      method: 'POST',
    });
  }

  // Analytics endpoints
  async getWorkforceMetrics(params?: { startDate?: string; endDate?: string }) {
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<WorkforceMetricsOut>(`/analytics/workforce/${queryString ? `?${queryString}` : ''}`);
  }

  async getScheduleAdherence(params?: any) {
    const queryString = params ? new URLSearchParams(params).toString() : '';
    return this.request<any>(`/analytics/schedule-adherence/${queryString ? `?${queryString}` : ''}`);
  }

  async getActivityLogs(params?: any) {
    const queryString = params ? new URLSearchParams(params).toString() : '';
    return this.request<PaginatedResponse<any>>(`/analytics/activity/${queryString ? `?${queryString}` : ''}`);
  }

  // Report Endpoints
  async getAttendanceReport(params: { startDate: string; endDate: string; department?: string; employeeId?: string }) {
    const queryString = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<AttendanceReportData>(`/reports/attendance/?${queryString}`);
  }

  async getHoursReport(params: { startDate: string; endDate: string; department?: string; }) {
    const queryString = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<HoursReportData>(`/reports/hours/?${queryString}`);
  }

  async getTimeOffReport(params: { startDate: string; endDate: string; status?: string; department?: string; }) {
    const queryString = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<TimeOffReportData>(`/reports/time-off/?${queryString}`);
  }

  async getReportsSummary() {
    return this.request<{
      totalEmployees: number;
      totalHours: number;
      averageAttendance: number;
      totalRequests: number;
      dateRange: { startDate: string; endDate: string };
      lastUpdated: string;
    }>(`/reports/summary/`);
  }

  async exportReport(reportType: string, format: string, params?: { startDate?: string; endDate?: string; department?: string; employeeId?: string; status?: string; }) {
    // Filter out undefined params before creating URLSearchParams
    const definedParams: Record<string, string> = {};
    if (params) {
      for (const key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key) && params[key as keyof typeof params] !== undefined) {
          definedParams[key] = params[key as keyof typeof params]!;
        }
      }
    }
    definedParams.format = format; // Add format to the query params as well

    const queryString = new URLSearchParams(definedParams).toString();
    
    // This request will return a JSON response with a downloadUrl based on current backend mock.
    // Actual file download will be handled by opening this URL.
    return this.request<{ message: string; downloadUrl: string; expiresAt: string }>(`/reports/export/${reportType}/?${queryString}`);
  }

  // Scheduling constraints endpoints
  async getSchedulingConstraints() {
    return this.request<any[]>('/scheduling-constraints/');
  }

  async createSchedulingConstraints(constraintsData: any) {
    return this.request<any>('/scheduling-constraints/', {
      method: 'POST',
      body: JSON.stringify(constraintsData),
    });
  }

  async updateSchedulingConstraints(id: string, constraintsData: any) {
    return this.request<any>(`/scheduling-constraints/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(constraintsData),
    });
  }

  async deleteSchedulingConstraint(id: string) {
    return this.request<void>(`/scheduling-constraints/${id}/`, {
      method: 'DELETE',
    });
  }



  // Notification Endpoints
  async getNotifications(params?: { page?: number; limit?: number; unread_only?: boolean }): Promise<ApiResponse<PaginatedNotificationsResponseData>> {
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<PaginatedNotificationsResponseData>(`/notifications/${queryString ? `?${queryString}` : ''}`);
  }

  async markNotificationAsRead(notificationId: string): Promise<ApiResponse<AppNotification>> {
    return this.request<AppNotification>(`/notifications/${notificationId}/read/`, {
      method: 'POST',
    });
  }

  async markAllNotificationsAsRead(): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/notifications/mark-all-read/`, {
      method: 'POST',
    });
  }

  // Location Management Endpoints
  async getLocations(params?: { is_active?: boolean }) {
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any[]>(`/locations/${queryString ? `?${queryString}` : ''}`);
  }

  async createLocation(locationData: {
    name: string;
    address: string;
    coordinates: { lat: number; lng: number };
    radius_meters?: number;
  }) {
    return this.request<any>('/locations/', {
      method: 'POST',
      body: JSON.stringify(locationData),
    });
  }

  async updateLocation(id: string, locationData: {
    name?: string;
    address?: string;
    coordinates?: { lat: number; lng: number };
    radius_meters?: number;
    is_active?: boolean;
  }) {
    return this.request<any>(`/locations/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(locationData),
    });
  }

  async deleteLocation(id: string) {
    return this.request<void>(`/locations/${id}/`, {
      method: 'DELETE',
    });
  }

  async checkLocationProximity(locationId: string, lat: number, lng: number) {
    const queryString = `lat=${lat}&lng=${lng}`;
    return this.request<{
      is_within_radius: boolean;
      distance_meters: number;
      location: any;
      message: string;
    }>(`/locations/${locationId}/nearby/?${queryString}`);
  }

  async findNearestLocation(lat: number, lng: number) {
    const queryString = `lat=${lat}&lng=${lng}`;
    return this.request<{
      nearest_location: any;
      distance_meters: number;
      is_within_radius: boolean;
      message: string;
    }>(`/locations/nearest/find/?${queryString}`);
  }

  // Attendance Tracking Endpoints
  async clockIn(data: {
    schedule_id?: string;
    gps_coordinates: { lat: number; lng: number };
    notes?: string;
  }) {
    return this.request<{
      success: boolean;
      message: string;
      clock_event: any;
      is_location_valid: boolean;
      distance_meters: number;
    }>('/attendance/clock-in/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async clockOut(data: {
    schedule_id?: string;
    gps_coordinates: { lat: number; lng: number };
    notes?: string;
  }) {
    return this.request<{
      success: boolean;
      message: string;
      clock_event: any;
      hours_worked: number;
      is_location_valid: boolean;
      distance_meters: number;
    }>('/attendance/clock-out/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAttendanceStatus() {
    return this.request<{
      is_clocked_in: boolean;
      current_shift: any;
      last_clock_event: any;
      total_hours_today: number;
    }>('/attendance/status/');
  }

  async getAttendanceEvents(params?: {
    start_date?: string;
    end_date?: string;
    event_type?: string;
  }) {
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any[]>(`/attendance/events/${queryString ? `?${queryString}` : ''}`);
  }

  async getAttendanceSummary(date?: string) {
    const queryString = date ? `date=${date}` : '';
    return this.request<{
      employee_id: string;
      date: string;
      clock_in_time: string | null;
      clock_out_time: string | null;
      total_hours: number;
      break_duration: number;
      is_complete: boolean;
      location_name: string;
      distance_compliance: boolean;
    }>(`/attendance/summary/${queryString ? `?${queryString}` : ''}`);
  }

  // Manager/Admin Attendance Endpoints
  async getTeamAttendanceStatus() {
    return this.request<Array<{
      employee: {
        id: string;
        firstName: string;
        lastName: string;
        department?: string;
      };
      attendance_status: any;
    }>>('/attendance/team/status/');
  }

  async getDailyAttendanceReport(params?: {
    date?: string;
    department?: string;
  }) {
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any[]>(`/attendance/reports/daily/${queryString ? `?${queryString}` : ''}`);
  }

  // Manager Attendance Management Endpoints
  async getAttendanceEventsForManagement(params?: {
    date?: string;
    employee_id?: string;
    department?: string;
  }) {
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<Array<{
      id: string;
      employee: {
        id: string;
        firstName: string;
        lastName: string;
        department?: string;
        email: string;
      };
      event_type: string;
      timestamp: string;
      gps_coordinates?: { lat: number; lng: number };
      distance_from_location?: number;
      is_valid: boolean;
      notes?: string;
      location?: {
        id: string;
        name: string;
        address: string;
      };
      schedule?: {
        id: string;
        startTime: string;
        endTime: string;
        role: string;
      } | null;
      created_at: string;
    }>>(`/attendance/manage/events/${queryString ? `?${queryString}` : ''}`);
  }

  async getDailyAttendanceSummary(params?: {
    date?: string;
    department?: string;
  }) {
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<Array<{
      employee: {
        id: string;
        firstName: string;
        lastName: string;
        department?: string;
        email: string;
      };
      date: string;
      schedule?: {
        id: string;
        startTime: string;
        endTime: string;
        location?: string;
        role?: string;
        scheduled_hours: number;
      } | null;
      actual: {
        clock_in_time: string | null;
        clock_out_time: string | null;
        total_hours: number;
        break_duration: number;
        overtime_hours: number;
      };
      status: 'on_time' | 'slightly_late' | 'late' | 'not_completed' | 'absent' | 'no_schedule';
      events_count: number;
      last_updated: string;
    }>>(`/attendance/manage/daily-summary/${queryString ? `?${queryString}` : ''}`);
  }

  async createClockEventForEmployee(eventData: {
    employee_id: string;
    event_type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
    timestamp: string; // ISO string
    schedule_id?: string;
    location_id?: string;
    gps_coordinates?: { lat: number; lng: number };
    distance_from_location?: number;
    notes?: string;
  }) {
    return this.request<{
      success: boolean;
      message: string;
      event: {
        id: string;
        employee_id: string;
        event_type: string;
        timestamp: string;
      };
    }>('/attendance/manage/create-event/', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }

  async updateClockEvent(eventId: string, updateData: {
    timestamp?: string;
    event_type?: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
    notes?: string;
    is_valid?: boolean;
  }) {
    return this.request<{
      success: boolean;
      message: string;
      event_id: string;
    }>(`/attendance/manage/events/${eventId}/`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  async deleteClockEvent(eventId: string) {
    return this.request<{
      success: boolean;
      message: string;
      event_id: string;
    }>(`/attendance/manage/events/${eventId}/`, {
      method: 'DELETE',
    });
  }

  async getRealTimeAttendanceMetrics(date?: string) {
    const queryString = date ? `date=${date}` : '';
    return this.request<{
      date: string;
      total_employees: number;
      scheduled_today: number;
      employees_clocked_in: number;
      employees_clocked_out: number;
      attendance_rate: number;
      completion_rate: number;
      total_hours_worked: number;
      late_arrivals: number;
      early_departures: number;
      currently_working: number;
      last_updated: string;
    }>(`/attendance/analytics/real-time-metrics/${queryString ? `?${queryString}` : ''}`);
  }

  // Employee Attendance Endpoints
  async getMyAttendanceRecords(params: { startDate: string; endDate: string }) {
    const queryString = new URLSearchParams(params).toString();
    return this.request<{ records: any[]; summary: any }>(`/attendance/my-records/?${queryString}`);
  }

  // Shift Swap Endpoints
  async getShiftSwapRequests(params?: { status?: string }) {
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any[]>(`/shift-swaps/${queryString ? `?${queryString}` : ''}`);
  }

  async createShiftSwapRequest(requestData: {
    requester_shift_id: string;
    target_employee_id?: string;
    target_shift_id?: string;
    reason: string;
    preferred_date_range?: { start: string; end: string };
  }) {
    return this.request<any>('/shift-swaps/', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  async getEligibleSwapPartners(shiftId: string) {
    return this.request<{
      eligible_partners: Array<{
        shift: {
          id: string;
          date: string;
          startTime: string;
          endTime: string;
          location: string;
          role: string;
          department: string;
        };
        employee: {
          id: string;
          firstName: string;
          lastName: string;
          department?: string;
        };
        eligibility: {
          is_eligible: boolean;
          reasons: string[];
          suggestions: Array<{
            type: string;
            message: string;
          }>;
        };
      }>;
    }>(`/shift-swaps/eligible-partners/${shiftId}`);
  }

  async respondToShiftSwapRequest(requestId: string, responseData: {
    employee_id: string;
    shift_id: string;
    accepted: boolean;
    notes?: string;
  }) {
    return this.request<any>(`/shift-swaps/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify(responseData),
    });
  }

  async reviewShiftSwapRequest(requestId: string, reviewData: {
    status: 'approved' | 'rejected';
    review_notes?: string;
    final_swap_partner_id?: string;
    final_swap_shift_id?: string;
  }) {
    return this.request<any>(`/shift-swaps/${requestId}/review`, {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
  }

  async cancelShiftSwapRequest(requestId: string) {
    return this.request<void>(`/shift-swaps/${requestId}`, {
      method: 'DELETE',
    });
  }

  // Schedule Adherence Reports
  async getScheduleAdherenceReport(params: {
    start_date?: string;
    end_date?: string;
    employee_id?: string;
    department?: string;
  }) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.append(key, value);
    });
    return this.request<{
      success: boolean;
      overall_statistics: {
        total_scheduled_shifts: number;
        total_attended_shifts: number;
        overall_attendance_rate: number;
        overall_punctuality_rate: number;
        date_range: { start_date: string; end_date: string };
      };
      status_distribution: Record<string, number>;
      employee_summaries: Array<{
        employee_id: string;
        employee_name: string;
        department?: string;
        total_scheduled_shifts: number;
        total_attended_shifts: number;
        attendance_rate: number;
        punctuality_rate: number;
        hours_adherence_rate: number;
      }>;
      detailed_adherence: Array<{
        employee_id: string;
        employee_name: string;
        date: string;
        scheduled_hours: number;
        actual_hours: number;
        status: string;
        late_minutes: number;
        early_minutes: number;
      }>;
    }>(`/reports/schedule-adherence?${searchParams.toString()}`);
  }

  async exportScheduleAdherenceReport(params: {
    format: string;
    start_date?: string;
    end_date?: string;
    employee_id?: string;
    department?: string;
  }) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.append(key, value);
    });
    return this.request<{
      success: boolean;
      format: string;
      content: string;
      filename: string;
      record_count: number;
    }>(`/reports/schedule-adherence/export?${searchParams.toString()}`);
  }

  // GDPR Compliance Endpoints
  async getMyPersonalData() {
    return this.request<{
      success: boolean;
      message: string;
      data: Record<string, unknown>;
    }>('/gdpr/my-data');
  }

  async exportMyPersonalData(): Promise<Blob> {
    // Handle binary data export directly with fetch
    const token = this.token;
    if (!token) {
      throw new Error('Authentication token not found');
    }

    const response = await fetch(`${this.baseURL}/gdpr/export-data`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/zip, application/octet-stream'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Export failed: ${response.status} - ${errorText}`);
    }

    return response.blob();
  }

  async deleteMyPersonalData() {
    return this.request<{
      success: boolean;
      message: string;
    }>('/gdpr/delete-my-data', {
      method: 'DELETE'
    });
  }

  async anonymizeMyPersonalData() {
    return this.request<{
      success: boolean;
      message: string;
      anonymous_id: string;
    }>('/gdpr/anonymize-my-data', {
      method: 'POST'
    });
  }

  async getDataProcessingInfo() {
    return this.request<{
      success: boolean;
      processing_info: {
        data_controller: {
          organization: string;
          contact: string;
        };
        processing_purposes: Record<string, string>;
        legal_basis: Record<string, string>;
        data_categories: Record<string, string[]>;
        retention_periods: Record<string, string>;
        your_rights: Record<string, string>;
      };
    }>('/gdpr/data-processing-info');
  }

  // Audit Log API methods
  async getAuditLogs(params: {
    user_id?: string;
    event_type?: string;
    start_date?: string;
    end_date?: string;
    ip_address?: string;
    severity?: string;
    limit?: number;
    skip?: number;
  }) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value.toString());
    });
    return this.request<Array<{
      _id: string;
      event_type: string;
      timestamp: string;
      user_id?: string;
      user_email?: string;
      ip_address?: string;
      user_agent?: string;
      details: Record<string, unknown>;
      severity: string;
      resource_id?: string;
      resource_type?: string;
      session_id?: string;
    }>>(`/audit/logs?${queryParams.toString()}`);
  }

  async getLoginStatistics() {
    return this.request<{
      success: boolean;
      statistics: {
        period: {
          start_date: string;
          end_date: string;
        };
        daily_stats: Array<{
          _id: string;
          successful_logins: number;
          failed_logins: number;
        }>;
        total_successful: number;
        total_failed: number;
      };
    }>('/audit/login-statistics');
  }

  async getSuspiciousActivity() {
    return this.request<{
      success: boolean;
      suspicious_events: Array<{
        type: string;
        description: string;
        ip_address?: string;
        user_emails?: string[];
        count: number;
        first_occurrence: string;
        last_occurrence: string;
        severity: string;
      }>;
      count: number;
    }>('/audit/suspicious-activity');
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
