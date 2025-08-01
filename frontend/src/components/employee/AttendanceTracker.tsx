import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, TrendingUp, Timer, Loader2, RefreshCw } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface AttendanceRecord {
  date: string;
  schedule?: {
    startTime: string;
    endTime: string;
    location: string;
    role: string;
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
}

interface AttendanceSummary {
  total_scheduled_days: number;
  total_worked_days: number;
  total_hours_worked: number;
  total_overtime_hours: number;
  attendance_rate: number;
  average_hours_per_day: number;
}

const AttendanceTracker: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedPeriod, setSelectedPeriod] = useState('thisWeek');
  const [customStartDate, setCustomStartDate] = useState(format(startOfWeek(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(endOfWeek(new Date()), 'yyyy-MM-dd'));
  
  // Data states
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAttendanceData = useCallback(async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      const dateRange = getDateRange();
      
      // Get attendance records
      const recordsResponse = await apiClient.getMyAttendanceRecords({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });
      
      if (recordsResponse.success && recordsResponse.data) {
        setAttendanceRecords(recordsResponse.data.records || []);
        setAttendanceSummary(recordsResponse.data.summary || null);
      }
    } catch (error) {
      console.error('Failed to load attendance data:', error);
      toast({
        title: "Error",
        description: "Failed to load your attendance records.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, customStartDate, customEndDate, selectedPeriod, toast]); // Added dependencies

  // Load data when period changes
  useEffect(() => {
    loadAttendanceData();
  }, [loadAttendanceData]);

  const getDateRange = () => {
    const today = new Date();
    
    switch (selectedPeriod) {
      case 'thisWeek':
        return {
          startDate: format(startOfWeek(today), 'yyyy-MM-dd'),
          endDate: format(endOfWeek(today), 'yyyy-MM-dd')
        };
      case 'lastWeek': {
        const lastWeek = subDays(today, 7);
        return {
          startDate: format(startOfWeek(lastWeek), 'yyyy-MM-dd'),
          endDate: format(endOfWeek(lastWeek), 'yyyy-MM-dd')
        };
      }
      case 'thisMonth':
        return {
          startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(today), 'yyyy-MM-dd')
        };
      case 'lastMonth': {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        return {
          startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd')
        };
      }
      case 'custom':
        return {
          startDate: customStartDate,
          endDate: customEndDate
        };
      default:
        return {
          startDate: format(startOfWeek(today), 'yyyy-MM-dd'),
          endDate: format(endOfWeek(today), 'yyyy-MM-dd')
        };
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

  const getStatusText = (status: string) => {
    const statusText: { [key: string]: string } = {
      'on_time': 'On Time',
      'slightly_late': 'Slightly Late',
      'late': 'Late',
      'not_completed': 'Incomplete',
      'absent': 'Absent',
      'no_schedule': 'No Schedule'
    };
    
    return statusText[status] || status;
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Attendance</h1>
          <p className="text-muted-foreground">Track your attendance history and hours worked</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key="thisWeek" value="thisWeek">This Week</SelectItem>
              <SelectItem key="lastWeek" value="lastWeek">Last Week</SelectItem>
              <SelectItem key="thisMonth" value="thisMonth">This Month</SelectItem>
              <SelectItem key="lastMonth" value="lastMonth">Last Month</SelectItem>
              <SelectItem key="custom" value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            onClick={loadAttendanceData}
            disabled={isLoading}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Custom Date Range */}
      {selectedPeriod === 'custom' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Custom Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {attendanceSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{attendanceSummary.attendance_rate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {attendanceSummary.total_worked_days} of {attendanceSummary.total_scheduled_days} days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatHours(attendanceSummary.total_hours_worked)}</div>
              <p className="text-xs text-muted-foreground">
                Avg: {formatHours(attendanceSummary.average_hours_per_day)}/day
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overtime Hours</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatHours(attendanceSummary.total_overtime_hours)}
              </div>
              <p className="text-xs text-muted-foreground">
                Extra hours worked
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Days Worked</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{attendanceSummary.total_worked_days}</div>
              <p className="text-xs text-muted-foreground">
                Out of {attendanceSummary.total_scheduled_days} scheduled
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Records */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Daily Records</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Attendance Records</CardTitle>
              <CardDescription>
                Your attendance history for the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Actual</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Overtime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceRecords.map((record) => (
                      <TableRow key={record.date}>
                        <TableCell className="font-medium">
                          {format(new Date(record.date), 'EEE, MMM dd')}
                        </TableCell>
                        <TableCell>
                          {record.schedule ? (
                            <div className="text-sm">
                              <p>{record.schedule.startTime} - {record.schedule.endTime}</p>
                              <p className="text-muted-foreground">{record.schedule.location}</p>
                              <p className="text-xs text-muted-foreground">
                                {Math.max(0, record.schedule.scheduled_hours).toFixed(1)}h scheduled
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No schedule</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>
                              {record.actual.clock_in_time ? format(new Date(record.actual.clock_in_time), 'HH:mm') : '--'} - {' '}
                              {record.actual.clock_out_time ? format(new Date(record.actual.clock_out_time), 'HH:mm') : '--'}
                            </p>
                            <p className="text-muted-foreground">
                              {record.actual.total_hours.toFixed(1)}h worked
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-mono">{formatHours(record.actual.total_hours)}</p>
                            {record.actual.break_duration > 0 && (
                              <p className="text-muted-foreground">
                                -{formatHours(record.actual.break_duration)} break
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(record.status)}>
                            {getStatusText(record.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {record.actual.overtime_hours > 0 ? (
                            <span className="font-medium text-orange-600">
                              +{formatHours(record.actual.overtime_hours)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {attendanceRecords.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <div className="text-muted-foreground">
                            No attendance records found for the selected period.
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Calendar View</CardTitle>
              <CardDescription>
                Visual representation of your attendance patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Calendar view coming soon! This will show a visual calendar with attendance status for each day.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AttendanceTracker; 