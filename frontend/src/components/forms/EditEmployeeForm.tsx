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
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronsUpDown } from "lucide-react";
import { EditEmployeeFormData, User, UserRole, AvailabilityPattern } from "@/types";
import { useEffect, useState } from "react";

const availabilityPatternSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Invalid time format (HH:MM)" }),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Invalid time format (HH:MM)" }),
  isAvailable: z.boolean(),
});

const editEmployeeSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required." }).optional(),
  lastName: z.string().min(1, { message: "Last name is required." }).optional(),
  department: z.string().optional(),
  skills: z.array(z.string()).optional(),
  phoneNumber: z.string().optional(),
  availability: z.array(availabilityPatternSchema).optional(),
});

type EditEmployeeFormValues = z.infer<typeof editEmployeeSchema>;

interface EditEmployeeFormProps {
  onSubmit: (data: EditEmployeeFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  initialData?: User | null;
}

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

export const EditEmployeeForm = ({ onSubmit, onCancel, isLoading, initialData }: EditEmployeeFormProps) => {
  const [editableAvailability, setEditableAvailability] = useState<AvailabilityPattern[]>([]);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

  const form = useForm<EditEmployeeFormValues>({
    resolver: zodResolver(editEmployeeSchema),
    defaultValues: {
      firstName: initialData?.firstName || "",
      lastName: initialData?.lastName || "",
      department: initialData?.department || "",
      skills: initialData?.skills || [],
      phoneNumber: initialData?.phoneNumber || "",
      availability: initialData?.availability || displayDaysConfig.map(configDay => ({
        dayOfWeek: configDay.dayOfWeekValue,
        startTime: '09:00',
        endTime: '17:00',
        isAvailable: configDay.dayOfWeekValue >= 1 && configDay.dayOfWeekValue <= 5
      })),
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        firstName: initialData.firstName || "",
        lastName: initialData.lastName || "",
        department: initialData.department || "",
        skills: initialData.skills || [],
        phoneNumber: initialData.phoneNumber || "",
        availability: initialData.availability || displayDaysConfig.map(configDay => ({
          dayOfWeek: configDay.dayOfWeekValue,
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: configDay.dayOfWeekValue >= 1 && configDay.dayOfWeekValue <= 5
        })),
      });

      const backendAvailability = initialData.availability && initialData.availability.length > 0
        ? initialData.availability
        : [];
      const newEditableAvailability = displayDaysConfig.map(configDay => {
        const existingAvail = backendAvailability.find(ba => ba.dayOfWeek === configDay.dayOfWeekValue);
        return existingAvail || {
          dayOfWeek: configDay.dayOfWeekValue,
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: configDay.dayOfWeekValue >= 1 && configDay.dayOfWeekValue <= 5
        };
      });
      setEditableAvailability(newEditableAvailability);
    } else {
      setEditableAvailability(displayDaysConfig.map(configDay => ({
        dayOfWeek: configDay.dayOfWeekValue,
        startTime: '09:00',
        endTime: '17:00',
        isAvailable: configDay.dayOfWeekValue >= 1 && configDay.dayOfWeekValue <= 5,
      })));
    }
  }, [initialData, form]);

  const handleAvailabilityChange = (index: number, field: keyof AvailabilityPattern, value: string | boolean) => {
    const newAvailability = editableAvailability.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    setEditableAvailability(newAvailability);
    form.setValue('availability', newAvailability);
  };

  const handleFormSubmit = async (values: EditEmployeeFormValues) => {
    const submitData: EditEmployeeFormData = {
      firstName: values.firstName,
      lastName: values.lastName,
      department: values.department,
      skills: values.skills,
      phoneNumber: values.phoneNumber,
      availability: editableAvailability,
    };
    await onSubmit(submitData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Editing: {initialData?.email} (Role: {initialData?.role})
        </p>

        {!isAvailabilityOpen && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Sales, Engineering" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="+1-555-0100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="skills"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Skills (comma-separated)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Customer Support, Sales" 
                      {...field} 
                      value={Array.isArray(field.value) ? field.value.join(', ') : ''}
                      onChange={(e) => field.onChange(e.target.value.split(',').map(skill => skill.trim()).filter(skill => skill))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <Collapsible open={isAvailabilityOpen} onOpenChange={setIsAvailabilityOpen} className="space-y-2 pt-4 border-t">
          <div className="flex items-center justify-between">
            <FormLabel className="text-md font-semibold">
              {isAvailabilityOpen ? "Editing Weekly Availability" : "Weekly Availability"}
            </FormLabel>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-auto p-2">
                <span className="mr-2">{isAvailabilityOpen ? "Hide Availability" : "Show/Edit Availability"}</span>
                <ChevronsUpDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <ScrollArea className="h-[350px] w-full p-1 pr-3">
              <div className="space-y-3 pt-2">
                {editableAvailability.map((avail, index) => (
                  <div key={avail.dayOfWeek} className="p-3 border rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor={`edit-avail-day-${avail.dayOfWeek}`} className="font-medium w-28">
                        {displayDaysConfig.find(d => d.dayOfWeekValue === avail.dayOfWeek)?.name || `Day ${avail.dayOfWeek}`}
                      </Label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">Available:</span>
                        <Input
                          type="checkbox"
                          id={`edit-avail-check-${avail.dayOfWeek}`}
                          checked={avail.isAvailable}
                          className="form-checkbox h-5 w-5 text-blue-600"
                          onChange={(e) => handleAvailabilityChange(index, 'isAvailable', e.target.checked)}
                        />
                      </div>
                    </div>
                    {avail.isAvailable && (
                      <div className="grid grid-cols-2 gap-4 items-center mt-2">
                        <div>
                          <Label htmlFor={`edit-avail-start-${avail.dayOfWeek}`} className="text-xs text-gray-500">Start Time</Label>
                          <Input
                            type="time"
                            id={`edit-avail-start-${avail.dayOfWeek}`}
                            value={avail.startTime}
                            className="w-full h-10 text-sm"
                            onChange={(e) => handleAvailabilityChange(index, 'startTime', e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`edit-avail-end-${avail.dayOfWeek}`} className="text-xs text-gray-500">End Time</Label>
                          <Input
                            type="time"
                            id={`edit-avail-end-${avail.dayOfWeek}`}
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
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
       
        <div className="flex justify-end space-x-3 pt-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
};