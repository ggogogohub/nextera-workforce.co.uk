import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/lib/auth';
import { AvailabilityPattern, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Save, RotateCcw } from 'lucide-react';

// Define the order and names for displaying days, mapping to backend dayOfWeek (0=Sun, 1=Mon, ...)
const displayDaysConfig = [
  { name: "Monday", dayOfWeekValue: 1 },
  { name: "Tuesday", dayOfWeekValue: 2 },
  { name: "Wednesday", dayOfWeekValue: 3 },
  { name: "Thursday", dayOfWeekValue: 4 },
  { name: "Friday", dayOfWeekValue: 5 },
  { name: "Saturday", dayOfWeekValue: 6 },
  { name: "Sunday", dayOfWeekValue: 0 },
];

export const AvailabilityPage = () => {
  const { user, updateProfile } = useAuthStore();
  const { toast } = useToast();
  // This state will hold AvailabilityPattern objects in the display order (Mon-Sun)
  const [editableAvailability, setEditableAvailability] = useState<AvailabilityPattern[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const initializeAvailability = () => {
    if (user) {
      const backendAvailability = user.availability && user.availability.length > 0 ? user.availability : [];
      
      const newEditableAvailability = displayDaysConfig.map(configDay => {
        const existingAvail = backendAvailability.find(ba => ba.dayOfWeek === configDay.dayOfWeekValue);
        return existingAvail || {
          dayOfWeek: configDay.dayOfWeekValue,
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: configDay.dayOfWeekValue >= 1 && configDay.dayOfWeekValue <= 5 // Default Mon-Fri available
        };
      });
      setEditableAvailability(newEditableAvailability);
    } else {
      // Default structure if no user (e.g., still loading user)
      setEditableAvailability(displayDaysConfig.map(configDay => ({
        dayOfWeek: configDay.dayOfWeekValue,
        startTime: '09:00',
        endTime: '17:00',
        isAvailable: configDay.dayOfWeekValue >= 1 && configDay.dayOfWeekValue <= 5,
      })));
    }
  };

  useEffect(() => {
    initializeAvailability();
  }, [user]); // Re-initialize if user object changes

  // The 'index' here corresponds to the index in the displayDaysConfig/editableAvailability array (0=Monday, 1=Tuesday, etc.)
  const handleAvailabilityChange = (index: number, field: keyof AvailabilityPattern, value: string | boolean) => {
    const newAvailability = editableAvailability.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    setEditableAvailability(newAvailability);
  };

  const handleSaveChanges = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // The editableAvailability is already in the correct format (List[AvailabilityPattern])
      // and contains all 7 days in the order defined by displayDaysConfig.
      // The dayOfWeek values within each item are the backend-compatible 0-6 values.
      const payloadToUpdate = {
        availability: editableAvailability,
      };
      await updateProfile(payloadToUpdate as Partial<User>);
      toast({
        title: 'Availability Updated',
        description: 'Your availability has been successfully saved.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update availability. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleResetChanges = () => {
    initializeAvailability();
    toast({
      title: 'Changes Reset',
      description: 'Your availability has been reset to the last saved state or defaults.',
      variant: 'default'
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Availability</h1>
        <p className="text-gray-600 mt-1">
          Set and manage your weekly availability for scheduling.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Availability Settings</CardTitle>
          <CardDescription>
            Define your typical available hours for each day of the week. Click "Save Changes" when done.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {editableAvailability.map((avail, index) => (
              <div key={avail.dayOfWeek} className="p-4 border rounded-lg shadow-sm bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor={`available-${avail.dayOfWeek}`} className="font-medium text-md w-28">
                    {displayDaysConfig.find(d => d.dayOfWeekValue === avail.dayOfWeek)?.name || `Day ${avail.dayOfWeek}`}
                  </Label>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Available:</span>
                    <Input
                      type="checkbox"
                      id={`available-${avail.dayOfWeek}`}
                      checked={avail.isAvailable}
                      className="form-checkbox h-5 w-5 text-blue-600"
                      onChange={(e) => handleAvailabilityChange(index, 'isAvailable', e.target.checked)}
                    />
                  </div>
                </div>
                {avail.isAvailable && (
                  <div className="grid grid-cols-2 gap-4 items-center mt-2">
                    <div>
                      <Label htmlFor={`startTime-${avail.dayOfWeek}`} className="text-xs text-gray-500">Start Time</Label>
                      <Input
                        type="time"
                        id={`startTime-${avail.dayOfWeek}`}
                        value={avail.startTime}
                        className="w-full h-10 text-sm"
                        onChange={(e) => handleAvailabilityChange(index, 'startTime', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`endTime-${avail.dayOfWeek}`} className="text-xs text-gray-500">End Time</Label>
                      <Input
                        type="time"
                        id={`endTime-${avail.dayOfWeek}`}
                        value={avail.endTime}
                        className="w-full h-10 text-sm"
                        onChange={(e) => handleAvailabilityChange(index, 'endTime', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={handleResetChanges} disabled={isLoading}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button onClick={handleSaveChanges} disabled={isLoading}>
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};