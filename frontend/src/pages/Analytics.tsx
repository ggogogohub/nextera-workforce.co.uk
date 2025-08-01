import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import {
  CalendarDays,
  Users,
  TrendingUp,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  Timer,
  RefreshCw,
  Download,
  Filter,
  BarChart3,
  WifiOff,
  AlertCircle
} from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek, isToday } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Add a utility function for delays and request throttling
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface HistoricalDataPoint {
  date: string;
  fullDate: string;
  attendance_rate: number;
  employees_clocked_in: number;
  total_hours_worked: number;
  late_arrivals: number;
}

interface AttendanceMetrics {
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

interface WorkforceMetrics {
  totalEmployees: number;
  activeEmployees: number;
  scheduledHours: number;
  actualHours: number;
  utilizationRate: number;
  attendanceRate: number;
  overtimeHours: number;
  departmentBreakdown: Array<{
    department: string;
    employeeCount: number;
    scheduledHours: number;
    actualHours: number;
    utilizationRate: number;
  }>;
  recentActivity: Array<{
    id: string;
    userId: string;
    action: string;
    details?: Record<string, unknown>;
    timestamp: string;
    ipAddress?: string;
  }>;
  staffingPatterns: {
    byDayOfWeek: Array<{ day: string; shifts: number }>;
    byHourOfDay: Array<{ hour: string; shifts: number }>;
  };
}

const CHART_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1'];

const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
};

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border rounded shadow">
        <p className="font-medium">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const Analytics = () => {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfWeek(new Date()),
    to: endOfWeek(new Date()),
  });
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [refreshInterval, setRefreshInterval] = useState<number>(30); // seconds

  // Data states
  const [realTimeMetrics, setRealTimeMetrics] = useState<AttendanceMetrics | null>(null);
  const [workforceMetrics, setWorkforceMetrics] = useState<WorkforceMetrics | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadRealTimeMetrics = useCallback(async () => {
    try {
      const response = await apiClient.getRealTimeAttendanceMetrics();
      if (response.success && response.data) {
        setRealTimeMetrics(response.data);
      } else {
        throw new Error('Failed to fetch real-time metrics.');
      }
    } catch (error) {
      console.error('Real-time metrics not available:', error);
      toast({
        title: "System Unavailable",
        description: "Could not connect to real-time workforce data. Please try again later.",
        variant: "destructive",
      });
      setRealTimeMetrics(null);
    }
  }, [toast]);

  const loadWorkforceMetrics = useCallback(async () => {
    try {
      const params = dateRange ? {
        startDate: format(dateRange.from!, 'yyyy-MM-dd'),
        endDate: format(dateRange.to!, 'yyyy-MM-dd'),
      } : undefined;

      const response = await apiClient.getWorkforceMetrics(params);
      if (response.success && response.data) {
        setWorkforceMetrics(response.data);
      } else {
        throw new Error('Failed to fetch workforce metrics.');
      }
    } catch (error) {
      console.error('Failed to load workforce metrics:', error);
      toast({
        title: "System Unavailable",
        description: "Could not connect to workforce performance data. Please try again later.",
        variant: "destructive",
      });
      setWorkforceMetrics(null);
    }
  }, [dateRange, toast]);

  const loadHistoricalData = useCallback(async () => {
    try {
      // Generate historical attendance data with throttling
      const days: HistoricalDataPoint[] = [];
      const endDate = new Date();
      
      // Add small delays between requests to prevent rate limiting
      for (let i = 6; i >= 0; i--) {
        const date = subDays(endDate, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        
        try {
          // Add throttling delay
          await delay(50);
          const response = await apiClient.getRealTimeAttendanceMetrics(dateStr);
          if (response.success && response.data) {
            days.push({
              date: format(date, 'MMM dd'),
              fullDate: dateStr,
              attendance_rate: response.data.attendance_rate,
              employees_clocked_in: response.data.employees_clocked_in,
              total_hours_worked: response.data.total_hours_worked,
              late_arrivals: response.data.late_arrivals,
            });
          }
        } catch (error) {
          console.error(`Failed to load data for ${dateStr}:`, error);
          // Skip this day if data is not available
        }
      }
      
      setHistoricalData(days);
      
      // If we have very little data, show a warning
      if (days.length < 3) {
        toast({
          title: "Limited Historical Data",
          description: "Some historical data is not available. Analytics may be incomplete.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error('Failed to load historical data:', error);
      toast({
        title: "Historical Data Unavailable",
        description: "Could not load historical attendance data. Please try again later.",
        variant: "destructive",
      });
      setHistoricalData([]);
    }
  }, [toast]);

  const loadDepartments = useCallback(async () => {
    try {
      const response = await apiClient.getUsers({ limit: 500 });
      if (response.success && response.data) {
        const depts = new Set(
          response.data.items
            .map((u: { department?: string }) => u.department)
            .filter(Boolean) as string[]
        );
        setDepartments(Array.from(depts).sort());
      } else {
        throw new Error('Failed to fetch departments.');
      }
    } catch (error) {
      console.error('Failed to load departments:', error);
      toast({
        title: "Department Data Unavailable",
        description: "Could not load department information for filtering.",
        variant: "destructive",
      });
      setDepartments([]);
    }
  }, [toast]);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadRealTimeMetrics(),
        loadWorkforceMetrics(),
        loadHistoricalData(),
        loadDepartments()
      ]);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to load analytics data:', error);
      toast({
        title: "Error",
        description: "Failed to load analytics data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, loadRealTimeMetrics, loadWorkforceMetrics]);

  // Auto-refresh for real-time data
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        if (isToday(new Date())) {
          loadRealTimeMetrics();
        }
      }, refreshInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [refreshInterval, loadRealTimeMetrics]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleRefresh = async () => {
    await loadAllData();
    toast({
      title: "Data Refreshed",
      description: "Analytics data has been updated with the latest information.",
    });
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
  };

  const handleExportData = () => {
    if (workforceMetrics) {
      const exportData = {
        realTimeMetrics,
        workforceMetrics,
        historicalData,
        exportDate: new Date().toISOString(),
        dateRange: dateRange ? {
          from: dateRange.from?.toISOString(),
          to: dateRange.to?.toISOString()
        } : null
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_export_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: "Analytics data has been exported to your downloads.",
      });
    }
  };

  const getTrendIndicator = (current: number, previous: number) => {
    const change = current - previous;
    const changePercent = ((change / previous) * 100).toFixed(1);
    
    if (change > 0) {
      return (
        <span className="text-green-600 text-sm">
          +{changePercent}% from yesterday
        </span>
      );
    } else if (change < 0) {
      return (
        <span className="text-red-600 text-sm">
          {changePercent}% from yesterday
        </span>
      );
    } else {
      return (
        <span className="text-gray-600 text-sm">
          No change from yesterday
        </span>
      );
    }
  };

  if (isLoading && !workforceMetrics) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="animate-pulse">
            <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg w-48 mb-2"></div>
            <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-80"></div>
          </div>
          <div className="animate-pulse flex gap-2">
            <div className="h-10 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-32"></div>
            <div className="h-10 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-40"></div>
            <div className="h-10 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-24"></div>
          </div>
        </div>
        
        {/* Premium Skeleton Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-24"></div>
                  <div className="h-4 w-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded"></div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-16 mb-2"></div>
                <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-32 mb-3"></div>
                <div className="h-2 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Premium Chart Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-40 mb-2"></div>
                <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-64"></div>
              </CardHeader>
              <CardContent>
                <div className="h-72 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Department Performance Skeleton */}
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-5 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-48 mb-2"></div>
            <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-80"></div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="h-5 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-24"></div>
                    <div className="h-5 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-16"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-20"></div>
                      <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-10"></div>
                    </div>
                    <div className="h-2 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-full"></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-16 mb-1"></div>
                      <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-10"></div>
                    </div>
                    <div>
                      <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-12 mb-1"></div>
                      <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded w-10"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Loading indicator */}
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-gray-600">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-sm font-medium">Loading analytics data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">
            Real-time workforce insights and performance metrics
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-1">
              Last updated: {format(lastUpdated, 'MMM dd, yyyy - HH:mm')}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Select 
            value={refreshInterval.toString()} 
            onValueChange={(value) => setRefreshInterval(parseInt(value))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key="manual" value="0">Manual</SelectItem>
              <SelectItem key="30s" value="30">30s</SelectItem>
              <SelectItem key="1m" value="60">1m</SelectItem>
              <SelectItem key="5m" value="300">5m</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key="all_departments" value="all">All Departments</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          
          <Button variant="outline" onClick={handleExportData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Real-time Metrics Cards */}
      {realTimeMetrics ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Currently Active</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {realTimeMetrics.currently_working}
            </div>
              <p className="text-xs text-muted-foreground">
                {realTimeMetrics.employees_clocked_in} clocked in today
              </p>
              <div className="mt-2">
                <Progress 
                  value={(realTimeMetrics.currently_working / realTimeMetrics.total_employees) * 100} 
                  className="h-1" 
                />
            </div>
          </CardContent>
        </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {realTimeMetrics.attendance_rate.toFixed(1)}%
            </div>
              <p className="text-xs text-muted-foreground">
                {realTimeMetrics.employees_clocked_in} of {realTimeMetrics.total_employees}
              </p>
              <div className="mt-2">
                <Progress value={realTimeMetrics.attendance_rate} className="h-1" />
            </div>
          </CardContent>
        </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hours Worked</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {realTimeMetrics.total_hours_worked.toFixed(1)}h
            </div>
              <p className="text-xs text-muted-foreground">
                Total hours today
              </p>
              {historicalData.length > 1 && (
                <div className="mt-2">
                  {getTrendIndicator(
                    realTimeMetrics.total_hours_worked,
                    historicalData[historicalData.length - 2]?.total_hours_worked || realTimeMetrics.total_hours_worked
                  )}
            </div>
              )}
          </CardContent>
        </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Issues Today</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {realTimeMetrics.late_arrivals}
            </div>
              <p className="text-xs text-muted-foreground">
                Late arrivals
              </p>
              <div className="mt-2 flex items-center gap-4 text-xs">
                <span className="text-red-600">
                  {realTimeMetrics.early_departures} early departures
                </span>
            </div>
          </CardContent>
        </Card>
      </div>
      ) : (
        <Card className="p-8">
          <div className="text-center">
            <WifiOff className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-time Data Unavailable</h3>
            <p className="text-gray-600 mb-4">
              Cannot connect to live workforce metrics. Please check your connection and try refreshing.
            </p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </Card>
      )}

      {/* Main Analytics Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attendance Trends */}
            <Card>
              <CardHeader>
                <CardTitle>7-Day Attendance Trend</CardTitle>
                <CardDescription>
                  Attendance rates over the past week
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historicalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="attendance_rate" 
                        stroke="#8884d8" 
                        fill="#8884d8" 
                        fillOpacity={0.3}
                        name="Attendance Rate (%)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-gray-600">Historical data unavailable</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hours Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Hours Worked</CardTitle>
                <CardDescription>
                  Total hours worked each day
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historicalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar 
                        dataKey="total_hours_worked" 
                        fill="#82ca9d" 
                        name="Hours Worked"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-gray-600">Historical data unavailable</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Department Performance - Full Width */}
          {workforceMetrics && workforceMetrics.departmentBreakdown.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Department Performance</CardTitle>
                <CardDescription>
                  Utilization rates and performance metrics by department
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {workforceMetrics.departmentBreakdown.map((dept, index) => (
                    <div key={dept.department} className="space-y-3 p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">{dept.department}</h3>
                        <Badge variant="secondary">{dept.employeeCount} employees</Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Utilization Rate</span>
                          <span className="font-medium">{dept.utilizationRate.toFixed(1)}%</span>
                        </div>
                        <Progress value={dept.utilizationRate} className="h-2" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Scheduled</p>
                          <p className="font-medium">{dept.scheduledHours.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Actual</p>
                          <p className="font-medium">{dept.actualHours.toFixed(1)}h</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="p-8">
              <div className="text-center">
                <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Department Data Unavailable</h3>
                <p className="text-gray-600 mb-4">
                  Cannot load department performance metrics at this time.
                </p>
                <Button onClick={handleRefresh} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </Card>
          )}

          {/* Recent Activity */}
          {workforceMetrics && workforceMetrics.recentActivity.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest workforce activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {workforceMetrics.recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(activity.timestamp), 'MMM dd, HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="p-8">
              <div className="text-center">
                <Activity className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-gray-600">Recent activity data unavailable</p>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Attendance & Issues Trend</CardTitle>
                <CardDescription>
                  Track attendance rates alongside late arrivals over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historicalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="attendance_rate" 
                        stroke="#8884d8" 
                        name="Attendance Rate (%)"
                        strokeWidth={2}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="late_arrivals" 
                        stroke="#ff7c7c" 
                        name="Late Arrivals"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Trend Data Unavailable</h3>
                      <p className="text-gray-600 mb-4">
                        Cannot load historical trend data at this time.
                      </p>
                      <Button onClick={handleRefresh} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Data
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="departments" className="space-y-6">
          {workforceMetrics && workforceMetrics.departmentBreakdown.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Department Utilization</CardTitle>
                  <CardDescription>
                    Hours utilization by department
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={workforceMetrics.departmentBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="department" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar 
                        dataKey="utilizationRate" 
                        fill="#8884d8" 
                        name="Utilization Rate (%)"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Employee Distribution</CardTitle>
                  <CardDescription>
                    Employee count by department
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={workforceMetrics.departmentBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ department, employeeCount }) => `${department}: ${employeeCount}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="employeeCount"
                      >
                        {workforceMetrics.departmentBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="p-12">
              <div className="text-center">
                <Users className="mx-auto h-16 w-16 text-gray-300 mb-6" />
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Department Analytics Unavailable</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  We couldn't load department-specific analytics data. This may be due to a temporary system issue.
                </p>
                <Button onClick={handleRefresh} variant="default">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Loading
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="patterns" className="space-y-6">
          {workforceMetrics && workforceMetrics.staffingPatterns ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Staffing by Day of Week</CardTitle>
                  <CardDescription>
                    Average shifts scheduled by weekday
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={workforceMetrics.staffingPatterns.byDayOfWeek}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar 
                        dataKey="shifts" 
                        fill="#82ca9d" 
                        name="Shifts"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Staffing by Hour</CardTitle>
                  <CardDescription>
                    Peak staffing hours throughout the day
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={workforceMetrics.staffingPatterns.byHourOfDay}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Area 
                        type="monotone" 
                        dataKey="shifts" 
                        stroke="#ffc658" 
                        fill="#ffc658" 
                        fillOpacity={0.3}
                        name="Active Shifts"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="p-12">
              <div className="text-center">
                <BarChart3 className="mx-auto h-16 w-16 text-gray-300 mb-6" />
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Staffing Patterns Unavailable</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Staffing pattern data is currently unavailable. Please try again later.
                </p>
                <Button onClick={handleRefresh} variant="default">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Loading
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
