import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScheduleStatus, Schedule as ScheduleType } from "@/types";
import { Trash2 } from "lucide-react";

const scheduleEditSchema = z.object({
  date: z.string().min(1, "Date is required."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time (HH:MM)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time (HH:MM)"),
  location: z.string().min(1, "Location is required."),
  role: z.string().min(1, "Role is required."),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'missed', 'cancelled']),
}).refine((data) => {
  // Validate that end time is after start time
  const start = new Date(`2000-01-01T${data.startTime}:00`);
  const end = new Date(`2000-01-01T${data.endTime}:00`);
  return end > start;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

export type ScheduleEditFormValues = z.infer<typeof scheduleEditSchema>;

interface ScheduleEditFormProps {
  onSubmit: (data: ScheduleEditFormValues) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  isLoading?: boolean;
  isDeleting?: boolean;
  initialData: ScheduleType;
}

export const ScheduleEditForm = ({ onSubmit, onCancel, onDelete, isLoading, isDeleting, initialData }: ScheduleEditFormProps) => {
  const form = useForm<ScheduleEditFormValues>({
    resolver: zodResolver(scheduleEditSchema),
    defaultValues: {
      date: initialData.date,
      startTime: initialData.startTime,
      endTime: initialData.endTime,
      location: initialData.location,
      role: initialData.role,
      status: initialData.status,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Time</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Time</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                            <SelectContent>
              <SelectItem key="scheduled" value="scheduled">Scheduled</SelectItem>
              <SelectItem key="confirmed" value="confirmed">Confirmed</SelectItem>
              <SelectItem key="completed" value="completed">Completed</SelectItem>
              <SelectItem key="missed" value="missed">Missed</SelectItem>
              <SelectItem key="cancelled" value="cancelled">Cancelled</SelectItem>
            </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between pt-4">
          {onDelete && (
            <Button 
              type="button" 
              variant="destructive" 
              onClick={onDelete}
              disabled={isLoading || isDeleting}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? "Deleting..." : "Delete Shift"}
            </Button>
          )}
          <div className="flex space-x-3">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading || isDeleting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isDeleting}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}; 