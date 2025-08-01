export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  department?: string;
  skills: string[];
  phoneNumber?: string;
  emergencyContact?: EmergencyContact;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
  availability: AvailabilityPattern[];
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phoneNumber: string;
}

export interface AvailabilityPattern {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  isAvailable: boolean;
}

export type UserRole = 'employee' | 'manager' | 'administrator';

export interface Schedule {
  id: string;
  employeeId: string;
  employee?: User;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  role: string;
  department: string;
  status: ScheduleStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleStatus = 'scheduled' | 'confirmed' | 'completed' | 'missed' | 'cancelled';

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  employee: User;
  startDate: string;
  endDate: string;
  reason: string;
  type: TimeOffType;
  status: RequestStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerNotes?: string;
  totalDays: number;
}

export type TimeOffType = 'vacation' | 'sick' | 'personal' | 'emergency' | 'other';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface TimeOffFormData {
  startDate: string;
  endDate: string;
  type: TimeOffType;
  reason: string;
}

export interface ShiftSwapRequest {
  id: string;
  requesterId: string;
  requester: User;
  targetEmployeeId: string;
  targetEmployee: User;
  originalShiftId: string;
  originalShift: Schedule;
  proposedShiftId?: string;
  proposedShift?: Schedule;
  reason: string;
  status: RequestStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerNotes?: string;
}

export interface Message {
  id: string;
  senderId: string;
  sender: User;
  recipientId?: string;
  recipient?: User;
  departmentId?: string;
  subject: string;
  content: string;
  type: MessageType;
  priority: MessagePriority;
  isRead: boolean;
  sentAt: string;
  readAt?: string;
  requiresAcknowledgment: boolean;
  acknowledgments: MessageAcknowledgment[];
}

export type MessageType = 'direct' | 'announcement' | 'system' | 'emergency';
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface MessageAcknowledgment {
  userId: string;
  user: User;
  acknowledgedAt: string;
}

export interface WorkforceMetrics {
  totalEmployees: number;
  activeEmployees: number;
  scheduledHours: number;
  actualHours: number;
  utilizationRate: number;
  attendanceRate: number;
  overtimeHours: number;
  departmentBreakdown: DepartmentMetric[];
  recentActivity: ActivityLog[];
}

export interface DepartmentMetric {
  department: string;
  employeeCount: number;
  scheduledHours: number;
  actualHours: number;
  utilizationRate: number;
}

export interface ActivityLog {
  id: string;
  userId: string;
  user: User;
  action: string;
  details: string;
  timestamp: string;
  ipAddress?: string;
}

export interface SchedulingConstraints {
  id: string;
  name: string;
  minStaffing: { [department: string]: number };
  maxStaffing: { [department: string]: number };
  operatingHours: {
    [dayOfWeek: number]: {
      open: string;
      close: string;
      isOpen: boolean;
    };
  };
  skillRequirements: { [role: string]: string[] };
  maxConsecutiveDays: number;
  minRestHours: number;
  maxHoursPerWeek: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AppNotification {
  id: string; // Corresponds to NotificationOut.id (stringified ObjectId)
  userId: string; // Corresponds to NotificationOut.userId (stringified ObjectId)
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'alert' | 'approval_request' | 'schedule_update' | string; // Allow more types or keep as string if backend is generic
  isRead: boolean;
  link?: string; // Corresponds to NotificationOut.link
  payload?: Record<string, unknown>; // Corresponds to NotificationOut.payload
  createdAt: string; // Corresponds to NotificationOut.createdAt (ISO date string)
  updatedAt?: string; // Corresponds to NotificationOut.updatedAt (ISO date string)
  // actionText can be derived on frontend if needed, or added to backend if it's dynamic per notification
}

export interface AddEmployeeFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole; // Using existing UserRole type
  department?: string;
  // Optional fields like skills, phoneNumber can be added later
}

export interface EditEmployeeFormData {
  firstName?: string;
  lastName?: string;
  department?: string;
  skills?: string[];
  phoneNumber?: string;
  emergencyContact?: EmergencyContact; // Assuming EmergencyContact is defined
  availability?: AvailabilityPattern[]; // Assuming AvailabilityPattern is defined
  // email, role, password, isActive are typically handled by separate, more privileged operations
}

// Analytics Types
export interface DepartmentMetricOut {
  department: string;
  employeeCount: number;
  scheduledHours: number;
  actualHours: number;
  utilizationRate: number;
}

export interface ActivityLogUserStub { // Simplified User for Activity Log on frontend if full UserOut is too much
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ActivityLogOut {
  id: string;
  userId: string;
  user?: ActivityLogUserStub; // Or full User type if needed and consistently provided by backend
  action: string;
  details?: Record<string, unknown>; // Changed any to unknown for better type safety
  timestamp: string; // ISO date string
  ipAddress?: string;
}

export interface StaffingPatternDay {
  day: string;
  shifts: number;
}

export interface StaffingPatternHour {
  hour: string;
  shifts: number;
}

export interface StaffingPatternsOut {
  byDayOfWeek: StaffingPatternDay[];
  byHourOfDay: StaffingPatternHour[];
}

export interface WorkforceMetricsOut {
  totalEmployees: number;
  activeEmployees: number;
  scheduledHours: number;
  actualHours: number; // Currently mocked on backend
  utilizationRate: number; // Based on mocked actualHours
  attendanceRate: number; // Currently mocked on backend
  overtimeHours: number; // Currently mocked on backend
  departmentBreakdown: DepartmentMetricOut[];
  recentActivity: ActivityLogOut[];
  staffingPatterns: StaffingPatternsOut;
}

// Report Types
interface EmployeeCoreInfo { // Reusable snippet for report employee data
  id: string;
  firstName: string;
  lastName: string;
  department?: string;
}

export interface EmployeeAttendanceData {
  employee: EmployeeCoreInfo;
  totalScheduled: number;
  totalCompleted: number;
  totalMissed: number;
  attendanceRate: number;
  totalHours: number;
}
export interface AttendanceReportData {
  dateRange: { startDate: string; endDate: string };
  attendanceData: EmployeeAttendanceData[];
}

export interface EmployeeHoursData {
  employee: EmployeeCoreInfo;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
}
export interface HoursReportData {
  dateRange: { startDate: string; endDate: string };
  totalHours: number;
  hoursData: EmployeeHoursData[];
}

export interface TimeOffReportSummary {
  totalRequests: number;
  totalDays: number;
  statusBreakdown: Partial<Record<RequestStatus, number>>; // Use partial as not all statuses might be present
  typeBreakdown: Partial<Record<TimeOffType, number>>;   // Use partial
}
export interface TimeOffReportData {
  dateRange: { startDate: string; endDate: string };
  summary: TimeOffReportSummary;
  requests: TimeOffRequest[]; // TimeOffRequest is already defined
}
