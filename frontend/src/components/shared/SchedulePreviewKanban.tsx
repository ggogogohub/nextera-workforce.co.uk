import { useState, useMemo, FC, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Schedule as ScheduleType } from '@/types';
import { ShiftCard } from '@/components/shared/ShiftCard';
import { ScheduleEditForm, ScheduleEditFormValues } from '@/components/forms/ScheduleEditForm';
import { format, parseISO, eachDayOfInterval, startOfDay, startOfWeek, endOfWeek } from 'date-fns';
import { Calendar, X, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface SchedulePreviewKanbanProps {
  schedules: ScheduleType[];
  onPublish: (schedules: ScheduleType[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const groupSchedulesByDay = (schedules: ScheduleType[]) => {
  const grouped: { [key: string]: ScheduleType[] } = {};
  schedules
    .filter(schedule => schedule.status === 'scheduled')
    .forEach(schedule => {
      // Defensively check for a valid date
      try {
        const dayKey = format(startOfDay(parseISO(schedule.date)), 'yyyy-MM-dd');
        if (!grouped[dayKey]) {
          grouped[dayKey] = [];
        }
        grouped[dayKey].push(schedule);
      } catch (e) {
        console.error("Invalid date found in schedule, skipping:", schedule, e);
      }
    });
  return grouped;
};

export const SchedulePreviewKanban: FC<SchedulePreviewKanbanProps> = ({
  schedules: initialSchedules,
  onPublish,
  onCancel,
  isLoading,
}) => {
  const [schedules, setSchedules] = useState<ScheduleType[]>(initialSchedules || []);
  const [scheduleToEdit, setScheduleToEdit] = useState<ScheduleType | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const groupedSchedules = useMemo(() => groupSchedulesByDay(schedules), [schedules]);

  const dateRange = useMemo(() => {
    if (!initialSchedules || initialSchedules.length === 0) return [];
    try {
      // Always base the date range on initial schedules to maintain consistent layout
      const originalDates = initialSchedules.map(s => parseISO(s.date));
      const minDate = new Date(Math.min(...originalDates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...originalDates.map(d => d.getTime())));

      // Ensure we show complete weeks by expanding to week boundaries
      const weekStart = startOfWeek(minDate, { weekStartsOn: 1 }); // Monday start
      const weekEnd = endOfWeek(maxDate, { weekStartsOn: 1 }); // Sunday end

      return eachDayOfInterval({ start: startOfDay(weekStart), end: startOfDay(weekEnd) });
    } catch (e) {
      console.error("Error calculating date range", e);
      return [];
    }
  }, [initialSchedules]);

  // Check if any edited schedules fall outside the original date range
  const extendedDateRange = useMemo(() => {
    if (!schedules || schedules.length === 0) return dateRange;

    try {
      // Get all current schedule dates
      const currentDates = schedules.map(s => parseISO(s.date));
      const currentMinDate = new Date(Math.min(...currentDates.map(d => d.getTime())));
      const currentMaxDate = new Date(Math.max(...currentDates.map(d => d.getTime())));

      // Get original date range bounds
      if (dateRange.length === 0) {
        // Fallback: create a week around the current schedules
        const weekStart = startOfWeek(currentMinDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentMaxDate, { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startOfDay(weekStart), end: startOfDay(weekEnd) });
      }

      const originalMinDate = dateRange[0];
      const originalMaxDate = dateRange[dateRange.length - 1];

      // Check if we need to extend the range
      const needsExtension = currentMinDate < originalMinDate || currentMaxDate > originalMaxDate;

      if (!needsExtension) {
        return dateRange;
      }

      // Extend to include all dates
      const extendedMinDate = currentMinDate < originalMinDate ? currentMinDate : originalMinDate;
      const extendedMaxDate = currentMaxDate > originalMaxDate ? currentMaxDate : originalMaxDate;

      // Ensure we show complete weeks
      const weekStart = startOfWeek(extendedMinDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(extendedMaxDate, { weekStartsOn: 1 });

      return eachDayOfInterval({ start: startOfDay(weekStart), end: startOfDay(weekEnd) });
    } catch (e) {
      console.error("Error extending date range", e);
      return dateRange.length > 0 ? dateRange : [];
    }
  }, [schedules, dateRange]);

  // Helper to fetch all schedules for the current Kanban preview (only called after edit)
  const fetchSchedules = async () => {
    if (!initialSchedules || initialSchedules.length === 0 || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      // Get the min/max date from initialSchedules
      const dates = initialSchedules.map(s => parseISO(s.date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const start_date = format(minDate, 'yyyy-MM-dd');
      const end_date = format(maxDate, 'yyyy-MM-dd');
      
      const response = await apiClient.getSchedules({ start_date, end_date, limit: 500, page: 1 });
      if (response.success && response.data && response.data.items) {
        // Normalize the fetched schedules to ensure they have proper IDs
        const normalizedSchedules = response.data.items.map(schedule => ({
          ...schedule,
          id: schedule.id || (schedule as { _id?: string })._id || '',
        }));
        setSchedules(normalizedSchedules);
      }
    } catch (error) {
      // Only show error toast for actual errors, not CORS issues
      console.error('Failed to reload schedules after edit:', error);
      // Don't show toast for network errors to avoid spam
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePublish = () => {
    // Only publish scheduled shifts with normalized IDs
    const scheduledShifts = schedules
      .filter(s => s.status === 'scheduled')
      .map(schedule => ({
        ...schedule,
        id: schedule.id || (schedule as { _id?: string })._id || '',
      }));
    onPublish(scheduledShifts);
  };

  const handleUpdateSchedule = async (data: ScheduleEditFormValues) => {
    if (!scheduleToEdit) return;
    
    try {
      const response = await apiClient.updateSchedule(scheduleToEdit.id, data);
      if (response.success) {
        toast({ title: 'Success', description: 'Shift updated successfully.' });
        setIsEditDialogOpen(false);
        setScheduleToEdit(null);
        
        // Update the local schedules state
        if (response.data) {
          const updatedSchedule = {
            ...response.data,
            id: response.data.id || (response.data as { _id?: string })._id || '',
          };
          setSchedules(prev => 
            prev.map(s => 
              (s.id === updatedSchedule.id || (s as { _id?: string })._id === updatedSchedule.id) 
                ? updatedSchedule 
                : s
            )
          );
        }
      } else {
        toast({ title: 'Error', description: response.message || 'Failed to update the shift.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update the shift.', variant: 'destructive' });
    }
  };

  const handleDeleteSchedule = async () => {
    if (!scheduleToEdit) return;
    
    setIsDeleting(true);
    try {
      const response = await apiClient.deleteSchedule(scheduleToEdit.id);
      if (response.success) {
        toast({ title: 'Success', description: 'Shift deleted successfully.' });
        setIsEditDialogOpen(false);
        setScheduleToEdit(null);
        
        // Remove the deleted schedule from local state
        setSchedules(prev => prev.filter(s => s.id !== scheduleToEdit.id));
      } else {
        toast({ title: 'Error', description: response.message || 'Failed to delete the shift.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete the shift.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Update schedules when initialSchedules prop changes
  useEffect(() => {
    setSchedules(initialSchedules || []);
  }, [initialSchedules]);

  if (!initialSchedules || initialSchedules.length === 0) {
    return (
      <Dialog open={true} onOpenChange={() => onCancel()}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-center pb-6">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-slate-200">
              <Calendar className="w-8 h-8 text-slate-600" />
            </div>
            <DialogTitle className="text-xl font-semibold text-slate-900">
              No Schedule to Preview
            </DialogTitle>
            <DialogDescription className="text-slate-500 mt-2 text-sm leading-relaxed">
              No schedules are available for publishing at this time.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-0">
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={onCancel}
                className="min-w-[120px] h-10 font-medium text-sm border-slate-300 hover:bg-slate-50"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Safety check for date range
  if (extendedDateRange.length === 0) {
    return (
      <Dialog open={true} onOpenChange={() => onCancel()}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="text-center pb-6">
            <div className="mx-auto w-20 h-20 bg-destructive/10 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
              <Calendar className="w-10 h-10 text-destructive" />
            </div>
            <DialogTitle className="text-2xl font-bold text-foreground">
              Date Range Error
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-2 leading-relaxed">
              Unable to calculate date range for schedules. Please try again.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-0">
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={onCancel}
                className="min-w-[140px] h-11 font-medium"
              >
                Go Back
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={true} onOpenChange={() => onCancel()}>
        <DialogContent className="max-w-7xl h-[96vh] p-0 flex flex-col">
          <DialogHeader className="flex-shrink-0 border-b border-border bg-background/50 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-foreground">
                  Schedule Preview
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                  Review and edit before publishing
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <CardContent className="flex-1 overflow-hidden p-4">
            <div className="grid grid-cols-7 gap-3 h-full">
              {extendedDateRange.map((day) => {
                const dayKey = format(day, 'yyyy-MM-dd');
                // Only show scheduled shifts for this day
                const daySchedules = (groupedSchedules[dayKey] || []).filter(s => s.status === 'scheduled');
                const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                return (
                  <div
                    key={dayKey}
                    className={`flex flex-col min-h-0 flex-1 rounded-2xl border-2 transition-all duration-200 ${isToday
                      ? 'border-primary/50 bg-primary/5 shadow-lg'
                      : isWeekend
                        ? 'border-border bg-muted/30'
                        : 'border-border bg-card'
                      } hover:shadow-md`}
                  >
                    <div className={`px-3 py-4 text-center rounded-t-2xl ${isToday
                      ? 'bg-primary text-primary-foreground'
                      : isWeekend
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-secondary text-secondary-foreground'
                      }`}>
                      <h3 className={`font-bold text-sm tracking-wide`}>
                        {format(day, 'EEE').toUpperCase()}
                      </h3>
                      <p className={`text-xs mt-1 opacity-80`}>
                        {format(day, 'MMM d')}
                      </p>
                    </div>
                    <div className="h-full min-h-0 flex-1 p-2 space-y-1.5 overflow-y-auto kanban-scrollbar">
                      {daySchedules.map((schedule) => (
                        <ShiftCard
                          key={schedule.id || (schedule as { _id?: string })._id || `schedule-${Math.random()}`}
                          schedule={schedule}
                          onClick={() => {
                            setScheduleToEdit(schedule);
                            setIsEditDialogOpen(true);
                          }}
                        />
                      ))}
                      {daySchedules.length === 0 && (
                        <div className="text-center py-6">
                          <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-muted flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <p className="text-xs text-muted-foreground font-medium">No shifts</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* If there are no scheduled shifts at all, show a message */}
            {schedules.filter(s => s.status === 'scheduled').length === 0 && (
              <div className="text-center py-12 text-lg text-muted-foreground font-semibold">
                No scheduled shifts to preview or publish.
              </div>
            )}
          </CardContent>
          <div className="p-6 border-t border-border bg-background flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <div className="text-sm font-medium text-foreground">
                <span className="font-bold text-primary">{schedules.filter(s => s.status === 'scheduled').length}</span> scheduled shifts ready to publish
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
                className="h-11 px-6 font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePublish}
                disabled={isLoading || schedules.filter(s => s.status === 'scheduled').length === 0}
                className="h-11 px-8 font-medium shadow-lg"
              >
                {isLoading ? 'Publishing...' : 'Publish Schedule'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Schedule Dialog */}
      {scheduleToEdit && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Shift</DialogTitle>
              <DialogDescription>
                Modify the details for this shift before publishing.
              </DialogDescription>
            </DialogHeader>
            <ScheduleEditForm
              initialData={scheduleToEdit}
              onSubmit={handleUpdateSchedule}
              onCancel={() => setIsEditDialogOpen(false)}
              onDelete={handleDeleteSchedule}
              isDeleting={isDeleting}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};