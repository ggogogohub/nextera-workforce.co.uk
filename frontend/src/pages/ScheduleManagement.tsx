import { useState, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, Plus, Users, Clock, Zap, ChevronLeft, ChevronRight, Edit } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiClient } from '@/lib/api';
import { Schedule as ScheduleType, PaginatedResponse, User as UserType, ScheduleStatus } from '@/types';
import { format, startOfWeek, endOfWeek, parseISO, addWeeks, subWeeks, eachDayOfInterval } from 'date-fns';
import { DateRange } from "react-day-picker";
import { useToast } from '@/hooks/use-toast';
import { ScheduleEditForm, ScheduleEditFormValues } from '@/components/forms/ScheduleEditForm';
import { Label } from '@/components/ui/label';
import { AddShiftForm, AddShiftFormValues } from '@/components/forms/AddShiftForm';
import { ShiftCard } from '@/components/shared/ShiftCard';
import { SchedulePreviewKanban } from '@/components/shared/SchedulePreviewKanban';
import ConflictResolutionDialog from '@/components/shared/ConflictResolutionDialog';

interface ConflictAnalysisConflict {
  type: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  day?: string;
}

interface ConflictAnalysisSuggestion {
  type: string;
  message: string;
  action?: string;
  day?: string;
  current_min?: number;
  suggested_min?: number;
  current_max?: number;
  suggested_max?: number;
  suggested_value?: number;
  affected_days?: number;
  priority?: 'high' | 'medium' | 'low';
  impact?: string;
  effort?: 'easy' | 'moderate' | 'complex';
}

interface ConflictAnalysisData {
  constraint_name: string;
  date_range: {
    start: string;
    end: string;
  };
  total_employees: number;
  conflict_count: number;
  has_critical_conflicts: boolean;
  conflicts: ConflictAnalysisConflict[];
  suggestions: ConflictAnalysisSuggestion[];
  can_proceed: boolean;
}

const ITEMS_PER_PAGE = 10;
const ALL_DEPARTMENTS = "ALL_DEPARTMENTS"; 
const ALL_STATUSES = "ALL_STATUSES"; 
const ALL_EMPLOYEES = "ALL_EMPLOYEES"; // New constant for the "All Employees" option

const scheduleStatusOptions: ScheduleStatus[] = [
  'scheduled', 
  'confirmed', 
  'completed', 
  'missed', 
  'cancelled'
];

interface ScheduleApiParams {
  start_date: string;
  end_date: string;
  department?: string;
  status?: string;
  employeeId?: string;
}

interface ConstraintItem {
  id?: string;
  _id?: string;
  name?: string;
}

export const ScheduleManagement = () => {
  const [schedules, setSchedules] = useState<ScheduleType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>({
    from: startOfWeek(new Date(), { weekStartsOn: 1 }),
    to: endOfWeek(new Date(), { weekStartsOn: 1 }),
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL_DEPARTMENTS);
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL_EMPLOYEES);
  
  const [uniqueDepartments, setUniqueDepartments] = useState<string[]>([]);
  const [allEmployees, setAllEmployees] = useState<UserType[]>([]);

  const { toast } = useToast();

  // Scheduling constraints
  const [constraints, setConstraints] = useState<ConstraintItem[]>([]);
  const [selectedConstraintId, setSelectedConstraintId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [scheduleToEdit, setScheduleToEdit] = useState<ScheduleType | null>(null);
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [isAddShiftDialogOpen, setIsAddShiftDialogOpen] = useState(false);

  const [isGenerationDialogOpen, setIsGenerationDialogOpen] = useState(false);
  const [generationParams, setGenerationParams] = useState<{
    constraintId: string;
    dateRange: DateRange;
  }>({
    constraintId: '',
    dateRange: { from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }
  });

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [generatedSchedules, setGeneratedSchedules] = useState<ScheduleType[]>([]);

  // Conflict Resolution Dialog state
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflictAnalysisData, setConflictAnalysisData] = useState<ConflictAnalysisData | null>(null);
  const [isApplyingFixes, setIsApplyingFixes] = useState(false);

  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        const usersResponse = await apiClient.getUsers({ limit: 500 });
        if (usersResponse.success && usersResponse.data) {
          const users = usersResponse.data.items;
          const departments = new Set(users.map(u => u.department).filter(Boolean) as string[]);
          setUniqueDepartments(Array.from(departments).sort());

          // Store employees for employee filter (sort alphabetically by name for UX)
          const sortedEmployees = [...users].sort((a, b) => {
            const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
            const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
            return nameA.localeCompare(nameB);
          }).map((u: Partial<UserType> & { _id?: string }) => ({
            ...u,
            id: (u.id ?? u._id ?? '').toString(),
          }) as UserType);
          setAllEmployees(sortedEmployees as UserType[]);
        } else {
          console.error("Failed to fetch users for department filter:", usersResponse?.message); 
        }
      } catch (error) {
        console.error("Error in fetchFilterData (users for departments):", error); 
      }
    };
    fetchFilterData();
  }, []);

  const loadSchedules = useCallback(async (params: Omit<ScheduleApiParams, 'page' | 'limit'>) => {
    setIsLoading(true);
    // Always fetch all schedules for the range, no pagination
    const fullParams = { ...params, limit: 500, page: 1 }; 
    try {
      const response = await apiClient.getSchedules(fullParams);
      if (response.success && response.data) {
        const normalizedItems: ScheduleType[] = (response.data.items as (ScheduleType & { _id?: string })[]).map(
          (item) => ({
            ...item,
            id: (item.id ?? item._id ?? '').toString(),
          }) as ScheduleType
        );
        setSchedules(normalizedItems);
      } else {
        console.error("Failed to load schedules:", response.message);
        setSchedules([]);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const params: Partial<ScheduleApiParams> = {};

    if (selectedDateRange?.from && selectedDateRange?.to) {
      params.start_date = format(selectedDateRange.from, 'yyyy-MM-dd');
      params.end_date = format(selectedDateRange.to, 'yyyy-MM-dd');
    } else { 
      return; // Do not load if date range is incomplete
    }

    if (departmentFilter !== ALL_DEPARTMENTS) params.department = departmentFilter;
    if (statusFilter !== ALL_STATUSES) params.status = statusFilter;
    if (employeeFilter !== ALL_EMPLOYEES) params.employeeId = employeeFilter;
    
    loadSchedules(params as ScheduleApiParams);

  }, [selectedDateRange, departmentFilter, statusFilter, employeeFilter, loadSchedules]);

  const handleWeekNavigate = (direction: 'prev' | 'next') => {
    const currentFrom = selectedDateRange?.from || new Date();
    const newFrom = direction === 'prev' ? subWeeks(currentFrom, 1) : addWeeks(currentFrom, 1);
    setSelectedDateRange({
      from: startOfWeek(newFrom, { weekStartsOn: 1 }),
      to: endOfWeek(newFrom, { weekStartsOn: 1 }),
    });
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDateRange({
      from: startOfWeek(today, { weekStartsOn: 1 }),
      to: endOfWeek(today, { weekStartsOn: 1 }),
    });
  };

  // Fetch scheduling constraints once on mount
  useEffect(() => {
    const fetchConstraints = async () => {
      try {
        const res = await apiClient.getSchedulingConstraints();
        if (res.success && res.data) {
          const formatted = res.data.map(c => ({...c, id: c.id || c._id}));
          setConstraints(formatted);
          const defaultConstraint = formatted.find(c => c.name.toLowerCase().includes('default')) || formatted[0];
          if (defaultConstraint) {
            setSelectedConstraintId(defaultConstraint.id);
          }
        } else {
          console.error('Failed to fetch scheduling constraints:', res.message);
        }
      } catch (error) {
        console.error('Error fetching scheduling constraints:', error);
      }
    };
    fetchConstraints();
  }, []);

  // When constraints load, update the generation params state
  useEffect(() => {
    if (constraints.length > 0 && !generationParams.constraintId) {
      const defaultConstraint = constraints.find(c => c.name?.toLowerCase().includes('default')) || constraints[0];
      if (defaultConstraint) {
        setGenerationParams(prev => ({ ...prev, constraintId: defaultConstraint.id ?? defaultConstraint._id ?? '' }));
      }
    }
  }, [constraints, generationParams.constraintId]);

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string | null | undefined) => {
    if (setter === setDepartmentFilter) {
      setter(value || ALL_DEPARTMENTS);
    } else if (setter === setStatusFilter) {
      setter(value || ALL_STATUSES);
    } else if (setter === setEmployeeFilter) {
      setter(value || ALL_EMPLOYEES);
    }
  };
  
  const handleUpdateSchedule = async (data: ScheduleEditFormValues) => {
    if (!scheduleToEdit) return;
    try {
      await apiClient.updateSchedule(scheduleToEdit.id, data);
      toast({
        title: "Shift Updated",
        description: "The shift details have been successfully updated.",
      });
      setIsEditDialogOpen(false);
      setScheduleToEdit(null);
      // Reload schedules for the current view
      const params: Partial<ScheduleApiParams> = {};
      if (selectedDateRange?.from) params.start_date = format(selectedDateRange.from, 'yyyy-MM-dd');
      if (selectedDateRange?.to) params.end_date = format(selectedDateRange.to, 'yyyy-MM-dd');
      if (departmentFilter !== ALL_DEPARTMENTS) params.department = departmentFilter;
      if (statusFilter !== ALL_STATUSES) params.status = statusFilter;
      if (employeeFilter !== ALL_EMPLOYEES) params.employeeId = employeeFilter;
      if (params.start_date && params.end_date) {
        loadSchedules(params as ScheduleApiParams);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update the shift.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSchedule = async () => {
    if (!scheduleToEdit) return;
    setIsDeletingSchedule(true);
    try {
      await apiClient.deleteSchedule(scheduleToEdit.id);
      toast({
        title: "Shift Deleted",
        description: "The shift has been successfully deleted.",
      });
      setIsEditDialogOpen(false);
      setIsDeleteConfirmOpen(false);
      setScheduleToEdit(null);
      // Reload schedules for the current view
      const params: Partial<ScheduleApiParams> = {};
      if (selectedDateRange?.from) params.start_date = format(selectedDateRange.from, 'yyyy-MM-dd');
      if (selectedDateRange?.to) params.end_date = format(selectedDateRange.to, 'yyyy-MM-dd');
      if (departmentFilter !== ALL_DEPARTMENTS) params.department = departmentFilter;
      if (statusFilter !== ALL_STATUSES) params.status = statusFilter;
      if (employeeFilter !== ALL_EMPLOYEES) params.employeeId = employeeFilter;
      if (params.start_date && params.end_date) {
        loadSchedules(params as ScheduleApiParams);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete the shift.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingSchedule(false);
    }
  };

  const handleDeleteClick = () => {
    setIsDeleteConfirmOpen(true);
  };

  const handleAddShift = async (data: AddShiftFormValues) => {
    try {
      await apiClient.createSchedule({
        ...data,
        date: format(data.date, 'yyyy-MM-dd'),
      });
      toast({
        title: "Shift Added",
        description: "The new shift has been successfully created.",
      });
      setIsAddShiftDialogOpen(false);
      // Reload schedules to show the new shift
      const params: Omit<ScheduleApiParams, 'page'|'limit'> = {
        start_date: format(data.date, 'yyyy-MM-dd'),
        end_date: format(data.date, 'yyyy-MM-dd'), // reload just that day or the whole week
      };
      if (selectedDateRange?.from && selectedDateRange?.to) {
          params.start_date = format(selectedDateRange.from, 'yyyy-MM-dd');
          params.end_date = format(selectedDateRange.to, 'yyyy-MM-dd');
      }
      loadSchedules(params);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add the shift.",
        variant: "destructive",
      });
    }
  };

  const generateSchedule = async () => {
    if (!selectedConstraintId) {
      toast({
        title: "Error",
        description: "Please select a constraint template first.",
        variant: "destructive",
      });
      return;
    }

    if (!generationParams.dateRange.from || !generationParams.dateRange.to) {
      toast({
        title: "Error",
        description: "Please select a valid date range for schedule generation.",
        variant: "destructive",
      });
      return;
    }

    // Check if date range is reasonable (not more than 4 weeks)
    const daysDiff = Math.ceil(
      (generationParams.dateRange.to.getTime() - generationParams.dateRange.from.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysDiff > 28) {
      toast({
        title: "Warning",
        description: "Generating schedules for more than 4 weeks may take longer. Consider using smaller date ranges.",
        variant: "destructive",
      });
    }

    if (daysDiff <= 0) {
      toast({
        title: "Error",
        description: "End date must be after start date.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const startDate = format(generationParams.dateRange.from, 'yyyy-MM-dd');
      const endDate = format(generationParams.dateRange.to, 'yyyy-MM-dd');

      console.log('Generating schedule with:', {
        constraintsId: selectedConstraintId,
        startDate,
        endDate
      });

      // ✅ NEW: First analyze potential conflicts
      console.log('Running conflict analysis...');
      const conflictResponse = await apiClient.analyzeSchedulingConflicts(selectedConstraintId, { startDate, endDate });
      
      if (conflictResponse.success && conflictResponse.data) {
        const conflictData = conflictResponse.data;
        
        console.log('Conflict analysis results:', conflictData);
        
        // Show conflict information to user
        if (conflictData.conflict_count > 0) {
          // Store conflict data and show the premium conflict resolution dialog
          setConflictAnalysisData(conflictData);
          setIsConflictDialogOpen(true);
          setIsGenerating(false);
          return;
        } else {
          toast({
            title: "Constraint Analysis Complete",
            description: "✅ No conflicts detected. Proceeding with schedule generation...",
            variant: "default",
          });
        }
      }

      // Proceed with actual schedule generation if no conflicts
      await proceedWithGeneration(startDate, endDate);

    } catch (error) {
      console.error('Error during conflict analysis:', error);
      
      let errorMessage = "An unexpected error occurred while analyzing constraints.";
      
      if (error.response?.status === 401) {
        errorMessage = "Your session has expired. Please log in again.";
      } else if (error.response?.status === 403) {
        errorMessage = "You don't have permission to generate schedules.";
      } else if (error.response?.status === 404) {
        errorMessage = "The selected constraint template was not found.";
      } else if (error.response?.status === 400) {
        errorMessage = "Invalid request. Please check your constraints and date range.";
      } else if (error.response?.status >= 500) {
        errorMessage = "Server error. Please try again later or contact support.";
      } else if (error.message?.includes('Failed to fetch')) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Error Analyzing Constraints",
        description: errorMessage,
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  };

  const proceedWithGeneration = async (startDate: string, endDate: string) => {
    try {
      setIsGenerating(true);
      
      console.log('Proceeding with schedule generation...');
      const response = await apiClient.generateSchedule(selectedConstraintId, { startDate, endDate });

      if (response.success && Array.isArray(response.data)) {
        const schedules = response.data;
        
        if (schedules.length === 0) {
          toast({
            title: "No Schedules Generated",
            description: "No schedules could be generated with the current constraints. The constraint template may have requirements that cannot be met with available employees. Please check:\n• Operating hours settings\n• Minimum staffing requirements\n• Employee availability\n• Date range selection",
            variant: "destructive",
          });
          return;
        }

        setGeneratedSchedules(schedules);
        setIsPreviewing(true);
        
        toast({
          title: "Success",
          description: `Generated ${schedules.length} schedule entries. Please review before publishing.`,
        });
      } else {
        console.error('Generation failed:', response);
        toast({
          title: "Generation Failed",
          description: response.message || "Failed to generate schedules. Please check your constraint template settings and try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error generating schedule:', error);
      
      let errorMessage = "An unexpected error occurred while generating schedules.";
      
      if (error.response?.status === 401) {
        errorMessage = "Your session has expired. Please log in again.";
      } else if (error.response?.status === 403) {
        errorMessage = "You don't have permission to generate schedules.";
      } else if (error.response?.status === 404) {
        errorMessage = "The selected constraint template was not found.";
      } else if (error.response?.status === 400) {
        errorMessage = "Invalid request. Please check your constraints and date range.";
      } else if (error.response?.status >= 500) {
        errorMessage = "Server error. Please try again later or contact support.";
      } else if (error.message?.includes('Failed to fetch')) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Error Generating Schedule",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyFixes = async (fixes: ConflictAnalysisSuggestion[]) => {
    setIsApplyingFixes(true);
    
    try {
      // Apply fixes via the new API endpoint
      const response = await apiClient.applyAutoFixes(selectedConstraintId, conflictAnalysisData);
      
      if (response.success) {
        toast({
          title: "Auto-fixes Applied",
          description: `✅ Successfully applied ${response.data?.fix_count || 0} automatic fixes. Re-analyzing conflicts...`,
        });
        
        // Re-analyze conflicts to see if they're resolved
        if (generationParams.dateRange.from && generationParams.dateRange.to) {
          const startDate = format(generationParams.dateRange.from, 'yyyy-MM-dd');
          const endDate = format(generationParams.dateRange.to, 'yyyy-MM-dd');
          
          const conflictResponse = await apiClient.analyzeSchedulingConflicts(selectedConstraintId, { startDate, endDate });
          
          if (conflictResponse.success && conflictResponse.data) {
            const updatedConflictData = conflictResponse.data;
            
            if (updatedConflictData.conflict_count === 0) {
              // All conflicts resolved, proceed with generation
              setIsConflictDialogOpen(false);
              await proceedWithGeneration(startDate, endDate);
            } else {
              // Update the dialog with new conflict data
              setConflictAnalysisData(updatedConflictData);
              toast({
                title: "Partial Resolution",
                description: `Some conflicts remain. ${updatedConflictData.conflict_count} conflicts still need attention.`,
                variant: "default"
              });
            }
          }
        }
      } else {
        throw new Error(response.message || 'Failed to apply auto-fixes');
      }
    } catch (error) {
      console.error('Error applying fixes:', error);
      toast({
        title: "Error Applying Fixes",
        description: "Failed to apply the selected fixes. Please try manual adjustments.",
        variant: "destructive",
      });
    } finally {
      setIsApplyingFixes(false);
    }
  };

  const handleProceedAnyway = async () => {
    setIsConflictDialogOpen(false);
    
    if (generationParams.dateRange.from && generationParams.dateRange.to) {
      const startDate = format(generationParams.dateRange.from, 'yyyy-MM-dd');
      const endDate = format(generationParams.dateRange.to, 'yyyy-MM-dd');
      await proceedWithGeneration(startDate, endDate);
    }
  };

  const handleEditConstraints = () => {
    setIsConflictDialogOpen(false);
    // Navigate to constraints editing (this would need to be implemented)
    toast({
      title: "Edit Constraints",
      description: "Please navigate to the Constraints page to modify your scheduling rules.",
    });
  };
  
  const handlePublish = async (schedulesToPublish: ScheduleType[]) => {
    const idsToPublish = schedulesToPublish.map(s => s.id);
    
    if (idsToPublish.length === 0) {
      toast({
        title: "No Schedules to Publish",
        description: "There are no new 'scheduled' shifts to publish.",
      });
      return;
    }

    setIsGenerating(true); // Re-use the generating spinner for publishing action
    try {
      const response = await apiClient.publishSchedules(idsToPublish);
      
      if (response.success) {
        toast({
          title: "Schedule Published",
          description: `${idsToPublish.length} shifts have been confirmed and are now live.`,
        });
        setIsPreviewing(false);
        setGeneratedSchedules([]);
        if (selectedDateRange?.from && selectedDateRange?.to) {
            loadSchedules({ // Reload schedules for the current view
                start_date: format(selectedDateRange.from, 'yyyy-MM-dd'),
                end_date: format(selectedDateRange.to, 'yyyy-MM-dd'),
                department: departmentFilter !== ALL_DEPARTMENTS ? departmentFilter : undefined,
                status: statusFilter !== ALL_STATUSES ? statusFilter : undefined,
                employeeId: employeeFilter !== ALL_EMPLOYEES ? employeeFilter : undefined,
            });
        }
      } else {
        toast({
          title: "Publishing Failed",
          description: response.message || "Could not publish the schedule. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Publish error:", error);
      toast({
          title: "Publishing Failed",
          description: "Could not publish the schedule. Please try again.",
          variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  let totalHoursDisplay = 0;
  schedules.forEach(schedule => {
    try {
      const [startH, startM] = schedule.startTime.split(':').map(Number);
      const [endH, endM] = schedule.endTime.split(':').map(Number);
      const sDate = new Date(0,0,0, startH, startM);
      const eDate = new Date(0,0,0, endH, endM);
      let diff = (eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60);
      if (diff < 0) diff += 24;
      totalHoursDisplay += diff;
    } catch(e) {
      console.error("Error calculating hours for a schedule", schedule, e);
    }
  });

  const weekDays = eachDayOfInterval({
    start: selectedDateRange?.from || startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: selectedDateRange?.to || endOfWeek(new Date(), { weekStartsOn: 1 }),
  });

  const schedulesByDay = weekDays.reduce((acc, day) => {
    const dayKey = format(day, 'yyyy-MM-dd');
    acc[dayKey] = schedules.filter(s => s.date === dayKey);
    return acc;
  }, {} as Record<string, ScheduleType[]>);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule Management</h1>
          <p className="text-gray-600 mt-1">Create and manage team schedules.</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-2xl border border-slate-200/60 p-6 shadow-sm">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Schedule Filters</h2>
              <p className="text-sm text-slate-600">Refine your schedule view</p>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsAddShiftDialogOpen(true)}
              className="h-9 px-4 font-medium"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Shift
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => setIsGenerationDialogOpen(true)}
              className="h-9 px-4 font-medium"
            >
              <Zap className="mr-2 h-3.5 w-3.5" />
              Generate
            </Button>
            <Button 
              size="sm"
              onClick={() => {
                // Use normalized schedules with proper IDs
                const scheduledShifts = schedules.filter(s => s.status === 'scheduled').map(schedule => ({
                  ...schedule,
                  id: schedule.id || (schedule as { _id?: string })._id || '',
                }));
                setGeneratedSchedules(scheduledShifts);
                setIsPreviewing(true);
              }}
              className="h-9 px-4 font-medium shadow-sm"
            >
              <Zap className="mr-2 h-3.5 w-3.5" />
              Publish
            </Button>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Date Range Filter */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Label className="text-xs font-medium text-slate-700 mb-2 block">Date Range</Label>
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full h-9 justify-start text-left font-normal bg-white/80 hover:bg-white border-slate-300/60"
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-500" />
                  {selectedDateRange?.from ? (
                    selectedDateRange.to ? (
                      <span className="text-sm">
                        {format(selectedDateRange.from, "MMM d")} - {format(selectedDateRange.to, "MMM d")}
                      </span>
                    ) : (
                      <span className="text-sm">{format(selectedDateRange.from, "MMM d, y")}</span>
                    )
                  ) : (
                    <span className="text-sm text-slate-500">Select dates</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar 
                  initialFocus 
                  mode="range" 
                  defaultMonth={selectedDateRange?.from} 
                  selected={selectedDateRange}
                  onSelect={(range) => {
                    setSelectedDateRange(range);
                    if (range?.from && range.to) {
                      setIsDatePickerOpen(false);
                    }
                  }}
                  numberOfMonths={2} 
                  weekStartsOn={1} 
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Department Filter */}
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-2 block">Department</Label>
            <Select value={departmentFilter} onValueChange={(value) => handleFilterChange(setDepartmentFilter, value)}>
              <SelectTrigger className="h-9 bg-white/80 hover:bg-white border-slate-300/60">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="all_departments" value={ALL_DEPARTMENTS}>All Departments</SelectItem>
                {uniqueDepartments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-2 block">Status</Label>
            <Select value={statusFilter} onValueChange={(value) => handleFilterChange(setStatusFilter, value)}>
              <SelectTrigger className="h-9 bg-white/80 hover:bg-white border-slate-300/60">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="all_statuses" value={ALL_STATUSES}>All Statuses</SelectItem>
                {scheduleStatusOptions.map(statusVal => (
                  <SelectItem key={statusVal} value={statusVal}>
                    {statusVal.charAt(0).toUpperCase() + statusVal.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Employee Filter */}
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-2 block">Employee</Label>
            <Select value={employeeFilter} onValueChange={(value) => handleFilterChange(setEmployeeFilter, value)}>
              <SelectTrigger className="h-9 bg-white/80 hover:bg-white border-slate-300/60">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem key="all_employees" value={ALL_EMPLOYEES}>All Employees</SelectItem>
                {allEmployees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200/60">
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              {schedules.length} shifts
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              {totalHoursDisplay.toFixed(1)} hours
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToToday}
              className="h-8 px-3 text-xs"
            >
              Today
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleWeekNavigate('prev')}
              className="h-8 px-3 text-xs"
            >
              <ChevronLeft className="h-3 w-3 mr-1" />
              Prev
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleWeekNavigate('next')}
              className="h-8 px-3 text-xs"
            >
              Next
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule Details</CardTitle>
          <CardDescription>Employee assignments for the selected period and filters.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && schedules.length === 0 ? (
            <p>Loading schedules...</p>
          ) : schedules.length === 0 ? (
            <div className="text-center py-8">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Schedules Found</h3>
              <p className="text-gray-500 mb-4">There are no schedules matching the current criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules
                  .filter(schedule => schedule && schedule.id && typeof schedule.id === 'string' && schedule.id.trim() !== '')
                  .map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell>{schedule.employee?.firstName} {schedule.employee?.lastName}</TableCell>
                    <TableCell>{format(parseISO(schedule.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{schedule.startTime} - {schedule.endTime}</TableCell>
                    <TableCell>{schedule.location}</TableCell>
                    <TableCell>{schedule.role}</TableCell>
                    <TableCell><Badge variant={schedule.status === 'confirmed' ? 'default' : 'secondary'}>{schedule.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setScheduleToEdit(schedule); setIsEditDialogOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button> 
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Weekly Schedule Section */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Schedule</CardTitle>
          <CardDescription>Daily view of all scheduled shifts for the week.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
            {weekDays.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const daySchedules = schedulesByDay[dayKey] || [];
              return (
                <div key={dayKey} className="bg-gray-100 rounded-lg p-3 space-y-3 flex flex-col">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-sm">{format(day, 'EEE')} <span className="text-gray-500">{format(day, 'd')}</span></h3>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                      // Pre-fill date when adding shift from a specific day
                      // You would need a state to hold the pre-filled data for the AddShiftForm
                      setIsAddShiftDialogOpen(true);
                    }}>
                      <Plus className="h-4 w-4"/>
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-[100px] scrollbar-hide">
                    {daySchedules.length > 0 ? (
                      daySchedules.map(schedule => (
                        <ShiftCard 
                          key={schedule.id} 
                          schedule={schedule}
                          onClick={() => {
                            setScheduleToEdit(schedule);
                            setIsEditDialogOpen(true);
                          }}
                        />
                      ))
                    ) : (
                      <div className="text-center text-xs text-gray-400 pt-8">No shifts</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      {scheduleToEdit && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Shift</DialogTitle>
              <DialogDescription>
                Modify the details for this shift or delete it permanently.
              </DialogDescription>
            </DialogHeader>
            <ScheduleEditForm
              initialData={scheduleToEdit}
              onSubmit={handleUpdateSchedule}
              onDelete={handleDeleteClick}
              onCancel={() => setIsEditDialogOpen(false)}
              isDeleting={isDeletingSchedule}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isAddShiftDialogOpen} onOpenChange={setIsAddShiftDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Shift</DialogTitle>
            <DialogDescription>
              Fill in the details to schedule a new shift.
            </DialogDescription>
          </DialogHeader>
          <AddShiftForm
            employees={allEmployees}
            onSubmit={handleAddShift}
            onCancel={() => setIsAddShiftDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isGenerationDialogOpen} onOpenChange={setIsGenerationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate New Schedule</DialogTitle>
            <DialogDescription>
              Confirm the parameters for the new schedule. The generated shifts will be added to any existing ones in the selected date range.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Constraint Template</Label>
              <Select value={generationParams.constraintId} onValueChange={(id) => setGenerationParams(prev => ({...prev, constraintId: id}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {constraints.map((c) => (
                    <SelectItem key={c.id ?? c._id} value={(c.id ?? c._id) as string}>
                      {c.name ?? 'Unnamed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button id="generation-date-picker" variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {generationParams.dateRange.from ? (generationParams.dateRange.to ? (<>{format(generationParams.dateRange.from, "LLL dd, y")} - {format(generationParams.dateRange.to, "LLL dd, y")}</>) : format(generationParams.dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar 
                    initialFocus 
                    mode="range" 
                    defaultMonth={generationParams.dateRange.from} 
                    selected={generationParams.dateRange} 
                    onSelect={(range) => {
                      if (range?.from && range.to) {
                        setGenerationParams(prev => ({...prev, dateRange: range as { from: Date; to: Date }}));
                      } else if (range?.from) {
                        setGenerationParams(prev => ({...prev, dateRange: { from: range.from, to: range.from }}));
                      }
                    }}
                    numberOfMonths={2} 
                    weekStartsOn={1} 
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <Button onClick={generateSchedule} disabled={isGenerating || !generationParams.constraintId}>
            <Zap className="mr-2 h-4 w-4" />
            {isGenerating ? 'Generating...' : `Generate & Add Shifts`}
          </Button>
        </DialogContent>
      </Dialog>

      {isPreviewing && (
        <SchedulePreviewKanban
            schedules={generatedSchedules}
            onPublish={async (schedulesToPublish) => {
              await handlePublish(schedulesToPublish);
              setIsPreviewing(false);
              setGeneratedSchedules([]);
              // Auto-refresh schedules after publish
              const params: Partial<ScheduleApiParams> = {};
              if (selectedDateRange?.from) params.start_date = format(selectedDateRange.from, 'yyyy-MM-dd');
              if (selectedDateRange?.to) params.end_date = format(selectedDateRange.to, 'yyyy-MM-dd');
              if (departmentFilter !== ALL_DEPARTMENTS) params.department = departmentFilter;
              if (statusFilter !== ALL_STATUSES) params.status = statusFilter;
              if (employeeFilter !== ALL_EMPLOYEES) params.employeeId = employeeFilter;
              if (params.start_date && params.end_date) {
                loadSchedules(params as ScheduleApiParams);
              }
            }}
            onCancel={() => {
                setIsPreviewing(false);
                setGeneratedSchedules([]);
                // Auto-refresh schedules after closing Kanban
                const params: Partial<ScheduleApiParams> = {};
                if (selectedDateRange?.from) params.start_date = format(selectedDateRange.from, 'yyyy-MM-dd');
                if (selectedDateRange?.to) params.end_date = format(selectedDateRange.to, 'yyyy-MM-dd');
                if (departmentFilter !== ALL_DEPARTMENTS) params.department = departmentFilter;
                if (statusFilter !== ALL_STATUSES) params.status = statusFilter;
                if (employeeFilter !== ALL_EMPLOYEES) params.employeeId = employeeFilter;
                if (params.start_date && params.end_date) {
                  loadSchedules(params as ScheduleApiParams);
                }
            }}
            isLoading={isGenerating}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the shift for{" "}
              <span className="font-semibold">
                {scheduleToEdit?.employee?.firstName} {scheduleToEdit?.employee?.lastName}
              </span>{" "}
              on {scheduleToEdit?.date && format(parseISO(scheduleToEdit.date), 'MMM d, yyyy')}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSchedule}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSchedule}
              disabled={isDeletingSchedule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingSchedule ? "Deleting..." : "Delete Shift"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        isOpen={isConflictDialogOpen}
        onClose={() => setIsConflictDialogOpen(false)}
        conflictData={conflictAnalysisData}
        onApplyFixes={handleApplyFixes}
        onProceedAnyway={handleProceedAnyway}
        onEditConstraints={handleEditConstraints}
        isApplyingFixes={isApplyingFixes}
      />
    </div>
  );
};
