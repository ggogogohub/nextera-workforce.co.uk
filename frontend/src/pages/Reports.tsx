import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart3, 
  Download, 
  Calendar as CalendarIcon, 
  Filter,
  Users,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Eye,
  RefreshCw,
  Search,
  ChevronDown
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, addDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { apiClient } from '@/lib/api';
import { User, AttendanceReportData, HoursReportData, TimeOffReportData, RequestStatus, TimeOffType } from '@/types';
import { useToast } from "@/hooks/use-toast";

type ReportType = "attendance" | "hours" | "time-off" | "schedule-adherence" | "";
type ReportData = AttendanceReportData | HoursReportData | TimeOffReportData | null;

interface TimeOffRequestItem {
  id: string;
  employeeId: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    department?: string;
    email: string;
    role: string;
  };
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  totalDays: number;
  reason?: string;
  submittedAt?: string;
}

interface ReportSummary {
  totalEmployees: number;
  totalHours: number;
  averageAttendance: number;
  totalRequests: number;
}

export const Reports = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [employeeIdFilter, setEmployeeIdFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("all"); 
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [reportData, setReportData] = useState<ReportData>(null);
  const [summary, setSummary] = useState<ReportSummary>({
    totalEmployees: 0,
    totalHours: 0,
    averageAttendance: 95,
    totalRequests: 0
  });
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  const [uniqueDepartments, setUniqueDepartments] = useState<string[]>([]);
  const [isDownloadingStaticReport, setIsDownloadingStaticReport] = useState<ReportType | string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  const fetchSummaryData = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      // Use the new dedicated summary endpoint for faster, more accurate data
      const summaryResponse = await apiClient.getReportsSummary();
      
      if (summaryResponse.success && summaryResponse.data) {
        
        setSummary({
          totalEmployees: summaryResponse.data.totalEmployees,
          totalHours: summaryResponse.data.totalHours,
          averageAttendance: summaryResponse.data.averageAttendance,
          totalRequests: summaryResponse.data.totalRequests
        });

        // Try to get real-time attendance status if user has permissions
        try {
          const currentUser = await apiClient.getCurrentUser();
          if (currentUser.success && currentUser.data?.role !== 'employee') {
            const teamStatusResponse = await apiClient.getTeamAttendanceStatus();
            if (teamStatusResponse.success) {
              // Real-time team attendance loaded successfully
            }
          }
        } catch (attendanceError) {
          // Attendance status not available or insufficient permissions
        }
        
        // Remove unprofessional toast - data updates silently
      } else {
        throw new Error(summaryResponse.message || "Failed to fetch summary data");
      }

    } catch (error) {
      console.error("Failed to fetch summary data:", error);
      
      // Fallback to the old method if the summary endpoint fails
      try {
        // Falling back to individual API calls
        const usersResponse = await apiClient.getUsers({ limit: 1000 });
        const schedulesResponse = await apiClient.getSchedules({ limit: 1000 });
        
        let totalEmployees = 0;
        let totalHours = 0;
        let averageAttendance = 0;
        
        if (usersResponse.success && usersResponse.data) {
          totalEmployees = usersResponse.data.items.filter(u => u.isActive).length;
        }
        
        if (schedulesResponse.success && schedulesResponse.data) {
          const confirmedSchedules = schedulesResponse.data.items.filter(
            s => s.status === 'confirmed' || s.status === 'completed'
          );
          
          totalHours = confirmedSchedules.reduce((sum, schedule) => {
            try {
              const start = new Date(`1970-01-01T${schedule.startTime}:00`);
              const end = new Date(`1970-01-01T${schedule.endTime}:00`);
              const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
              return sum + (hours > 0 ? hours : 0);
            } catch {
              return sum;
            }
          }, 0);
          
          // Calculate attendance rate
          const allSchedules = schedulesResponse.data.items;
          const totalScheduled = allSchedules.length;
          const totalCompleted = allSchedules.filter(s => s.status === 'completed').length;
          averageAttendance = totalScheduled > 0 ? (totalCompleted / totalScheduled) * 100 : 0;
        }
        
        setSummary(prev => ({
          ...prev,
          totalEmployees,
          totalHours: Math.round(totalHours),
          averageAttendance: Math.round(averageAttendance * 10) / 10,
        }));
        
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
        toast({
          title: "Data Loading Error",
          description: "Failed to load summary statistics. Please check your connection and try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoadingSummary(false);
    }
  }, [toast]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch departments and employee count
        const usersResponse = await apiClient.getUsers({ limit: 100 });
        if (usersResponse.success && usersResponse.data) {
          const departments = new Set(usersResponse.data.items.map(u => u.department).filter(Boolean) as string[]);
          setUniqueDepartments(Array.from(departments).sort());
        }

        // Fetch real summary data
        await fetchSummaryData();
      } catch (error) {
        console.error("Failed to fetch initial data", error);
        toast({
          title: "Data Loading Error",
          description: "Failed to load initial report data.",
          variant: "destructive",
        });
      }
    };
    fetchInitialData();
  }, [fetchSummaryData, toast]);

  const handleGenerateReport = async () => {
    if (!reportType || !dateRange?.from || !dateRange?.to) {
      setReportError("Please select a report type and a valid date range.");
      return;
    }
    setIsLoadingReport(true);
    setReportError(null);
    setReportData(null);

    const baseParams = {
      startDate: format(dateRange.from, "yyyy-MM-dd"),
      endDate: format(dateRange.to, "yyyy-MM-dd"),
    };

    try {
      let response;
      if (reportType === "attendance") {
        const attendanceParams: { startDate: string; endDate: string; department?: string; employeeId?: string } = {...baseParams};
        if (departmentFilter && departmentFilter !== "all") attendanceParams.department = departmentFilter;
        if (employeeIdFilter) attendanceParams.employeeId = employeeIdFilter;
        response = await apiClient.getAttendanceReport(attendanceParams);
      } else if (reportType === "hours") {
        const hoursParams: { startDate: string; endDate: string; department?: string; } = {...baseParams};
        if (departmentFilter && departmentFilter !== "all") hoursParams.department = departmentFilter;
        response = await apiClient.getHoursReport(hoursParams);
      } else if (reportType === "time-off") {
        const timeOffParams: { startDate: string; endDate: string; status?: string; department?: string; } = {...baseParams};
        if (departmentFilter && departmentFilter !== "all") timeOffParams.department = departmentFilter;
        if (statusFilter && statusFilter !== "all") timeOffParams.status = statusFilter;
        response = await apiClient.getTimeOffReport(timeOffParams);
      } else if (reportType === "schedule-adherence") {
        const scheduleAdherenceParams: { startDate: string; endDate: string; department?: string; } = {...baseParams};
        if (departmentFilter && departmentFilter !== "all") scheduleAdherenceParams.department = departmentFilter;
        response = await apiClient.getScheduleAdherenceReport(scheduleAdherenceParams);
      } else {
        throw new Error("Invalid report type selected");
      }

      if (response && response.success && response.data) {
        setReportData(response.data);
        setIsGenerateDialogOpen(false);
        setActiveTab("data");
        
        // Refresh summary data after generating a report
        await fetchSummaryData();
        
        toast({
          title: "Report Generated Successfully",
          description: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report has been generated and is ready for review.`,
        });
      } else {
        const errorMessage = response?.message || "Failed to generate report.";
        setReportError(errorMessage);
        toast({
          title: "Error Generating Report",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setReportError(errorMessage);
      toast({
        title: "Error Generating Report",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoadingReport(false);
    }
  };

  const downloadJsonFile = (data: ReportData, type: ReportType | string, titleForFile?: string) => {
    if (!data || !type) {
      toast({
        title: "Download Error",
        description: "No report data available to download.",
        variant: "destructive",
      });
      return;
    }
    
    try {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    
    const safeTitle = (titleForFile || (typeof type === 'string' ? type : 'report')).toLowerCase().replace(/[\s-]+/g, '_').replace(/[^\w_]/g, '');
    const fileName = `${safeTitle}_report_${format(new Date(), "yyyy-MM-dd_HHmmss")}.json`;
    
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    } catch (error) {
      console.error("Error downloading report:", error);
      toast({
        title: "Download Error",
        description: "Failed to download the report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const downloadCsvFile = (data: Record<string, unknown>[], filename: string, headers: string[]) => {
    try {
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => 
          JSON.stringify(row[header] || '')
        ).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `${filename}_${format(new Date(), "yyyy-MM-dd_HHmmss")}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
      
      toast({
        title: "CSV Downloaded",
        description: `${filename} has been downloaded successfully.`,
      });
    } catch (error) {
      toast({
        title: "Download Error",
        description: "Failed to download CSV file.",
        variant: "destructive",
      });
    }
  };
  
  const fetchAndDownloadReport = async (reportTypeToFetch: ReportType, cardTitle: string) => {
    if (isDownloadingStaticReport === cardTitle) return;

    setIsDownloadingStaticReport(cardTitle);
    toast({
      title: "Generating Report",
      description: `Generating ${cardTitle}...`,
    });

    const toDate = new Date();
    const fromDate = addDays(toDate, -30);
    
    const baseParams: { startDate: string; endDate: string; department?: string; status?: string} = {
      startDate: format(fromDate, "yyyy-MM-dd"),
      endDate: format(toDate, "yyyy-MM-dd"),
    };

    try {
      let response;
      let actualReportTypeForDownload: ReportType | string = reportTypeToFetch;

      if (cardTitle === "Schedule Adherence") {
        response = await apiClient.getScheduleAdherenceReport(baseParams);
        actualReportTypeForDownload = "schedule_adherence_summary";
      } else if (cardTitle === "Attendance Report") {
        response = await apiClient.getAttendanceReport(baseParams);
        actualReportTypeForDownload = "attendance";
      } else if (cardTitle === "Overtime Analysis") {
        response = await apiClient.getHoursReport(baseParams);
        actualReportTypeForDownload = "hours";
      } else {
        console.warn(`No specific mapping for quick download of "${cardTitle}". Defaulting to attendance.`);
        response = await apiClient.getAttendanceReport(baseParams);
        actualReportTypeForDownload = "attendance";
      }

      if (response && response.success && response.data) {
        downloadJsonFile(response.data as ReportData, actualReportTypeForDownload, cardTitle);
        toast({
          title: "Report Downloaded",
          description: `${cardTitle} has been downloaded successfully.`,
        });
      } else {
        const errorMessage = response?.message || 'Failed to generate report';
        console.error(`Failed to fetch ${cardTitle}:`, errorMessage);
        toast({
          title: "Error Downloading Report",
          description: `Failed to generate ${cardTitle}: ${errorMessage}`,
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error(`Error fetching ${cardTitle}:`, err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      toast({
        title: "Error Downloading Report",
        description: `Error generating ${cardTitle}: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsDownloadingStaticReport(null);
    }
  };

  const handleDownloadGeneratedReport = (format: 'json' | 'csv') => {
    if (reportData && reportType) {
      if (format === 'json') {
      downloadJsonFile(reportData, reportType, reportType);
      } else if (format === 'csv' && reportData) {
        // Convert report data to CSV format based on type
        if (reportType === 'attendance' && 'attendanceData' in reportData) {
          const headers = ['Employee ID', 'First Name', 'Last Name', 'Department', 'Total Scheduled', 'Total Completed', 'Total Missed', 'Attendance Rate', 'Total Hours'];
          const data = reportData.attendanceData.map(item => ({
            'Employee ID': item.employee.id,
            'First Name': item.employee.firstName,
            'Last Name': item.employee.lastName,
            'Department': item.employee.department || 'N/A',
            'Total Scheduled': item.totalScheduled,
            'Total Completed': item.totalCompleted,
            'Total Missed': item.totalMissed,
            'Attendance Rate': `${item.attendanceRate.toFixed(2)}%`,
            'Total Hours': item.totalHours.toFixed(2)
          }));
          downloadCsvFile(data, 'attendance_report', headers);
        } else if (reportType === 'hours' && 'hoursData' in reportData) {
          const headers = ['Employee ID', 'First Name', 'Last Name', 'Department', 'Regular Hours', 'Overtime Hours', 'Total Hours'];
          const data = reportData.hoursData.map(item => ({
            'Employee ID': item.employee.id,
            'First Name': item.employee.firstName,
            'Last Name': item.employee.lastName,
            'Department': item.employee.department || 'N/A',
            'Regular Hours': item.regularHours.toFixed(2),
            'Overtime Hours': item.overtimeHours.toFixed(2),
            'Total Hours': item.totalHours.toFixed(2)
          }));
          downloadCsvFile(data, 'hours_report', headers);
        } else if (reportType === 'time-off' && 'requests' in reportData) {
          const headers = ['Employee ID', 'First Name', 'Last Name', 'Department', 'Start Date', 'End Date', 'Type', 'Status', 'Total Days'];
          const data = reportData.requests.map((item: TimeOffRequestItem) => ({
            'Employee ID': item.employee?.id || item.employeeId,
            'First Name': item.employee?.firstName || 'Unknown',
            'Last Name': item.employee?.lastName || 'Employee',
            'Department': item.employee?.department || 'N/A',
            'Start Date': item.startDate,
            'End Date': item.endDate,
            'Type': item.type,
            'Status': item.status,
            'Total Days': item.totalDays || 0
          }));
          downloadCsvFile(data, 'timeoff_report', headers);
        }
      }
    } else {
      toast({
        title: "Download Error",
        description: "No report data available to download.",
        variant: "destructive",
      });
    }
  };

  const renderReportTable = () => {
    if (!reportData) return null;

    if (reportType === 'attendance' && 'attendanceData' in reportData) {
      const filteredData = reportData.attendanceData.filter(item =>
        searchQuery === "" ||
        item.employee.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.employee.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.employee.department && item.employee.department.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-center">Scheduled</TableHead>
              <TableHead className="text-center">Completed</TableHead>
              <TableHead className="text-center">Missed</TableHead>
              <TableHead className="text-center">Attendance Rate</TableHead>
              <TableHead className="text-center">Total Hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => (
              <TableRow key={item.employee.id} className="hover:bg-muted/50">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{item.employee.firstName} {item.employee.lastName}</span>
                    <span className="text-sm text-muted-foreground">{item.employee.id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{item.employee.department || 'N/A'}</Badge>
                </TableCell>
                <TableCell className="text-center">{item.totalScheduled}</TableCell>
                <TableCell className="text-center">
                  <span className="text-green-600 font-medium">{item.totalCompleted}</span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-red-600 font-medium">{item.totalMissed}</span>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center space-x-2">
                    <Progress value={item.attendanceRate} className="w-16 h-2" />
                    <span className="text-sm font-medium">{item.attendanceRate.toFixed(1)}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-center font-mono">{item.totalHours.toFixed(1)}h</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    if (reportType === 'hours' && 'hoursData' in reportData) {
      const filteredData = reportData.hoursData.filter(item =>
        searchQuery === "" ||
        item.employee.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.employee.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.employee.department && item.employee.department.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-center">Regular Hours</TableHead>
              <TableHead className="text-center">Overtime Hours</TableHead>
              <TableHead className="text-center">Total Hours</TableHead>
              <TableHead className="text-center">Overtime %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item) => {
              const overtimePercentage = item.totalHours > 0 ? (item.overtimeHours / item.totalHours) * 100 : 0;
              return (
                <TableRow key={item.employee.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{item.employee.firstName} {item.employee.lastName}</span>
                      <span className="text-sm text-muted-foreground">{item.employee.id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.employee.department || 'N/A'}</Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono">{item.regularHours.toFixed(1)}h</TableCell>
                  <TableCell className="text-center">
                    <span className={`font-mono ${item.overtimeHours > 0 ? 'text-orange-600 font-medium' : ''}`}>
                      {item.overtimeHours.toFixed(1)}h
                    </span>
                  </TableCell>
                  <TableCell className="text-center font-mono font-medium">{item.totalHours.toFixed(1)}h</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center space-x-2">
                      <Progress value={overtimePercentage} className="w-16 h-2" />
                      <span className="text-sm">{overtimePercentage.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      );
    }

    if (reportType === 'time-off' && 'requests' in reportData) {
      const filteredData = reportData.requests.filter((item: TimeOffRequestItem) =>
        searchQuery === "" ||
        (item.employee?.firstName && item.employee.firstName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.employee?.lastName && item.employee.lastName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.employee?.department && item.employee.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.status.toLowerCase().includes(searchQuery.toLowerCase())
      );

      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Start Date</TableHead>
              <TableHead className="text-center">End Date</TableHead>
              <TableHead className="text-center">Days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item: TimeOffRequestItem) => (
              <TableRow key={item.id} className="hover:bg-muted/50">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {item.employee?.firstName || 'Unknown'} {item.employee?.lastName || 'Employee'}
                    </span>
                    <span className="text-sm text-muted-foreground">{item.employee?.id || item.employeeId}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{item.employee?.department || 'N/A'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={
                    item.type === 'vacation' ? 'default' :
                    item.type === 'sick' ? 'destructive' :
                    item.type === 'personal' ? 'secondary' :
                    'outline'
                  }>
                    {item.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={
                    item.status === 'approved' ? 'default' :
                    item.status === 'pending' ? 'secondary' :
                    item.status === 'rejected' ? 'destructive' :
                    'outline'
                  }>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{item.startDate}</TableCell>
                <TableCell className="text-center">{item.endDate}</TableCell>
                <TableCell className="text-center font-medium">{item.totalDays || 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    return null;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return 'text-green-600';
      case 'pending': return 'text-yellow-600';
      case 'rejected': return 'text-red-600';
      case 'cancelled': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">
            Generate and download workforce analytics reports
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={fetchSummaryData}
            disabled={isLoadingSummary}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingSummary ? 'animate-spin' : ''}`} />
            {isLoadingSummary ? 'Refreshing...' : 'Refresh Data'}
          </Button>
        
        <Dialog open={isGenerateDialogOpen} onOpenChange={(open)=>{
            setIsGenerateDialogOpen(open);
            if(!open) setIsDatePickerOpen(false);
        }}>
          <DialogTrigger asChild>
            <Button>
                <BarChart3 className="mr-2 h-4 w-4" />
                Generate Custom Report
            </Button>
          </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle className="text-2xl">Generate Custom Report</DialogTitle>
              <DialogDescription>
                  Configure your report parameters to generate detailed workforce analytics.
              </DialogDescription>
            </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
                <div className="space-y-4">
              <div className="grid gap-2">
                    <Label htmlFor="report-type" className="text-base font-medium">Report Type</Label>
                <Select value={reportType} onValueChange={(value) => setReportType(value as ReportType)}>
                      <SelectTrigger id="report-type" className="h-12">
                        <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                        <SelectItem value="attendance">
                          <div className="flex items-center space-x-2">
                            <Users className="h-4 w-4" />
                            <span>Attendance Report</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="hours">
                          <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4" />
                            <span>Hours Worked Report</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="time-off">
                          <div className="flex items-center space-x-2">
                            <CalendarIcon className="h-4 w-4" />
                            <span>Time-Off Report</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="schedule-adherence">
                          <div className="flex items-center space-x-2">
                            <TrendingUp className="h-4 w-4" />
                            <span>Schedule Adherence Report</span>
                          </div>
                        </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isGenerateDialogOpen && (
                <div className="grid gap-2">
                      <Label htmlFor="date-range-button" className="text-base font-medium">Date Range</Label>
                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                            className={`h-12 justify-start text-left font-normal ${!dateRange && "text-muted-foreground"}`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>
                          ) : (
                            format(dateRange.from, "LLL dd, y")
                          )
                        ) : (
                          <span>Pick a date range</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={(range)=>{
                          setDateRange(range);
                          if(range?.from && range?.to) setIsDatePickerOpen(false);
                        }}
                        numberOfMonths={2}
                            weekStartsOn={1}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="department-filter" className="text-base font-medium">Department (Optional)</Label>
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger id="department-filter" className="h-12">
                        <SelectValue placeholder="All Departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key="all_depts" value="all">All Departments</SelectItem>
                        {uniqueDepartments.map(dept => (
                          <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {reportType === 'time-off' && (
                  <div className="grid gap-2">
                      <Label htmlFor="status-filter" className="text-base font-medium">Status (Optional)</Label>
                    <Select
                      value={statusFilter}
                        onValueChange={(value) => setStatusFilter(value as RequestStatus | "all")}
                    >
                        <SelectTrigger id="status-filter" className="h-12">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                                    <SelectContent>
                <SelectItem key="all_statuses" value="all">All Statuses</SelectItem>
                <SelectItem key="pending" value="pending">Pending</SelectItem>
                <SelectItem key="approved" value="approved">Approved</SelectItem>
                <SelectItem key="rejected" value="rejected">Rejected</SelectItem>
                <SelectItem key="cancelled" value="cancelled">Cancelled</SelectItem>
              </SelectContent>
                    </Select>
                  </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={handleGenerateReport} 
                  disabled={isLoadingReport || !reportType}
                >
                  {isLoadingReport ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Generate Report
                </>
              )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">{summary.totalEmployees}</div>
                <p className="text-xs text-muted-foreground">Active employees</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">{summary.totalHours.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Scheduled hours</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Attendance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">{summary.averageAttendance}%</div>
                <p className="text-xs text-muted-foreground">Overall rate</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time-Off Requests</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold">{summary.totalRequests}</div>
                <p className="text-xs text-muted-foreground">Total requests</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="data" disabled={!reportData}>Report Data</TabsTrigger>
          <TabsTrigger value="quick-reports">Quick Reports</TabsTrigger>
          <TabsTrigger value="export" disabled={!reportData}>Export</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
        <Card>
          <CardHeader>
              <CardTitle>Workforce Overview</CardTitle>
              <CardDescription>
                Key performance indicators and summary statistics for your workforce
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Attendance Metrics</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span>Overall Attendance Rate</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={summary.averageAttendance} className="w-20" />
                        <span className="font-medium">{summary.averageAttendance}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Active Employees</span>
                      <span className="font-medium">{summary.totalEmployees}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Recent Activity</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Reports system operational</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span>Data sync completed</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span>Awaiting time-off approvals</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          {isLoadingReport && (
            <Card>
              <CardContent className="p-12 text-center">
                <RefreshCw className="mx-auto h-8 w-8 animate-spin mb-4" />
                <p>Generating your report...</p>
              </CardContent>
            </Card>
          )}

          {reportError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div>
                  <div>
                    <h3 className="font-medium text-red-800">Error Generating Report</h3>
                    <p className="text-sm text-red-600 mt-1">{reportError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {reportData && !isLoadingReport && !reportError && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="capitalize">{reportType} Report</CardTitle>
                    <CardDescription>
                      {reportData && 'dateRange' in reportData && reportData.dateRange && (
                        <>Report period: {reportData.dateRange.startDate} to {reportData.dateRange.endDate}</>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search employees..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 w-64"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadGeneratedReport('csv')}
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadGeneratedReport('json')}
                    >
                <Download className="mr-2 h-4 w-4" />
                Download JSON
              </Button>
                  </div>
            </div>
          </CardHeader>
          <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  {renderReportTable()}
                </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="quick-reports" className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
              Schedule Adherence
            </CardTitle>
            <CardDescription>
              Compare scheduled vs actual hours worked
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
                  onClick={() => fetchAndDownloadReport("attendance", "Schedule Adherence")}
              disabled={isDownloadingStaticReport === "Schedule Adherence"}
            >
                  {isDownloadingStaticReport === "Schedule Adherence" ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download Report
                    </>
                  )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
              Attendance Report
            </CardTitle>
            <CardDescription>
              Employee attendance patterns and statistics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fetchAndDownloadReport("attendance", "Attendance Report")}
              disabled={isDownloadingStaticReport === "Attendance Report"}
            >
                  {isDownloadingStaticReport === "Attendance Report" ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download Report
                    </>
                  )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
              Overtime Analysis
            </CardTitle>
            <CardDescription>
              Overtime hours and cost analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fetchAndDownloadReport("hours", "Overtime Analysis")}
              disabled={isDownloadingStaticReport === "Overtime Analysis"}
            >
                  {isDownloadingStaticReport === "Overtime Analysis" ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download Report
                    </>
                  )}
            </Button>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Export Options</CardTitle>
              <CardDescription>
                Export your generated report in various formats for further analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button
                  onClick={() => handleDownloadGeneratedReport('csv')}
                  disabled={!reportData}
                  className="flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export as CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDownloadGeneratedReport('json')}
                  disabled={!reportData}
                  className="flex items-center justify-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Export as JSON
                </Button>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• CSV format is ideal for spreadsheet applications like Excel or Google Sheets</p>
                <p>• JSON format preserves all data structure and is suitable for programmatic processing</p>
                <p>• All exports include complete employee information and calculated metrics</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};