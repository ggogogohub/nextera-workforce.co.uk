import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, PlusCircle, Clock, Users, MapPin, Award, Settings, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { MultiSelect } from '@/components/ui/multi-select'; // If you have a MultiSelect component
import { apiClient } from "@/lib/api";

// Enhanced schema for the new constraint model
const operatingHoursSchema = z.object({
  day_of_week: z.number().min(0).max(6),
  open_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format"),
  close_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format"),
  is_open: z.boolean(),
  min_staff: z.number().min(1).default(1),
  max_staff: z.number().min(0).optional() // Allow 0 for closed days or unlimited
});

const breakRuleSchema = z.object({
  type: z.enum(["short_break", "meal_break", "rest_period"]),
  duration_minutes: z.number().min(5).max(120),
  required_after_hours: z.number().min(1).max(12),
  is_paid: z.boolean(),
});

const skillRequirementSchema = z.object({
  role: z.string().min(1, "Role is required"),
  required_skills: z.array(z.string()).min(1, "At least one skill required"),
  minimum_experience_months: z.number().min(0).optional(),
  is_mandatory: z.boolean(),
});



const constraintFormSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  operating_hours: z.array(operatingHoursSchema),
  shift_templates: z.array(z.object({
    name: z.string().min(1),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    required_roles: z.record(z.number().int().positive()),
    preferred_locations: z.array(z.string()).default([]),
    is_active: z.boolean().default(true)
  })).optional().default([]),

  max_consecutive_days: z.number().min(1).default(5),
  min_rest_hours_between_shifts: z.number().min(1).default(8),
  max_hours_per_week: z.number().min(1).default(40),
  min_consecutive_hours_per_shift: z.number().min(1).default(4),
  max_consecutive_hours_per_shift: z.number().min(1).default(12),
  optimization_priority: z.enum(["balance_staffing", "minimize_cost", "maximize_coverage", "fairness"]).default("balance_staffing"),
  require_manager_coverage: z.boolean().default(true),
  enforce_employee_availability: z.boolean().default(true),
  enforce_time_off_requests: z.boolean().default(true),
  allow_overtime: z.boolean().default(false),
  locations: z.array(z.string()).optional().default([]),
  departments: z.array(z.string()).optional().default([]),
  roles: z.array(z.string()).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
  break_rules: z.array(breakRuleSchema).optional().default([]),
  skill_requirements: z.array(skillRequirementSchema).optional().default([]),
});

export type ConstraintFormValues = z.infer<typeof constraintFormSchema>;

interface ConstraintFormProps {
  onSubmit: (data: ConstraintFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  initialData?: Partial<ConstraintFormValues>;
  locationOptions?: string[];
  departmentOptions?: string[];
  roleOptions?: string[];
  skillOptions?: string[];
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const BREAK_TYPES = [
  { value: "short_break" as const, label: "Short Break" },
  { value: "meal_break" as const, label: "Meal Break" },
  { value: "rest_period" as const, label: "Rest Period" },
];

const INDUSTRY_DEFAULTS = {
  general: {
    operating_hours: [
      { day_of_week: 1, open_time: "09:00", close_time: "17:00", is_open: true, min_staff: 1, max_staff: 0 },  // Monday
      { day_of_week: 2, open_time: "09:00", close_time: "17:00", is_open: true, min_staff: 1, max_staff: 0 },  // Tuesday
      { day_of_week: 3, open_time: "09:00", close_time: "17:00", is_open: true, min_staff: 1, max_staff: 0 },  // Wednesday
      { day_of_week: 4, open_time: "09:00", close_time: "17:00", is_open: true, min_staff: 1, max_staff: 0 },  // Thursday
      { day_of_week: 5, open_time: "09:00", close_time: "17:00", is_open: true, min_staff: 1, max_staff: 0 },  // Friday
      { day_of_week: 6, open_time: "09:00", close_time: "17:00", is_open: false, min_staff: 1, max_staff: 0 }, // Saturday
      { day_of_week: 0, open_time: "09:00", close_time: "17:00", is_open: false, min_staff: 1, max_staff: 0 }, // Sunday
    ],
    break_rules: [
      { type: "short_break" as const, duration_minutes: 15, required_after_hours: 4, is_paid: true },
    ],
    roles: ["general"],
    max_consecutive_days: 5,
  },
  retail: {
    operating_hours: [
      { day_of_week: 1, open_time: "09:00", close_time: "21:00", is_open: true, min_staff: 2 },  // Monday
      { day_of_week: 2, open_time: "09:00", close_time: "21:00", is_open: true, min_staff: 2 },  // Tuesday
      { day_of_week: 3, open_time: "09:00", close_time: "21:00", is_open: true, min_staff: 2 },  // Wednesday
      { day_of_week: 4, open_time: "09:00", close_time: "21:00", is_open: true, min_staff: 2 },  // Thursday
      { day_of_week: 5, open_time: "09:00", close_time: "21:00", is_open: true, min_staff: 2 },  // Friday
      { day_of_week: 6, open_time: "09:00", close_time: "22:00", is_open: true, min_staff: 3 },  // Saturday
      { day_of_week: 0, open_time: "10:00", close_time: "18:00", is_open: true, min_staff: 1 },  // Sunday
    ],
    break_rules: [
      { type: "short_break" as const, duration_minutes: 15, required_after_hours: 4, is_paid: true },
      { type: "meal_break" as const, duration_minutes: 30, required_after_hours: 6, is_paid: false },
    ],
    roles: ["cashier", "sales_associate", "manager", "stock_clerk"],
    max_consecutive_days: 5,
  },
  healthcare: {
    operating_hours: [
      { day_of_week: 1, open_time: "00:00", close_time: "23:59", is_open: true, min_staff: 3 }, // Monday
      { day_of_week: 2, open_time: "00:00", close_time: "23:59", is_open: true, min_staff: 3 }, // Tuesday
      { day_of_week: 3, open_time: "00:00", close_time: "23:59", is_open: true, min_staff: 3 }, // Wednesday
      { day_of_week: 4, open_time: "00:00", close_time: "23:59", is_open: true, min_staff: 3 }, // Thursday
      { day_of_week: 5, open_time: "00:00", close_time: "23:59", is_open: true, min_staff: 3 }, // Friday
      { day_of_week: 6, open_time: "00:00", close_time: "23:59", is_open: true, min_staff: 3 }, // Saturday
      { day_of_week: 0, open_time: "00:00", close_time: "23:59", is_open: true, min_staff: 3 }, // Sunday
    ],
    break_rules: [
      { type: "short_break" as const, duration_minutes: 15, required_after_hours: 4, is_paid: true },
      { type: "meal_break" as const, duration_minutes: 45, required_after_hours: 6, is_paid: true },
      { type: "rest_period" as const, duration_minutes: 30, required_after_hours: 8, is_paid: true },
    ],
    roles: ["nurse", "doctor", "technician", "admin"],
    max_consecutive_days: 6,
  },
  hospitality: {
    operating_hours: [
      { day_of_week: 1, open_time: "06:00", close_time: "23:00", is_open: true, min_staff: 2 }, // Monday
      { day_of_week: 2, open_time: "06:00", close_time: "23:00", is_open: true, min_staff: 2 }, // Tuesday
      { day_of_week: 3, open_time: "06:00", close_time: "23:00", is_open: true, min_staff: 2 }, // Wednesday
      { day_of_week: 4, open_time: "06:00", close_time: "23:00", is_open: true, min_staff: 2 }, // Thursday
      { day_of_week: 5, open_time: "06:00", close_time: "23:00", is_open: true, min_staff: 2 }, // Friday
      { day_of_week: 6, open_time: "06:00", close_time: "23:00", is_open: true, min_staff: 2 }, // Saturday
      { day_of_week: 0, open_time: "06:00", close_time: "23:00", is_open: true, min_staff: 2 }, // Sunday
    ],
    break_rules: [
      { type: "short_break" as const, duration_minutes: 20, required_after_hours: 5, is_paid: true },
      { type: "meal_break" as const, duration_minutes: 30, required_after_hours: 6, is_paid: false },
    ],
    roles: ["server", "cook", "manager", "host", "cleaner"],
    max_consecutive_days: 5,
  },
};

// Enhanced number input sanitization function
const sanitizeNumberInput = (value: string, min: number = 1): number => {
  // Remove any non-numeric characters
  const cleanValue = value.replace(/[^0-9]/g, '');
  
  // Handle empty string
  if (!cleanValue) return min;
  
  // Remove leading zeros and convert to number
  const numValue = parseInt(cleanValue.replace(/^0+(?!$)/, '') || '0', 10);
  
  // Ensure minimum value
  return Math.max(min, numValue);
};

const NumberInput = ({ field, placeholder, min = 1, step = 1, className = "w-24", disabled = false }: {
  field: { value: number; onChange: (value: number) => void };
  placeholder?: string;
  min?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}) => {
  const [localValue, setLocalValue] = useState<string>(field.value.toString());
  
  // Update local value when field value changes externally
  useEffect(() => {
    setLocalValue(field.value.toString());
  }, [field.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setLocalValue(inputValue);
    
    // Only update the field if the value is valid
    if (inputValue === '' || /^\d+$/.test(inputValue)) {
      const numValue = inputValue === '' ? min : parseInt(inputValue, 10);
      if (numValue >= min) {
        field.onChange(numValue);
      }
    }
  };

  const handleBlur = () => {
    // Sanitize and format on blur
    const sanitizedValue = sanitizeNumberInput(localValue, min);
    field.onChange(sanitizedValue);
    setLocalValue(sanitizedValue.toString());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow backspace, delete, tab, escape, enter
    if ([8, 9, 27, 13, 46].includes(e.keyCode) ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey) ||
        (e.keyCode === 67 && e.ctrlKey) ||
        (e.keyCode === 86 && e.ctrlKey) ||
        (e.keyCode === 88 && e.ctrlKey) ||
        // Allow home, end, left, right
        (e.keyCode >= 35 && e.keyCode <= 39)) {
      return;
    }
    // Ensure that it is a number and stop the keypress
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  };

  return (
    <Input 
      type="text"
      placeholder={placeholder}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
      disabled={disabled}
    />
  );
};

export const ConstraintForm = ({ onSubmit, onCancel, isLoading, initialData, locationOptions = [], departmentOptions = [], roleOptions = [], skillOptions = [] }: ConstraintFormProps) => {
  const [activeTab, setActiveTab] = useState("basic");
  const [totalActiveUsers, setTotalActiveUsers] = useState(10); // Default fallback

  // Fetch total active users for max staff defaults
  useEffect(() => {
    const fetchActiveUsers = async () => {
      try {
        console.log('Fetching active users from API...');
        const response = await apiClient.getUsers({ limit: 500 });
        console.log('API Response for users:', response);
        
        if (response.success && response.data) {
          // The API client returns data in the correct format
          const users = response.data.items || [];
          const activeUsers = users.filter((user: { isActive?: boolean }) => user.isActive !== false);
          console.log('Active users found:', activeUsers.length);
          setTotalActiveUsers(activeUsers.length || 1); // Use 1 as minimum instead of 10
        } else {
          console.warn('API response not successful:', response);
          setTotalActiveUsers(1);
        }
      } catch (error) {
        console.warn('Could not fetch active users:', error);
        setTotalActiveUsers(1); // Use 1 as safe default instead of 10
      }
    };
    fetchActiveUsers();
  }, []);

  // Move getDefaultOperatingHours inside component to access totalActiveUsers
  const getDefaultOperatingHours = () => {
    return Array.from({ length: 7 }, (_, dayIndex) => {
      const dayOfWeek = dayIndex === 6 ? 0 : dayIndex + 1; // Map 0-6 to 1-6,0 (Mon-Sat,Sun)
      return {
        day_of_week: dayOfWeek,
        open_time: "09:00",
        close_time: "17:00",
        is_open: false, // Default to closed, let user select which days are open
        min_staff: 1,
        max_staff: totalActiveUsers
      };
    });
  };

  const form = useForm<ConstraintFormValues>({
    resolver: zodResolver(constraintFormSchema),
    defaultValues: initialData || {
      name: "",
      operating_hours: getDefaultOperatingHours(),
      max_consecutive_days: 5,
      min_rest_hours_between_shifts: 8,
      max_hours_per_week: 40,
      min_consecutive_hours_per_shift: 4,
      max_consecutive_hours_per_shift: 12,
          optimization_priority: "balance_staffing",
    require_manager_coverage: true,
    enforce_employee_availability: true,
    enforce_time_off_requests: true,
    allow_overtime: false,
      locations: locationOptions, // Pre-select all available locations
      departments: departmentOptions, // Pre-select all available departments
      roles: roleOptions, // Pre-select all available roles
      skills: skillOptions, // Pre-select all available skills
      break_rules: INDUSTRY_DEFAULTS.general.break_rules,
      skill_requirements: [],
      shift_templates: [],
    },
  });

  // Reset form when initialData changes (for editing existing constraints)
  useEffect(() => {
    if (initialData) {
      console.log('=== FORM RESET DEBUG ===');
      console.log('Resetting form with initialData:', initialData);
      console.log('Operating hours in initialData:', initialData.operating_hours);
      form.reset(initialData);
    }
  }, [initialData, form]);

  // Remove useFieldArray for operating_hours since we want a fixed 7-day structure
  // const { fields: operatingHoursFields, append: appendOperatingHours, remove: removeOperatingHours } = useFieldArray({
  //   control: form.control,
  //   name: "operating_hours",
  // });

  const { fields: breakRulesFields, append: appendBreakRule, remove: removeBreakRule } = useFieldArray({
    control: form.control,
    name: "break_rules",
  });

  const { fields: skillRequirementsFields, append: appendSkillRequirement, remove: removeSkillRequirement } = useFieldArray({
    control: form.control,
    name: "skill_requirements",
  });



  const handleFormSubmit = async (values: ConstraintFormValues) => {
    console.log("Form submission attempted with values:", values);
    try {
      await onSubmit(values);
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  const handleFormError = (errors: Record<string, unknown>) => {
    console.error("Form validation errors:", errors);
    // Find the first tab with errors and switch to it
    if (errors.operating_hours) {
      setActiveTab("hours");
    } else if (errors.name) {
      setActiveTab("basic");
    } else if (errors.max_consecutive_days || errors.min_consecutive_hours_per_shift || errors.max_consecutive_hours_per_shift) {
      setActiveTab("staff");
    } else if (errors.skills || errors.skill_requirements) {
      setActiveTab("skills");
    } else if (errors.locations || errors.departments || errors.roles) {
      setActiveTab("locations");
    }
  };

  const formErrors = form.formState.errors;
  const hasErrors = Object.keys(formErrors).length > 0;

  return (
    <div className="max-w-4xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit, handleFormError)} className="space-y-6">
          {/* Validation Error Summary */}
          {hasErrors && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Please fix the following errors:
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-red-700">
                  {formErrors.name && (
                    <li>• <strong>Template Name:</strong> {formErrors.name.message}</li>
                  )}
                  {formErrors.operating_hours && (
                    <li>• <strong>Operating Hours:</strong> Please check all required fields</li>
                  )}
                  {formErrors.max_consecutive_days && (
                    <li>• <strong>Max Consecutive Days:</strong> {formErrors.max_consecutive_days.message}</li>
                  )}
                  {formErrors.min_consecutive_hours_per_shift && (
                    <li>• <strong>Min Consecutive Hours:</strong> {formErrors.min_consecutive_hours_per_shift.message}</li>
                  )}
                  {formErrors.max_consecutive_hours_per_shift && (
                    <li>• <strong>Max Consecutive Hours:</strong> {formErrors.max_consecutive_hours_per_shift.message}</li>
                  )}
                  {formErrors.min_rest_hours_between_shifts && (
                    <li>• <strong>Min Rest Hours:</strong> {formErrors.min_rest_hours_between_shifts.message}</li>
                  )}
                  {formErrors.max_hours_per_week && (
                    <li>• <strong>Max Hours Per Week:</strong> {formErrors.max_hours_per_week.message}</li>
                  )}
                  {formErrors.optimization_priority && (
                    <li>• <strong>Optimization Priority:</strong> {formErrors.optimization_priority.message}</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Basic
              </TabsTrigger>
              <TabsTrigger value="hours" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Hours
              </TabsTrigger>
              <TabsTrigger value="staff" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Staffing
              </TabsTrigger>
              <TabsTrigger value="skills" className="flex items-center gap-2">
                <Award className="w-4 h-4" />
                Skills
              </TabsTrigger>
              <TabsTrigger value="locations" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Locations
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Configure the template name and industry type</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Retail Standard, Healthcare Intensive" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />





                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="enforce_employee_availability"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">
                            Enforce employee availability preferences
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="enforce_time_off_requests"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">
                            Enforce approved time-off requests
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="allow_overtime"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="text-sm font-normal">
                            Allow overtime hours
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hours" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Operating Hours</CardTitle>
                  <CardDescription>
                    Define when your business operates each day of the week. Check the box for days you're open, 
                    set your hours, and specify minimum and maximum staff requirements.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Header Row */}
                    <div className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50">
                      <div className="w-28">
                        <span className="text-sm font-medium text-gray-700">Day</span>
                      </div>
                      <div className="w-32">
                        <span className="text-sm font-medium text-gray-700">Open Time</span>
                      </div>
                      <div className="w-8"></div>
                      <div className="w-32">
                        <span className="text-sm font-medium text-gray-700">Close Time</span>
                      </div>
                      <div className="w-24">
                        <span className="text-sm font-medium text-gray-700">Min Staff</span>
                      </div>
                      <div className="w-24">
                        <span className="text-sm font-medium text-gray-700">Max Staff</span>
                      </div>
                    </div>
                    
                    {DAYS_OF_WEEK.map((day, index) => (
                      <div key={day.value} className="flex items-center gap-4 p-4 border rounded-lg">
                        <div className="flex items-center space-x-2 w-28">
                          <FormField
                            control={form.control}
                            name={`operating_hours.${index}.is_open`}
                            render={({ field }) => (
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            )}
                          />
                          <Badge variant="outline" className="w-20 justify-center">
                            {day.label}
                          </Badge>
                        </div>

                        <FormField
                          control={form.control}
                          name={`operating_hours.${index}.open_time`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input 
                                  type="time" 
                                  {...field} 
                                  className="w-32" 
                                  disabled={!form.watch(`operating_hours.${index}.is_open`)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <span className="text-sm text-gray-500">to</span>

                        <FormField
                          control={form.control}
                          name={`operating_hours.${index}.close_time`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input 
                                  type="time" 
                                  {...field} 
                                  className="w-32" 
                                  disabled={!form.watch(`operating_hours.${index}.is_open`)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`operating_hours.${index}.min_staff`}
                          render={({ field }) => (
                            <FormItem className="w-24">
                              <FormControl>
                                <NumberInput
                                  field={field}
                                  placeholder="Min"
                                  min={1}
                                  disabled={!form.watch(`operating_hours.${index}.is_open`)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`operating_hours.${index}.max_staff`}
                          render={({ field }) => (
                            <FormItem className="w-24">
                              <FormControl>
                                <NumberInput
                                  field={{ 
                                    value: field.value ?? totalActiveUsers, 
                                    onChange: (value) => {
                                      field.onChange(value);
                                    }
                                  }}
                                  placeholder="Max"
                                  min={0}
                                  disabled={!form.watch(`operating_hours.${index}.is_open`)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Break Rules</CardTitle>
                  <CardDescription>Define required breaks based on hours worked</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {breakRulesFields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-4 p-4 border rounded-lg">
                        <FormField
                          control={form.control}
                          name={`break_rules.${index}.type`}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {BREAK_TYPES.map(type => (
                                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`break_rules.${index}.duration_minutes`}
                          render={({ field }) => (
                            <FormItem className="w-24">
                              <FormControl>
                                <NumberInput
                                  field={field}
                                  placeholder="Minutes"
                                  min={5}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <span>after</span>

                        <FormField
                          control={form.control}
                          name={`break_rules.${index}.required_after_hours`}
                          render={({ field }) => (
                            <FormItem className="w-24">
                              <FormControl>
                                <NumberInput
                                  field={field}
                                  placeholder="Hours"
                                  min={1}
                                  step={0.5}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <span>hours</span>

                        <FormField
                          control={form.control}
                          name={`break_rules.${index}.is_paid`}
                          render={({ field }) => (
                            <div className="flex items-center space-x-2">
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                              <span className="text-sm">Paid</span>
                            </div>
                          )}
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBreakRule(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => appendBreakRule({
                        type: "short_break" as const,
                        duration_minutes: 15,
                        required_after_hours: 4,
                        is_paid: true
                      })}
                    >
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Add Break Rule
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="staff" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Staffing Rules</CardTitle>
                  <CardDescription>Configure work limits and consecutive day restrictions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Shift Duration Constraints */}
                    <div>
                      <h4 className="font-medium mb-4">Shift Duration Constraints</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="min_consecutive_hours_per_shift"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Min Consecutive Hours Per Shift</FormLabel>
                              <FormControl>
                                <NumberInput 
                                  field={field} 
                                  placeholder="1"
                                  min={1} 
                                  step={0.5}
                                  className="w-full" 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="max_consecutive_hours_per_shift"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max Consecutive Hours Per Shift</FormLabel>
                              <FormControl>
                                <NumberInput 
                                  field={field} 
                                  placeholder="8"
                                  min={1} 
                                  step={0.5}
                                  className="w-full" 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Work Limits */}
                    <div>
                      <h4 className="font-medium mb-4">Work Limits</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="max_consecutive_days"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max Consecutive Days</FormLabel>
                              <FormControl>
                                <NumberInput field={field} min={1} className="w-full" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="min_rest_hours_between_shifts"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Min Rest Hours Between Shifts</FormLabel>
                              <FormControl>
                                <NumberInput field={field} min={8} className="w-full" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="max_hours_per_week"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max Hours Per Week</FormLabel>
                              <FormControl>
                                <NumberInput field={field} min={20} className="w-full" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Manager Coverage Settings */}
                    <div>
                      <h4 className="font-medium mb-4">Manager Coverage Settings</h4>
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="require_manager_coverage"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                              <div className="space-y-1">
                                <FormLabel className="text-sm font-normal">
                                  Require Manager Coverage Throughout Operating Hours
                                </FormLabel>
                                <FormDescription className="text-xs text-gray-500">
                                  Ensures at least one manager is present from opening to closing, covering all business hours
                                </FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Optimization Settings */}
                    <div>
                      <h4 className="font-medium mb-4">Optimization Settings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="optimization_priority"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Optimization Priority</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="balance_staffing">Balance Staffing</SelectItem>
                                  <SelectItem value="minimize_cost">Minimize Cost</SelectItem>
                                  <SelectItem value="maximize_coverage">Maximize Coverage</SelectItem>
                                  <SelectItem value="fairness">Fairness</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="skills" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Skill Requirements</CardTitle>
                  <CardDescription>Define skill requirements for specific roles and select global skills.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6">
                    <FormLabel>Skills</FormLabel>
                    <FormField
                      control={form.control}
                      name="skills"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <MultiSelect
                              options={skillOptions || []}
                              value={Array.isArray(field.value) ? field.value : []}
                              onChange={field.onChange}
                              placeholder="Select or add skills"
                              creatable
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="space-y-4">
                    {skillRequirementsFields.map((field, index) => (
                      <div key={field.id} className="p-4 border rounded-lg space-y-4">
                        <div className="flex items-center gap-4">
                          <FormField
                            control={form.control}
                            name={`skill_requirements.${index}.role`}
                            render={({ field }) => (
                              <Input placeholder="Role name" {...field} className="flex-1" />
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`skill_requirements.${index}.minimum_experience_months`}
                            render={({ field }) => (
                              <FormItem className="w-48">
                                <FormControl>
                                  <NumberInput
                                    field={field}
                                    placeholder="Min experience (months)"
                                    min={0}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`skill_requirements.${index}.is_mandatory`}
                            render={({ field }) => (
                              <div className="flex items-center space-x-2">
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                <span className="text-sm">Mandatory</span>
                              </div>
                            )}
                          />

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSkillRequirement(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <FormField
                          control={form.control}
                          name={`skill_requirements.${index}.required_skills`}
                          render={({ field }) => (
                            <MultiSelect
                              options={skillOptions || []}
                              value={Array.isArray(field.value) ? field.value : []}
                              onChange={field.onChange}
                              placeholder="Select or add required skills"
                              creatable
                            />
                          )}
                        />
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => appendSkillRequirement({
                        role: "",
                        required_skills: [],
                        minimum_experience_months: 0,
                        is_mandatory: true
                      })}
                    >
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Add Skill Requirement
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="locations" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Locations, Departments & Roles</CardTitle>
                  <CardDescription>Configure organizational structure. Select from existing options or add new ones.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <FormLabel>Locations</FormLabel>
                      <FormField
                        control={form.control}
                        name="locations"
                        render={({ field }) => (
                          <MultiSelect
                            options={locationOptions || []}
                            value={Array.isArray(field.value) ? field.value : []}
                            onChange={field.onChange}
                            placeholder="Select or add locations"
                            creatable
                          />
                        )}
                      />
                      <FormMessage />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>Departments</FormLabel>
                      <FormField
                        control={form.control}
                        name="departments"
                        render={({ field }) => (
                          <MultiSelect
                            options={departmentOptions || []}
                            value={Array.isArray(field.value) ? field.value : []}
                            onChange={field.onChange}
                            placeholder="Select or add departments"
                            creatable
                          />
                        )}
                      />
                      <FormMessage />
                    </div>
                    <div className="space-y-2">
                      <FormLabel>Roles</FormLabel>
                      <FormField
                        control={form.control}
                        name="roles"
                        render={({ field }) => (
                          <MultiSelect
                            options={roleOptions || []}
                            value={Array.isArray(field.value) ? field.value : []}
                            onChange={field.onChange}
                            placeholder="Select or add roles"
                            creatable
                          />
                        )}
                      />
                      <FormMessage />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};