import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Coffee, 
  Play, 
  Pause, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Timer,
  AlertCircle 
} from 'lucide-react';
import { format, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface BreakSession {
  id: string;
  type: 'meal' | 'rest' | 'personal' | 'other';
  startTime: string;
  endTime?: string;
  duration?: number; // minutes
  notes?: string;
  isActive: boolean;
}

interface BreakTimeTrackerProps {
  currentLocation: { lat: number; lng: number } | null;
  isClockedIn: boolean;
  onBreakStatusChange?: (isOnBreak: boolean) => void;
}

const BREAK_TYPES = {
  meal: { label: 'Meal Break', color: 'bg-blue-500', maxMinutes: 60 },
  rest: { label: 'Rest Break', color: 'bg-green-500', maxMinutes: 15 },
  personal: { label: 'Personal Break', color: 'bg-yellow-500', maxMinutes: 30 },
  other: { label: 'Other Break', color: 'bg-gray-500', maxMinutes: 30 }
};

const BreakTimeTracker: React.FC<BreakTimeTrackerProps> = ({
  currentLocation,
  isClockedIn,
  onBreakStatusChange
}) => {
  const { toast } = useToast();
  
  const [currentBreak, setCurrentBreak] = useState<BreakSession | null>(null);
  const [todayBreaks, setTodayBreaks] = useState<BreakSession[]>([]);
  const [breakTimer, setBreakTimer] = useState<string>('00:00:00');
  const [isLoading, setIsLoading] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [selectedBreakType, setSelectedBreakType] = useState<keyof typeof BREAK_TYPES>('rest');
  const [breakNotes, setBreakNotes] = useState('');

  // Timer effect for active break
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (currentBreak?.isActive) {
      interval = setInterval(() => {
        const now = new Date();
        const startTime = new Date(currentBreak.startTime);
        const diffInSeconds = differenceInSeconds(now, startTime);
        
        const hours = Math.floor(diffInSeconds / 3600);
        const minutes = Math.floor((diffInSeconds % 3600) / 60);
        const seconds = diffInSeconds % 60;
        
        setBreakTimer(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        
        // Alert for long breaks
        const breakType = BREAK_TYPES[currentBreak.type];
        const maxSeconds = breakType.maxMinutes * 60;
        
        if (diffInSeconds > maxSeconds && diffInSeconds % 300 === 0) { // Alert every 5 minutes after limit
          toast({
            title: "Break Time Warning",
            description: `Your ${breakType.label.toLowerCase()} has exceeded the recommended ${breakType.maxMinutes} minutes.`,
            variant: "destructive",
          });
        }
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentBreak, toast]);

  // Load today's breaks
  useEffect(() => {
    if (isClockedIn) {
      loadTodayBreaks();
    }
  }, [isClockedIn]);

  const loadTodayBreaks = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const response = await apiClient.getAttendanceEvents({
        start_date: today,
        end_date: today,
        event_type: 'break_start,break_end'
      });
      
      if (response.success && response.data) {
        // Process break events into sessions
        const breakSessions: BreakSession[] = [];
        const breakStarts = response.data.filter(e => e.event_type === 'break_start');
        
        for (const start of breakStarts) {
          const end = response.data.find(e => 
            e.event_type === 'break_end' && 
            e.timestamp > start.timestamp &&
            !breakSessions.find(bs => bs.endTime === e.timestamp)
          );
          
          const session: BreakSession = {
            id: start.id,
            type: start.notes?.includes('meal') ? 'meal' : 
                  start.notes?.includes('personal') ? 'personal' :
                  start.notes?.includes('other') ? 'other' : 'rest',
            startTime: start.timestamp,
            endTime: end?.timestamp,
            duration: end ? differenceInMinutes(new Date(end.timestamp), new Date(start.timestamp)) : undefined,
            notes: start.notes,
            isActive: !end
          };
          
          breakSessions.push(session);
        }
        
        setTodayBreaks(breakSessions);
        
        // Set current active break
        const activeBreak = breakSessions.find(b => b.isActive);
        if (activeBreak) {
          setCurrentBreak(activeBreak);
          onBreakStatusChange?.(true);
        }
      }
    } catch (error) {
      console.error('Failed to load breaks:', error);
    }
  };

  const handleStartBreak = async () => {
    if (!currentLocation) {
      toast({
        title: "Location Required",
        description: "Please enable location access to start a break.",
        variant: "destructive",
      });
      return;
    }

    if (!isClockedIn) {
      toast({
        title: "Not Clocked In",
        description: "You must be clocked in to start a break.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const breakData = {
        event_type: 'break_start' as const,
        gps_coordinates: currentLocation,
        notes: `${BREAK_TYPES[selectedBreakType].label}${breakNotes ? `: ${breakNotes}` : ''}`
      };

      const response = await apiClient.clockIn(breakData);
      
      if (response.success) {
        const newBreak: BreakSession = {
          id: response.data.clock_event.id,
          type: selectedBreakType,
          startTime: new Date().toISOString(),
          isActive: true,
          notes: breakNotes
        };
        
        setCurrentBreak(newBreak);
        setTodayBreaks(prev => [...prev, newBreak]);
        setShowBreakDialog(false);
        setBreakNotes('');
        onBreakStatusChange?.(true);
        
        toast({
          title: "Break Started",
          description: `${BREAK_TYPES[selectedBreakType].label} has been started.`,
        });
      } else {
        throw new Error(response.message || 'Failed to start break');
      }
    } catch (error) {
      console.error('Failed to start break:', error);
      toast({
        title: "Break Start Failed",
        description: error instanceof Error ? error.message : "Failed to start break.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndBreak = async () => {
    if (!currentBreak || !currentLocation) {
      return;
    }

    setIsLoading(true);

    try {
      const breakData = {
        event_type: 'break_end' as const,
        gps_coordinates: currentLocation,
        notes: `End ${BREAK_TYPES[currentBreak.type].label}`
      };

      const response = await apiClient.clockOut(breakData);
      
      if (response.success) {
        const endTime = new Date().toISOString();
        const duration = differenceInMinutes(new Date(endTime), new Date(currentBreak.startTime));
        
        setTodayBreaks(prev => 
          prev.map(b => 
            b.id === currentBreak.id 
              ? { ...b, endTime, duration, isActive: false }
              : b
          )
        );
        
        setCurrentBreak(null);
        setBreakTimer('00:00:00');
        onBreakStatusChange?.(false);
        
        const breakType = BREAK_TYPES[currentBreak.type];
        const isOvertime = duration > breakType.maxMinutes;
        
        toast({
          title: "Break Ended",
          description: `${breakType.label} completed in ${duration} minutes${isOvertime ? ' (overtime)' : ''}.`,
          variant: isOvertime ? "destructive" : "default",
        });
      } else {
        throw new Error(response.message || 'Failed to end break');
      }
    } catch (error) {
      console.error('Failed to end break:', error);
      toast({
        title: "Break End Failed",
        description: error instanceof Error ? error.message : "Failed to end break.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate daily break statistics
  const completedBreaks = todayBreaks.filter(b => !b.isActive);
  const totalBreakTime = completedBreaks.reduce((sum, b) => sum + (b.duration || 0), 0);
  const maxDailyBreakTime = 90; // minutes
  const breakUsagePercent = (totalBreakTime / maxDailyBreakTime) * 100;

  if (!isClockedIn) {
    return (
      <Card className="opacity-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5" />
            Break Time Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-4">
            Clock in to start tracking break time
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coffee className="h-5 w-5" />
          Break Time Tracker
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Current Break Status */}
        {currentBreak ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge 
                  className={`${BREAK_TYPES[currentBreak.type].color} text-white`}
                >
                  {BREAK_TYPES[currentBreak.type].label}
                </Badge>
                <Badge variant="outline" className="animate-pulse">
                  Active
                </Badge>
              </div>
              <div className="font-mono text-lg font-bold">
                {breakTimer}
              </div>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Started: {format(new Date(currentBreak.startTime), 'HH:mm')}
              </span>
              <Button
                onClick={handleEndBreak}
                disabled={isLoading}
                size="sm"
                className="bg-red-600 hover:bg-red-700"
              >
                <Pause className="h-4 w-4 mr-2" />
                End Break
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium">Ready to work</span>
              </div>
              
              <Dialog open={showBreakDialog} onOpenChange={setShowBreakDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Start Break
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Start Break</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Break Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(BREAK_TYPES).map(([key, type]) => (
                          <Button
                            key={key}
                            variant={selectedBreakType === key ? "default" : "outline"}
                            onClick={() => setSelectedBreakType(key as keyof typeof BREAK_TYPES)}
                            className="justify-start"
                          >
                            <div className={`w-3 h-3 rounded-full ${type.color} mr-2`} />
                            <div className="text-left">
                              <p className="text-sm">{type.label}</p>
                              <p className="text-xs text-muted-foreground">Max {type.maxMinutes}min</p>
                            </div>
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
                      <Textarea
                        value={breakNotes}
                        onChange={(e) => setBreakNotes(e.target.value)}
                        placeholder="Reason for break..."
                        rows={3}
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <Button onClick={handleStartBreak} disabled={isLoading} className="flex-1">
                        {isLoading ? (
                          <Timer className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Start Break
                      </Button>
                      <Button variant="outline" onClick={() => setShowBreakDialog(false)} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {/* Daily Break Summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Today's Break Usage</span>
            <span className="text-sm text-muted-foreground">
              {totalBreakTime}min / {maxDailyBreakTime}min
            </span>
          </div>
          
          <Progress value={Math.min(breakUsagePercent, 100)} className="h-2" />
          
          {breakUsagePercent > 100 && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Break time exceeded recommended daily limit</span>
            </div>
          )}
        </div>

        {/* Break History */}
        {completedBreaks.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium">Today's Breaks</h4>
            <div className="space-y-2">
              {completedBreaks.map((breakSession, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${BREAK_TYPES[breakSession.type].color}`} />
                    <span className="text-sm">{BREAK_TYPES[breakSession.type].label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {breakSession.duration}min
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(breakSession.startTime), 'HH:mm')} - 
                    {breakSession.endTime && format(new Date(breakSession.endTime), 'HH:mm')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BreakTimeTracker; 