import { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Filter, ListFilter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/lib/auth';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, startOfMonth, endOfMonth, parseISO } from 'date-fns'; 
import { Schedule as ScheduleType, User as UserType, UserRole } from '@/types'; 
import { apiClient } from '@/lib/api'; 

// Placeholder user for mock schedules - can be removed once API is fully integrated
const mockEmployee: UserType = {
  id: 'emp1',
  email: 'employee@example.com',
  firstName: 'Mock',
  lastName: 'Employee',
  role: 'employee' as UserRole,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  availability: [],
  skills: [],
};

export const Schedule = () => {
  const { user } = useAuthStore(); 
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(); // For popover calendar
  
  const [schedules, setSchedules] = useState<ScheduleType[]>([]); 
  const [displayedSchedules, setDisplayedSchedules] = useState<ScheduleType[]>([]); 
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false); 
  
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  const [selectedDayForDetails, setSelectedDayForDetails] = useState<Date | null>(null);
  const [dayScheduleDetails, setDayScheduleDetails] = useState<ScheduleType[]>([]);
  
  const uniqueLocations = Array.from(new Set(schedules.map(s => s.location).filter(Boolean) as string[]));
  const uniqueRoles = Array.from(new Set(schedules.map(s => s.role).filter(Boolean) as string[]));

  const loadSchedules = useCallback(async () => {
    if (!user?.id) {
      setSchedules([]);
      setIsLoading(false); 
      return;
    }

    setIsLoading(true);
    // Reset details when loading new month/week schedules
    setSelectedDayForDetails(null);
    setDayScheduleDetails([]);
    try {
      let startDateStr: string;
      let endDateStr: string;

      if (viewMode === 'week') {
        const weekOptions = { weekStartsOn: 1 as const };
        startDateStr = format(startOfWeek(currentDate, weekOptions), 'yyyy-MM-dd');
        endDateStr = format(endOfWeek(currentDate, weekOptions), 'yyyy-MM-dd');
      } else { 
        startDateStr = format(startOfMonth(currentDate), 'yyyy-MM-dd');
        endDateStr = format(endOfMonth(currentDate), 'yyyy-MM-dd');
      }
      
      const apiParams: { 
        employeeId: string; 
        start_date: string; 
        end_date: string; 
        limit: number;
      } = {
        employeeId: user.id,
        start_date: startDateStr,
        end_date: endDateStr,
        limit: 100, // Reduced limit to comply with backend validation
      };
      
      const response = await apiClient.getSchedules(apiParams);

      if (response.success && response.data) {
        // Ensure each schedule has an `id` field (fallback to `_id` from backend)
        const normalized: ScheduleType[] = (response.data.items as (ScheduleType & { _id?: string })[]).map(
          (item) => ({
            ...item,
            id: (item.id ?? item._id ?? '').toString(),
          }) as ScheduleType
        );

        setSchedules(normalized); 
      } else {
        console.error('MySchedule: Failed to load schedules:', response.message);
        setSchedules([]); 
      }
    } catch (error) {
      console.error('MySchedule: Error fetching schedules:', error);
      setSchedules([]); 
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, currentDate, viewMode]); // apiClient is stable, not needed as dep

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]); 

  useEffect(() => {
    let filtered = [...schedules];
    if (locationFilter) {
      filtered = filtered.filter(s => s.location === locationFilter);
    }
    if (roleFilter) {
      filtered = filtered.filter(s => s.role === roleFilter);
    }
    setDisplayedSchedules(filtered);
    
    if (selectedDayForDetails) {
      const details = filtered.filter(s => format(parseISO(s.date), 'yyyy-MM-dd') === format(selectedDayForDetails, 'yyyy-MM-dd'));
      setDayScheduleDetails(details);
    } else {
      setDayScheduleDetails([]); // Clear details if no day is selected
    }

  }, [schedules, locationFilter, roleFilter, selectedDayForDetails]);

  const getWeekDays = () => {
    const weekStartsOnMonday = { weekStartsOn: 1 as const };
    const start = startOfWeek(currentDate, weekStartsOnMonday);
    const end = endOfWeek(currentDate, weekStartsOnMonday);
    return eachDayOfInterval({ start, end });
  };

  const getSchedulesForDate = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    return displayedSchedules.filter(schedule => format(parseISO(schedule.date), 'yyyy-MM-dd') === dateString);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-500';
      case 'scheduled': return 'bg-blue-500';
      case 'completed': return 'bg-gray-500';
      case 'missed': return 'bg-red-500';
      case 'cancelled': return 'bg-orange-500';
      default: return 'bg-gray-400';
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setSelectedDayForDetails(null); 
    setDayScheduleDetails([]);
    if (direction === 'prev') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(addWeeks(currentDate, 1));
    }
  };
  
  const handleMonthCalendarSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDayForDetails(date);
      // Details are updated via the useEffect listening to [schedules, ..., selectedDayForDetails]
    } else {
      setSelectedDayForDetails(null);
      setDayScheduleDetails([]);
    }
  };

  if (isLoading && schedules.length === 0) { // Simpler loading state based on raw schedules
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const weekDaysForGrid = viewMode === 'week' ? getWeekDays() : [];

  let totalHoursSummary = 0;
  const uniqueLocationsSummary = new Set<string>();
  const uniqueRolesSummary = new Set<string>();

  displayedSchedules.forEach(schedule => {
    try {
      const [startH, startM] = schedule.startTime.split(':').map(Number);
      const [endH, endM] = schedule.endTime.split(':').map(Number);
      const startDate = new Date(0, 0, 0, startH, startM);
      const endDate = new Date(0, 0, 0, endH, endM);
      let diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      if (diff < 0) diff += 24;
      totalHoursSummary += diff;
    } catch (e) {
      console.error("Error calculating shift duration for summary", e);
    }
    if (schedule.location) uniqueLocationsSummary.add(schedule.location);
    if (schedule.role) uniqueRolesSummary.add(schedule.role);
  });
  
  const eventsOnDates = schedules.map(s => parseISO(s.date)); // Use raw schedules for event markers

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
          <p className="text-gray-600 mt-1">View and manage your work schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <Select 
            value={viewMode} 
            onValueChange={(value) => {
              setViewMode(value as 'week' | 'month');
              setSelectedDayForDetails(null); 
              setDayScheduleDetails([]);
            }}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem key="week" value="week">Week View</SelectItem>
              <SelectItem key="month" value="month">Month View</SelectItem>
            </SelectContent>
          </Select>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(currentDate, 'MMM yyyy')} 
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={currentDate} 
                onSelect={(date) => {
                  if (date) {
                    setCurrentDate(date); 
                    setSelectedDate(date); 
                    setSelectedDayForDetails(null);
                    setDayScheduleDetails([]);
                  }
                  setIsCalendarOpen(false); 
                }}
                initialFocus weekStartsOn={1} 
              />
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon"><ListFilter className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {uniqueLocations.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs px-2 py-1.5 text-muted-foreground">Location</DropdownMenuLabel>
                  {uniqueLocations.map(loc => (
                    <DropdownMenuCheckboxItem key={loc} checked={locationFilter === loc}
                      onCheckedChange={() => setLocationFilter(prev => prev === loc ? null : loc)}>
                      {loc}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              {uniqueRoles.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-xs px-2 py-1.5 text-muted-foreground">Role</DropdownMenuLabel>
                  {uniqueRoles.map(role => (
                    <DropdownMenuCheckboxItem key={role} checked={roleFilter === role}
                      onCheckedChange={() => setRoleFilter(prev => prev === role ? null : role)}>
                      {role}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}
              {(!uniqueLocations.length && !uniqueRoles.length) && 
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No filters available.</div>
               }
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {viewMode === 'week' && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-semibold">
            {format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d')} - {format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}
          </h2>
          <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      {viewMode === 'week' ? (
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {weekDaysForGrid.map((day) => {
            const daySchedules = getSchedulesForDate(day);
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
            return (
              <Card key={format(day, 'yyyy-MM-dd')} className={`${isToday ? 'ring-2 ring-blue-500' : ''}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{format(day, 'EEE')}</CardTitle>
                  <CardDescription className="text-xs">{format(day, 'MMM d')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {daySchedules.length > 0 ? (
                    daySchedules.map((schedule) => (
                      <div key={schedule.id} className="p-2 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                        <div className="text-xs font-medium">{schedule.startTime} - {schedule.endTime}</div>
                        <div className="text-xs text-gray-600 truncate">{schedule.location}</div>
                        <div className="text-xs text-gray-500 truncate">{schedule.role}</div>
                        <Badge className={`mt-1 text-xs ${getStatusColor(schedule.status)} text-white`}>{schedule.status}</Badge>
                      </div>
                    ))
                  ) : ( <div className="text-xs text-gray-400 text-center py-4">No shifts</div> )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : ( // Month View
        <Card>
          <CardHeader>
            <CardTitle>Monthly Schedule</CardTitle>
            <CardDescription>Your schedule for {format(currentDate, 'MMMM yyyy')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row gap-4">
            <div className="md:w-1/2 lg:w-2/3 border rounded-md">
              <Calendar
                mode="single"
                selected={selectedDayForDetails} 
                onSelect={handleMonthCalendarSelect}
                month={currentDate} 
                onMonthChange={(month) => { setCurrentDate(month); setSelectedDayForDetails(null); }}
                modifiers={{ hasEvent: eventsOnDates }}
                modifiersClassNames={{ hasEvent: 'font-bold text-blue-600 relative' }} 
                components={{
                  DayContent: (props) => { 
                    const dayHasEvent = eventsOnDates.some(eventDate => 
                      format(eventDate, 'yyyy-MM-dd') === format(props.date, 'yyyy-MM-dd')
                    );
                    return (
                      <div className="relative w-full h-full flex items-center justify-center">
                        {props.date.getDate()}
                        {dayHasEvent && 
                          <span className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                        }
                      </div>
                    );
                  }
                }}
                className="p-3"
                weekStartsOn={1} 
              />
            </div>
            <div className="md:w-1/2 lg:w-1/3 space-y-2">
              {selectedDayForDetails ? (
                dayScheduleDetails.length > 0 ? (
                  <div className="p-4 border rounded-md bg-slate-50 h-full overflow-y-auto max-h-[calc(theme(space.96)_-_theme(space.4))]">
                    <h3 className="text-lg font-semibold mb-3">
                      Shifts for {format(selectedDayForDetails, 'MMM d, yyyy')}
                    </h3>
                    {dayScheduleDetails.map(schedule => (
                      <div key={schedule.id} className="p-2 mb-2 bg-blue-50 rounded-lg border-l-4 border-blue-500 text-xs">
                        <div><strong>{schedule.startTime} - {schedule.endTime}</strong></div>
                        <div>{schedule.role}</div>
                        <div>{schedule.location}</div>
                        <Badge className={`mt-1 text-xs ${getStatusColor(schedule.status)} text-white`}>
                          {schedule.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 border rounded-md bg-slate-50 flex items-center justify-center h-full text-sm text-muted-foreground">
                    No shifts for {format(selectedDayForDetails, 'MMM d, yyyy')}.
                  </div>
                )
              ) : (
                <div className="p-4 border rounded-md bg-slate-50 flex items-center justify-center h-full text-sm text-muted-foreground">
                  Select a day to see details.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>This Period Summary</CardTitle>
          <CardDescription>Overview of your scheduled hours and shifts for the selected {viewMode}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{displayedSchedules.length}</div>
              <div className="text-sm text-gray-600">Total Shifts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{totalHoursSummary.toFixed(1)}</div>
              <div className="text-sm text-gray-600">Total Hours</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{uniqueLocationsSummary.size}</div>
              <div className="text-sm text-gray-600">Locations</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{uniqueRolesSummary.size}</div>
              <div className="text-sm text-gray-600">Roles</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {(user?.role === 'manager' || user?.role === 'administrator') && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule Actions</CardTitle>
            <CardDescription>Manage and modify schedules</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button><Plus className="mr-2 h-4 w-4" />Add Shift</Button>
              <Button variant="outline">Generate Schedule</Button>
              <Button variant="outline">Copy Previous Week</Button>
              <Button variant="outline">Export Schedule</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
