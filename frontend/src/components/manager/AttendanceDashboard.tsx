import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { 
  Clock, 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Calendar,
  MapPin,
  CheckCircle,
  XCircle,
  Timer,
  Activity,
  Loader2,
  Search,
  Filter
} from 'lucide-react';
import { format, isToday } from 'date-fns';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { User } from '@/types';

// Add a utility function for delays and caching
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cache for API responses to prevent duplicate requests
interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

const apiCache = new Map<string, CacheEntry>();
const activeRequests = new Map<string, Promise<unknown>>();

const getCacheKey = (endpoint: string, params: Record<string, unknown> = {}) => {
  return `${endpoint}-${JSON.stringify(params)}`;
};

const getCachedData = (key: string, ttlMs: number = 30000): unknown => {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data;
  }
  return null;
};

const setCachedData = (key: string, data: unknown, ttlMs: number = 30000) => {
  apiCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
};

interface AttendanceEvent {
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
}

interface DailySummary {
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
}

interface RealTimeMetrics {
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
}

type EventType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

interface AttendanceQueryParams {
  date: string;
  department?: string;
}

interface UpdateEventData {
  event_type: EventType;
  timestamp: string;
  notes?: string;
}

const AttendanceDashboard: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data states
  const [metrics, setMetrics] = useState<RealTimeMetrics | null>(null);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);
  const [attendanceEvents, setAttendanceEvents] = useState<AttendanceEvent[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  
  // Dialog states
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isEditEventOpen, setIsEditEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AttendanceEvent | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  
  // Form states
  const [newEventForm, setNewEventForm] = useState({
    employee_id: '',
    event_type: 'clock_in' as EventType,
    timestamp: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: ''
  });

  const loadMetrics = useCallback(async () => {
    const cacheKey = getCacheKey('real-time-metrics', { date: selectedDate });
    
    // Check cache first
    const cachedData = getCachedData(cacheKey, 30000); // 30 second cache
    if (cachedData) {
      setMetrics(cachedData as RealTimeMetrics);
      return;
    }

    // Check if request is already in progress
    if (activeRequests.has(cacheKey)) {
      try {
        const data = await activeRequests.get(cacheKey);
        setMetrics(data as RealTimeMetrics);
      } catch (error) {
        console.error('Failed to load metrics from active request:', error);
        toast({
          title: "System Unavailable",
          description: "Could not connect to real-time attendance data. Please try refreshing.",
          variant: "destructive",
        });
        setMetrics(null);
      }
      return;
    }

    // Make new request with deduplication
    const requestPromise = (async () => {
      try {
        await delay(Math.random() * 100); // Small random delay to prevent thundering herd
        const response = await apiClient.getRealTimeAttendanceMetrics(selectedDate);
        if (response.success && response.data) {
          setCachedData(cacheKey, response.data, 30000);
          return response.data;
        }
        throw new Error('Invalid response');
      } catch (error) {
        console.error('Failed to load metrics:', error);
        toast({
          title: "Real-time Data Unavailable",
          description: "Cannot load attendance metrics at this time. Please try again later.",
          variant: "destructive",
        });
        throw error; // Re-throw to handle in outer catch
      } finally {
        activeRequests.delete(cacheKey);
      }
    })();

    activeRequests.set(cacheKey, requestPromise);
    
    try {
      const data = await requestPromise;
      setMetrics(data as RealTimeMetrics);
    } catch (error) {
      setMetrics(null);
    }
  }, [selectedDate, toast]);

  const loadDailySummary = useCallback(async () => {
    const cacheKey = getCacheKey('daily-summary', { date: selectedDate, department: departmentFilter });
    
    // Check cache first
    const cachedData = getCachedData(cacheKey, 30000);
    if (cachedData) {
      setDailySummary(cachedData as DailySummary[]);
      return;
    }

    // Check if request is already in progress
    if (activeRequests.has(cacheKey)) {
      try {
        const data = await activeRequests.get(cacheKey);
        setDailySummary(data as DailySummary[]);
      } catch (error) {
        setDailySummary([]);
      }
      return;
    }

    // Make new request with deduplication
    const requestPromise = (async () => {
      try {
        await delay(Math.random() * 100 + 50); // Stagger requests
        const params = { date: selectedDate };
        if (departmentFilter && departmentFilter !== 'all') {
          Object.assign(params, { department: departmentFilter });
        }
        
        const response = await apiClient.getDailyAttendanceSummary(params);
        if (response.success && response.data) {
          setCachedData(cacheKey, response.data, 30000);
          return response.data;
        }
        return [];
      } catch (error) {
        console.error('Failed to load daily summary:', error);
        return [];
      } finally {
        activeRequests.delete(cacheKey);
      }
    })();

    activeRequests.set(cacheKey, requestPromise);
    
    try {
      const data = await requestPromise;
      setDailySummary(data as DailySummary[]);
    } catch (error) {
      // Already handled in promise
    }
  }, [selectedDate, departmentFilter]);

  const loadAttendanceEvents = useCallback(async () => {
    const cacheKey = getCacheKey('attendance-events', { date: selectedDate, department: departmentFilter });
    
    // Check cache first
    const cachedData = getCachedData(cacheKey, 15000); // Shorter cache for events
    if (cachedData) {
      setAttendanceEvents(cachedData as AttendanceEvent[]);
      return;
    }

    // Check if request is already in progress
    if (activeRequests.has(cacheKey)) {
      try {
        const data = await activeRequests.get(cacheKey);
        setAttendanceEvents(data as AttendanceEvent[]);
      } catch (error) {
        setAttendanceEvents([]);
      }
      return;
    }

    // Make new request with deduplication
    const requestPromise = (async () => {
      try {
        await delay(Math.random() * 100 + 100); // Stagger requests more
        const params = { date: selectedDate };
        if (departmentFilter && departmentFilter !== 'all') {
          Object.assign(params, { department: departmentFilter });
        }
        
        const response = await apiClient.getAttendanceEventsForManagement(params);
        if (response.success && response.data) {
          setCachedData(cacheKey, response.data, 15000);
          return response.data;
        }
        return [];
      } catch (error) {
        console.error('Failed to load attendance events:', error);
        return [];
      } finally {
        activeRequests.delete(cacheKey);
      }
    })();

    activeRequests.set(cacheKey, requestPromise);
    
    try {
      const data = await requestPromise;
      setAttendanceEvents(data as AttendanceEvent[]);
    } catch (error) {
      // Already handled in promise
    }
  }, [selectedDate, departmentFilter]);

  const loadAllData = useCallback(async () => {
    await Promise.all([
      loadMetrics(),
      loadDailySummary(),
      loadAttendanceEvents()
    ]);
  }, [loadMetrics, loadDailySummary, loadAttendanceEvents]);

  // Auto-refresh interval with throttling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isToday(new Date(selectedDate))) {
      // Auto-refresh every 2 minutes for today's data (much less aggressive)
      interval = setInterval(() => {
        // Clear cache for current data to force fresh fetch
        const metricsKey = getCacheKey('real-time-metrics', { date: selectedDate });
        const summaryKey = getCacheKey('daily-summary', { date: selectedDate, department: departmentFilter });
        const eventsKey = getCacheKey('attendance-events', { date: selectedDate, department: departmentFilter });
        
        apiCache.delete(metricsKey);
        apiCache.delete(summaryKey);
        apiCache.delete(eventsKey);
        
        loadAllData();
      }, 120000); // 2 minutes instead of 30 seconds
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [selectedDate, departmentFilter, loadAllData]);

  const loadInitialData = useCallback(async () => {
    // Check if we already have the data cached
    const cacheKey = 'initial-employee-data';
    const cachedData = getCachedData(cacheKey, 300000); // 5 minute cache for initial data
    
    if (cachedData && typeof cachedData === 'object' && 'employees' in cachedData && 'departments' in cachedData) {
      const data = cachedData as { employees: User[]; departments: string[] };
      setEmployees(data.employees);
      setDepartments(data.departments);
      return;
    }

    try {
      // Load employees and departments
      const usersResponse = await apiClient.getUsers({ limit: 500 });
      
      if (usersResponse.success && usersResponse.data) {
        const activeEmployees = usersResponse.data.items.filter((u: User) => u.isActive && u.role === 'employee');
        setEmployees(activeEmployees);
        
        const depts = new Set(activeEmployees.map((u: User) => u.department).filter(Boolean) as string[]);
        const departmentsArray = Array.from(depts).sort();
        setDepartments(departmentsArray);
        
        // Cache the results
        setCachedData(cacheKey, { employees: activeEmployees, departments: departmentsArray }, 300000);
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
      toast({
        title: "Error",
        description: "Failed to load employees and departments.",
        variant: "destructive",
      });
    }
  }, []); // Remove toast from dependencies to prevent re-renders

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load data when filters change
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleCreateEvent = async () => {
    if (!newEventForm.employee_id || !newEventForm.timestamp) {
      toast({
        title: "Validation Error",
        description: "Please select an employee and set the timestamp.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.createClockEventForEmployee({
        employee_id: newEventForm.employee_id,
        event_type: newEventForm.event_type,
        timestamp: new Date(newEventForm.timestamp).toISOString(),
        notes: newEventForm.notes || undefined
      });

      if (response.success) {
        toast({
          title: "Success",
          description: "Clock event created successfully.",
        });
        
        setIsCreateEventOpen(false);
        setNewEventForm({
          employee_id: '',
          event_type: 'clock_in',
          timestamp: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          notes: ''
        });
        
        await loadAllData();
      } else {
        throw new Error(response.message || 'Failed to create event');
      }
    } catch (error) {
      console.error('Failed to create event:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create clock event.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateEvent = async (eventId: string, updateData: UpdateEventData) => {
    try {
      const response = await apiClient.updateClockEvent(eventId, updateData);
      
      if (response.success) {
        toast({
          title: "Success",
          description: "Clock event updated successfully.",
        });
        
        setIsEditEventOpen(false);
        setSelectedEvent(null);
        await loadAllData();
      } else {
        throw new Error(response.message || 'Failed to update event');
      }
    } catch (error) {
      console.error('Failed to update event:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update clock event.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteEvent = async () => {
    if (!deleteEventId) return;

    try {
      const response = await apiClient.deleteClockEvent(deleteEventId);
      
      if (response.success) {
        toast({
          title: "Success",
          description: "Clock event deleted successfully.",
        });
        
        setDeleteEventId(null);
        await loadAllData();
      } else {
        throw new Error(response.message || 'Failed to delete event');
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete clock event.",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_time': return 'text-green-600';
      case 'slightly_late': return 'text-yellow-600';
      case 'late': return 'text-red-600';
      case 'not_completed': return 'text-blue-600';
      case 'absent': return 'text-red-600';
      case 'no_schedule': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
      'on_time': 'default',
      'slightly_late': 'outline',
      'late': 'destructive',
      'not_completed': 'secondary',
      'absent': 'destructive',
      'no_schedule': 'outline'
    };
    
    return variants[status] || 'outline';
  };

  const filteredDailySummary = dailySummary.filter(item =>
    searchQuery === '' ||
    item.employee.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.employee.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.employee.department && item.employee.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredEvents = attendanceEvents.filter(item =>
    searchQuery === '' ||
    item.employee.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.employee.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.employee.department && item.employee.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Attendance Dashboard</h1>
          <p className="text-muted-foreground">Real-time attendance tracking and management</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
          
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key="all" value="all">All Departments</SelectItem>
              {departments.map((dept, index) => (
                <SelectItem key={`dept-${dept}-${index}`} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button
            onClick={loadAllData}
            size="sm"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Real-time Metrics */}
      {metrics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Currently Working</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{metrics.currently_working}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.employees_clocked_in} clocked in, {metrics.employees_clocked_out} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.attendance_rate}%</div>
              <p className="text-xs text-muted-foreground">
                {metrics.employees_clocked_in} of {metrics.total_employees} employees
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.total_hours_worked}</div>
              <p className="text-xs text-muted-foreground">
                Hours worked today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{metrics.late_arrivals}</div>
              <p className="text-xs text-muted-foreground">
                Late arrivals today
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="p-8">
          <div className="text-center">
            <Activity className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-time Metrics Unavailable</h3>
            <p className="text-gray-600 mb-4">
              Cannot connect to attendance metrics. Please check your connection and try refreshing.
            </p>
            <Button onClick={loadAllData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Daily Overview</TabsTrigger>
          <TabsTrigger value="events">Live Events</TabsTrigger>
          <TabsTrigger value="management">Manage Events</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Daily Attendance Summary</CardTitle>
                  <CardDescription>
                    Schedule vs actual comparison for {format(new Date(selectedDate), 'MMMM dd, yyyy')}
                  </CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search employees..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Overtime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDailySummary.map((item) => (
                    <TableRow key={item.employee.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.employee.firstName} {item.employee.lastName}</p>
                          <p className="text-sm text-muted-foreground">{item.employee.department || 'No Dept'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.schedule ? (
                          <div className="text-sm">
                            <p>{item.schedule.startTime} - {item.schedule.endTime}</p>
                            <p className="text-muted-foreground">
                              {Math.max(0, item.schedule.scheduled_hours).toFixed(1)}h scheduled
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No schedule</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>
                            {item.actual.clock_in_time ? format(new Date(item.actual.clock_in_time), 'HH:mm') : '--'} - {' '}
                            {item.actual.clock_out_time ? format(new Date(item.actual.clock_out_time), 'HH:mm') : '--'}
                          </p>
                          <p className="text-muted-foreground">{item.actual.total_hours.toFixed(1)}h worked</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-mono">{item.actual.total_hours.toFixed(1)}h</p>
                          {item.actual.break_duration > 0 && (
                            <p className="text-muted-foreground">-{item.actual.break_duration.toFixed(1)}h break</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadge(item.status)}>
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.actual.overtime_hours > 0 ? (
                          <span className="font-medium text-orange-600">
                            +{item.actual.overtime_hours.toFixed(1)}h
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Live Clock Events</CardTitle>
                  <CardDescription>
                    Real-time clock in/out events for {format(new Date(selectedDate), 'MMMM dd, yyyy')}
                  </CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Valid</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono">
                        {format(new Date(event.timestamp), 'HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{event.employee.firstName} {event.employee.lastName}</p>
                          <p className="text-sm text-muted-foreground">{event.employee.department || 'No Dept'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.event_type === 'clock_in' ? 'default' : 'secondary'}>
                          {event.event_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {event.location ? (
                          <div className="text-sm">
                            <p>{event.location.name}</p>
                            {event.distance_from_location !== undefined && (
                              <p className="text-muted-foreground">
                                {Math.round(event.distance_from_location)}m away
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {event.is_valid ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {event.notes || '--'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="management" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Event Management</CardTitle>
                  <CardDescription>
                    Create, edit, or delete clock events for employees
                  </CardDescription>
                </div>
                
                <Dialog open={isCreateEventOpen} onOpenChange={setIsCreateEventOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Event
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Clock Event</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Employee</Label>
                        <Select
                          value={newEventForm.employee_id}
                          onValueChange={(value) => setNewEventForm(prev => ({...prev, employee_id: value}))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.map((emp, index) => (
                              <SelectItem key={`emp-${emp.id}-${index}`} value={emp.id}>
                                {emp.firstName} {emp.lastName} ({emp.department || 'No Dept'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Event Type</Label>
                        <Select
                          value={newEventForm.event_type}
                          onValueChange={(value: EventType) => setNewEventForm(prev => ({...prev, event_type: value}))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem key="create_clock_in" value="clock_in">Clock In</SelectItem>
                            <SelectItem key="create_clock_out" value="clock_out">Clock Out</SelectItem>
                            <SelectItem key="create_break_start" value="break_start">Break Start</SelectItem>
                            <SelectItem key="create_break_end" value="break_end">Break End</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Date & Time</Label>
                        <Input
                          type="datetime-local"
                          value={newEventForm.timestamp}
                          onChange={(e) => setNewEventForm(prev => ({...prev, timestamp: e.target.value}))}
                        />
                      </div>
                      
                      <div>
                        <Label>Notes (Optional)</Label>
                        <Textarea
                          value={newEventForm.notes}
                          onChange={(e) => setNewEventForm(prev => ({...prev, notes: e.target.value}))}
                          placeholder="Additional notes about this event..."
                        />
                      </div>
                      
                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleCreateEvent} className="flex-1">
                          Create Event
                        </Button>
                        <Button variant="outline" onClick={() => setIsCreateEventOpen(false)} className="flex-1">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Valid</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        {event.employee.firstName} {event.employee.lastName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.event_type === 'clock_in' ? 'default' : 'secondary'}>
                          {event.event_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {format(new Date(event.timestamp), 'MMM dd, HH:mm')}
                      </TableCell>
                      <TableCell>
                        {event.is_valid ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedEvent(event);
                              setIsEditEventOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteEventId(event.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Edit Event Dialog */}
      <Dialog open={isEditEventOpen} onOpenChange={setIsEditEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Clock Event</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div>
                <Label>Employee</Label>
                <Input 
                  value={`${selectedEvent.employee.firstName} ${selectedEvent.employee.lastName}`}
                  disabled
                />
              </div>
              
              <div>
                <Label>Event Type</Label>
                <Select
                  value={selectedEvent.event_type}
                  onValueChange={(value: EventType) => setSelectedEvent(prev => prev ? {...prev, event_type: value} : null)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem key="edit_clock_in" value="clock_in">Clock In</SelectItem>
                    <SelectItem key="edit_clock_out" value="clock_out">Clock Out</SelectItem>
                    <SelectItem key="edit_break_start" value="break_start">Break Start</SelectItem>
                    <SelectItem key="edit_break_end" value="break_end">Break End</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={format(new Date(selectedEvent.timestamp), "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) => setSelectedEvent(prev => 
                    prev ? {...prev, timestamp: new Date(e.target.value).toISOString()} : null
                  )}
                />
              </div>
              
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={selectedEvent.notes || ''}
                  onChange={(e) => setSelectedEvent(prev => 
                    prev ? {...prev, notes: e.target.value} : null
                  )}
                  placeholder="Additional notes about this event..."
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={() => selectedEvent && handleUpdateEvent(selectedEvent.id, {
                    event_type: selectedEvent.event_type as EventType,
                    timestamp: selectedEvent.timestamp,
                    notes: selectedEvent.notes
                  })} 
                  className="flex-1"
                >
                  Update Event
                </Button>
                <Button variant="outline" onClick={() => setIsEditEventOpen(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Event Dialog */}
      <AlertDialog open={!!deleteEventId} onOpenChange={(open) => !open && setDeleteEventId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Clock Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this clock event? This action cannot be undone and may affect attendance calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteEventId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteEvent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AttendanceDashboard; 