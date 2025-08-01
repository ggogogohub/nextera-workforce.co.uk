
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { TimeOffFormData, TimeOffType } from '@/types';

interface TimeOffRequestFormProps {
  onSubmit: (data: TimeOffFormData) => Promise<void>;
  isSubmitting?: boolean;
}

export const TimeOffRequestForm = ({ onSubmit, isSubmitting = false }: TimeOffRequestFormProps) => {
  const [formData, setFormData] = useState({
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    type: '' as TimeOffType | '',
    reason: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.startDate || !formData.endDate || !formData.type || !formData.reason) {
      return;
    }

    await onSubmit({
      startDate: format(formData.startDate, 'yyyy-MM-dd'),
      endDate: format(formData.endDate, 'yyyy-MM-dd'),
      type: formData.type,
      reason: formData.reason,
    });
  };

  const calculateDays = () => {
    if (formData.startDate && formData.endDate) {
      const diffTime = Math.abs(formData.endDate.getTime() - formData.startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays;
    }
    return 0;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Start Date */}
      <div className="space-y-2">
        <Label>Start Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !formData.startDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formData.startDate ? format(formData.startDate, "PPP") : "Select start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={formData.startDate}
              onSelect={(date) => setFormData({ ...formData, startDate: date })}
              disabled={(date) => date < new Date()}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* End Date */}
      <div className="space-y-2">
        <Label>End Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !formData.endDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formData.endDate ? format(formData.endDate, "PPP") : "Select end date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={formData.endDate}
              onSelect={(date) => setFormData({ ...formData, endDate: date })}
              disabled={(date) => date < (formData.startDate || new Date())}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Type */}
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value as TimeOffType })}>
          <SelectTrigger>
            <SelectValue placeholder="Select time-off type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem key="vacation" value="vacation">Vacation</SelectItem>
            <SelectItem key="sick" value="sick">Sick Leave</SelectItem>
            <SelectItem key="personal" value="personal">Personal</SelectItem>
            <SelectItem key="emergency" value="emergency">Emergency</SelectItem>
            <SelectItem key="other" value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reason */}
      <div className="space-y-2">
        <Label>Reason</Label>
        <Textarea
          placeholder="Please provide a reason for your time-off request..."
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          rows={3}
        />
      </div>

      {/* Summary */}
      {formData.startDate && formData.endDate && (
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-sm text-gray-600">
            <strong>Total Days:</strong> {calculateDays()} day(s)
          </p>
        </div>
      )}

      {/* Submit Button */}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Submitting...' : 'Submit Request'}
      </Button>
    </form>
  );
};
