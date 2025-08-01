import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Clock, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface LocationInfo {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  radius_meters: number;
  is_active: boolean;
}

interface AttendanceStatus {
  is_clocked_in: boolean;
  current_shift: {
    id?: string;
    startTime: string;
    endTime: string;
    location: string;
    role: string;
    status: string;
  } | null;
  last_clock_event: {
    event_type: string;
    timestamp: string;
  } | null;
  total_hours_today: number;
}

interface ClockInOutProps {
  className?: string;
}

const ClockInOut: React.FC<ClockInOutProps> = ({ className = "" }) => {
  const { toast } = useToast();
  
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [nearestLocation, setNearestLocation] = useState<{location: LocationInfo, distance: number, withinRadius: boolean} | null>(null);
  
  // Check nearest location when GPS coordinates change
  useEffect(() => {
    const checkNearestLocation = async () => {
      if (currentLocation) {
        try {
          const response = await apiClient.findNearestLocation(currentLocation.lat, currentLocation.lng);
          if (response.success && response.data && response.data.nearest_location) {
            setNearestLocation({
              location: response.data.nearest_location,
              distance: response.data.distance_meters,
              withinRadius: response.data.is_within_radius
            });
          }
        } catch (error) {
          setNearestLocation(null);
        }
      } else {
        setNearestLocation(null);
      }
    };

    checkNearestLocation();
  }, [currentLocation]);

  // Get current location
  const getCurrentLocation = () => {
    setIsGettingLocation(true);
    setLocationError(null);
    
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser');
      setIsGettingLocation(false);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000 // Cache for 1 minute
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationError(null);
        setIsGettingLocation(false);
      },
      (error) => {
        let errorMessage = 'Location access failed';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location permissions and try again.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable. Please check your GPS settings.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
        }
        
        setLocationError(errorMessage);
        setCurrentLocation(null);
        setIsGettingLocation(false);
        
        toast({
          title: "Location Error",
          description: errorMessage,
          variant: "destructive",
        });
      },
      options
    );
  };

  // Load attendance status
  const loadAttendanceStatus = async () => {
    try {
      setIsLoadingStatus(true);
      const response = await apiClient.getAttendanceStatus();
      
      if (response.success && response.data) {
        setAttendanceStatus(response.data);
      } else {
        throw new Error(response.message || 'Failed to load attendance status');
      }
    } catch (error) {
      console.error('Failed to load attendance status:', error);
      toast({
        title: "Error",
        description: "Failed to load attendance status. Please refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadAttendanceStatus();
    getCurrentLocation();
  }, []);

  // Clock In
  const handleClockIn = async () => {
    if (!currentLocation) {
      toast({
        title: "Location Required",
        description: "Please enable location access and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const clockInData = {
        event_type: "clock_in",  // Required field was missing!
        gps_coordinates: currentLocation,
        notes: notes.trim() || undefined,
        schedule_id: attendanceStatus?.current_shift?.id
      };

      const response = await apiClient.clockIn(clockInData);
      
      if (response.success && response.data) {
        const result = response.data;
        
        toast({
          title: result.success ? "Clock In Successful!" : "Clock In Recorded",
          description: result.message,
          variant: result.is_location_valid ? "default" : "destructive",
        });
        
        // Refresh status and clear notes
        await loadAttendanceStatus();
        setNotes('');
      } else {
        console.error('Clock in API response:', response);
        const errorMessage = response.message || 'Clock in failed. Please try again.';
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Clock in failed:', error);
      
      // More user-friendly error messages
      let userMessage = "Please try again.";
      const errorStr = error instanceof Error ? error.message : String(error);
      
      if (errorStr.includes("No workplace locations found")) {
        userMessage = "No workplace locations are set up. Please contact your administrator to add locations.";
      } else if (errorStr.includes("from the nearest location")) {
        userMessage = errorStr; // This already contains distance info
      } else if (errorStr.includes("already clocked in")) {
        userMessage = "You are already clocked in. Please clock out first.";
      } else if (errorStr.includes("401") || errorStr.includes("authentication")) {
        userMessage = "Your session has expired. Please refresh the page and log in again.";
      } else if (errorStr.includes("403")) {
        userMessage = "You don't have permission to clock in. Please contact your administrator.";
      } else if (errorStr.includes("422")) {
        userMessage = "Invalid data provided. Please ensure your location permissions are enabled and try again.";
      } else if (errorStr.includes("500")) {
        userMessage = "Server error occurred. Please contact support if this continues.";
      } else if (errorStr.length > 5) {
        userMessage = errorStr; // Use the actual error message if it's descriptive
      }
      
      toast({
        title: "Clock In Failed",
        description: userMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Clock Out
  const handleClockOut = async () => {
    if (!currentLocation) {
      toast({
        title: "Location Required", 
        description: "Please enable location access and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const clockOutData = {
        event_type: "clock_out",  // Required field was missing!
        gps_coordinates: currentLocation,
        notes: notes.trim() || undefined,
        schedule_id: attendanceStatus?.current_shift?.id
      };

      const response = await apiClient.clockOut(clockOutData);
      
      if (response.success && response.data) {
        const result = response.data;
        
        toast({
          title: result.success ? "Clock Out Successful!" : "Clock Out Recorded",
          description: result.message,
          variant: result.is_location_valid ? "default" : "destructive",
        });
        
        // Refresh status and clear notes
        await loadAttendanceStatus();
        setNotes('');
      } else {
        console.error('Clock out API response:', response);
        const errorMessage = response.message || 'Clock out failed. Please try again.';
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Clock out failed:', error);
      
      // More user-friendly error messages
      let userMessage = "Please try again.";
      const errorStr = error instanceof Error ? error.message : String(error);
      
      if (errorStr.includes("not currently clocked in")) {
        userMessage = "You are not currently clocked in. Please clock in first.";
      } else if (errorStr.includes("No valid clock-in record")) {
        userMessage = "No valid clock-in record found. Please contact your administrator.";
      } else if (errorStr.includes("from the nearest location")) {
        userMessage = errorStr; // This already contains distance info
      } else if (errorStr.includes("401") || errorStr.includes("authentication")) {
        userMessage = "Your session has expired. Please refresh the page and log in again.";
      } else if (errorStr.includes("403")) {
        userMessage = "You don't have permission to clock out. Please contact your administrator.";
      } else if (errorStr.includes("422")) {
        userMessage = "Invalid data provided. Please ensure your location permissions are enabled and try again.";
      } else if (errorStr.includes("500")) {
        userMessage = "Server error occurred. Please contact support if this continues.";
      } else if (errorStr.length > 5) {
        userMessage = errorStr; // Use the actual error message if it's descriptive
      }
      
      toast({
        title: "Clock Out Failed",
        description: userMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoadingStatus) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading attendance status...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Time Tracking
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Current Status</p>
            <p className="font-semibold">
              {attendanceStatus?.is_clocked_in ? 'Clocked In' : 'Clocked Out'}
            </p>
            {attendanceStatus?.total_hours_today > 0 && (
              <p className="text-sm text-muted-foreground">
                Today: {attendanceStatus.total_hours_today.toFixed(1)} hours
              </p>
            )}
          </div>
          <Badge 
            variant={attendanceStatus?.is_clocked_in ? "default" : "secondary"}
            className="px-3 py-1"
          >
            {attendanceStatus?.is_clocked_in ? (
              <CheckCircle className="h-4 w-4 mr-1" />
            ) : (
              <Clock className="h-4 w-4 mr-1" />
            )}
            {attendanceStatus?.is_clocked_in ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        {/* Current Shift Info */}
        {attendanceStatus?.current_shift && (
          <div className="p-4 border rounded-lg">
            <p className="text-sm font-medium mb-2">Today's Shift</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Time:</span>
                <p>{attendanceStatus.current_shift.startTime} - {attendanceStatus.current_shift.endTime}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Location:</span>
                <p>{attendanceStatus.current_shift.location}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Role:</span>
                <p>{attendanceStatus.current_shift.role}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline">{attendanceStatus.current_shift.status}</Badge>
              </div>
            </div>
          </div>
        )}

        {/* Location Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">
              {currentLocation ? 'Location ready' : 'Location needed'}
            </span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={getCurrentLocation}
            disabled={isGettingLocation}
          >
            {isGettingLocation ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            {isGettingLocation ? 'Getting...' : 'Refresh'}
          </Button>
        </div>

        {locationError && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Location Error</p>
              <p className="text-sm text-destructive/80">{locationError}</p>
            </div>
          </div>
        )}

        {/* Nearest Location Info */}
        {nearestLocation && (
          <div className={`p-3 rounded-lg border ${
            nearestLocation.withinRadius 
              ? 'bg-green-50 border-green-200' 
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-start gap-2">
              <MapPin className={`h-4 w-4 mt-0.5 ${
                nearestLocation.withinRadius ? 'text-green-600' : 'text-yellow-600'
              }`} />
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  nearestLocation.withinRadius ? 'text-green-800' : 'text-yellow-800'
                }`}>
                  {nearestLocation.withinRadius ? '✅ Within range' : '⚠️ Outside range'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {nearestLocation.distance < 1000 
                    ? `${Math.round(nearestLocation.distance)}m from ${nearestLocation.location.name}`
                    : `${(nearestLocation.distance / 1000).toFixed(1)}km from ${nearestLocation.location.name}`
                  }
                </p>
                {!nearestLocation.withinRadius && (
                  <p className="text-xs text-yellow-700 mt-1">
                    Required within {nearestLocation.location.radius_meters}m
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-sm font-medium mb-2 block">
            Notes (Optional)
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about your shift..."
            rows={3}
            maxLength={200}
          />
          {notes.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {notes.length}/200 characters
            </p>
          )}
        </div>

        {/* Clock In/Out Buttons */}
        <div className="flex gap-3">
          {!attendanceStatus?.is_clocked_in ? (
            <Button
              onClick={handleClockIn}
              disabled={!currentLocation || isProcessing}
              className="flex-1 h-12"
              size="lg"
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-5 w-5 mr-2" />
              )}
              {isProcessing ? 'Clocking In...' : 'Clock In'}
            </Button>
          ) : (
            <Button
              onClick={handleClockOut}
              disabled={!currentLocation || isProcessing}
              variant="destructive"
              className="flex-1 h-12"
              size="lg"
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Clock className="h-5 w-5 mr-2" />
              )}
              {isProcessing ? 'Clocking Out...' : 'Clock Out'}
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={loadAttendanceStatus}
            disabled={isLoadingStatus}
            size="lg"
            className="px-4"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingStatus ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Last Activity */}
        {attendanceStatus?.last_clock_event && (
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">Last Activity</p>
            <div className="flex justify-between text-sm">
              <span>
                {attendanceStatus.last_clock_event.event_type === 'clock_in' ? 'Clocked In' : 'Clocked Out'}
              </span>
              <span>
                {format(new Date(attendanceStatus.last_clock_event.timestamp), 'MMM dd, h:mm a')}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ClockInOut; 