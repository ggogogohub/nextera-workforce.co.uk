import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, SlidersHorizontal, Trash2, Edit } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConstraintForm, ConstraintFormValues } from '@/components/forms/ConstraintForm';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from "@/components/ui/scroll-area";
import { User } from '@/types';

interface ConstraintParameters {
  operating_hours?: Array<{
    day_of_week: number;
    open_time: string;
    close_time: string;
    is_open: boolean;
    min_staff: number;
    max_staff?: number;
  }>;
  max_consecutive_days?: number;
  min_rest_hours_between_shifts?: number;
  max_hours_per_week?: number;
  break_rules?: Array<{
    type: string;
    duration_minutes: number;
    required_after_hours: number;
    is_paid: boolean;
  }>;
  skill_requirements?: Array<{
    role: string;
    required_skills: string[];
    minimum_experience_months?: number;
    is_mandatory: boolean;
  }>;
  shift_templates?: Array<{
    name: string;
    start_time: string;
    end_time: string;
    required_roles: Record<string, number>;
    preferred_locations: string[];
    is_active: boolean;
  }>;
  locations?: string[];
  roles?: string[];
  departments?: string[];
  skills?: string[];
  min_consecutive_hours_per_shift?: number;
  max_consecutive_hours_per_shift?: number;
  optimization_priority?: string;
  enforce_employee_availability?: boolean;
  enforce_time_off_requests?: boolean;
  allow_overtime?: boolean;
  // Legacy fields for backward compatibility
  maxEmployeesPerDay?: number;
  maxConsecutiveDays?: number;
  shiftTimes?: { start: string; end: string }[];
  solverTimeLimit?: number;
  employeeAvailability?: { [employeeId: string]: { availableDays: string[] } };
}

interface Constraint {
  id: string;
  name: string;
  // Backend now returns flat structure, not nested under parameters
  operating_hours: Array<{
    day_of_week: number;
    open_time: string;
    close_time: string;
    is_open: boolean;
    min_staff: number;
    max_staff?: number;
  }>;

  max_consecutive_days: number;
  min_rest_hours_between_shifts: number;
  max_hours_per_week: number;
  break_rules: Array<{
    type: string;
    duration_minutes: number;
    required_after_hours: number;
    is_paid: boolean;
  }>;
  skill_requirements: Array<{
    role: string;
    required_skills: string[];
    minimum_experience_months?: number;
    is_mandatory: boolean;
  }>;
  shift_templates: Array<{
    name: string;
    start_time: string;
    end_time: string;
    required_roles: Record<string, number>;
    preferred_locations: string[];
    is_active: boolean;
  }>;
  locations: string[];
  departments: string[];
  roles: string[];
  skills: string[];
  min_consecutive_hours_per_shift: number;
  max_consecutive_hours_per_shift: number;
  optimization_priority: string;
  require_manager_coverage: boolean;
  enforce_employee_availability: boolean;
  enforce_time_off_requests: boolean;
  allow_overtime: boolean;
  is_default: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  // Legacy support for backward compatibility
  parameters?: ConstraintParameters;
}

export const ConstraintManagement = () => {
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<Constraint | null>(null);
  const [editingConstraintInitialData, setEditingConstraintInitialData] = useState<Partial<ConstraintFormValues> | undefined>(undefined);
  const [deletingConstraint, setDeletingConstraint] = useState<Constraint | null>(null);
  const { toast } = useToast();
  const [locations, setLocations] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);

  const loadConstraints = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.getSchedulingConstraints();
      if (response.success && Array.isArray(response.data)) {
        const formatted = response.data.map(c => ({ ...c, id: c.id || c._id, parameters: c.parameters || {} }));
        setConstraints(formatted);
      } else {
        toast({ title: "Error", description: "Failed to load constraints.", variant: "destructive" });
        setConstraints([]);
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not fetch constraints.", variant: "destructive" });
      setConstraints([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConstraints();
  }, [loadConstraints]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        // Fetch locations
        const locRes = await apiClient.getLocations();
        if (locRes.success && Array.isArray(locRes.data)) {
          setLocations(locRes.data.map((l: { name: string }) => l.name));
        }
        // Fetch users for departments and roles
        const usersRes = await apiClient.getUsers({ limit: 500 });
        if (usersRes.success && usersRes.data && Array.isArray(usersRes.data.items)) {
          const users: User[] = usersRes.data.items;
          const deptSet = new Set(users.map((u: User) => u.department).filter(Boolean));
          setDepartments(Array.from(deptSet));
          const roleSet = new Set(users.map((u: User) => u.role).filter(Boolean));
          setRoles(Array.from(roleSet));
          // Aggregate all skills
          const allSkills = users.flatMap((u: User) => u.skills || []);
          setSkills(Array.from(new Set(allSkills)));
        }
      } catch (err) {
        console.error('Error fetching options:', err);
      }
    };
    fetchOptions();
  }, []);

  const handleFormSubmit = async (data: ConstraintFormValues) => {
    setIsSubmitting(true);

    // Send flat structure to match backend ConstraintCreate schema
    const apiData = {
      name: data.name,
      operating_hours: data.operating_hours.map(hour => ({
        day_of_week: Number(hour.day_of_week),
        open_time: hour.open_time,
        close_time: hour.close_time,
        is_open: Boolean(hour.is_open),
        min_staff: Number(hour.min_staff),
        max_staff: hour.max_staff ? Number(hour.max_staff) : undefined
      })),
      max_consecutive_days: Number(data.max_consecutive_days),
      min_rest_hours_between_shifts: Number(data.min_rest_hours_between_shifts),
      max_hours_per_week: Number(data.max_hours_per_week),
      break_rules: data.break_rules.map(rule => ({
        type: rule.type,
        duration_minutes: Number(rule.duration_minutes),
        required_after_hours: Number(rule.required_after_hours),
        is_paid: Boolean(rule.is_paid)
      })),
      skill_requirements: data.skill_requirements.map((sr: { role: string; required_skills: string[]; minimum_experience_months: number; is_mandatory: boolean; }) => ({
        role: sr.role || '',
        required_skills: Array.isArray(sr.required_skills) ? sr.required_skills : [],
        minimum_experience_months: Number(sr.minimum_experience_months) || 0,
        is_mandatory: Boolean(sr.is_mandatory),
      })),
      shift_templates: data.shift_templates,
      locations: data.locations || [],
      departments: data.departments || [],
      roles: data.roles || [],
      skills: data.skills || [],
      min_consecutive_hours_per_shift: Number(data.min_consecutive_hours_per_shift),
      max_consecutive_hours_per_shift: Number(data.max_consecutive_hours_per_shift),
      optimization_priority: (typeof data.optimization_priority !== "string" || !["balance_staffing", "minimize_cost", "maximize_coverage", "fairness"].includes(data.optimization_priority)) ? "balance_staffing" : data.optimization_priority as "balance_staffing" | "minimize_cost" | "maximize_coverage" | "fairness",
      require_manager_coverage: Boolean(data.require_manager_coverage),
      enforce_employee_availability: Boolean(data.enforce_employee_availability),
      enforce_time_off_requests: Boolean(data.enforce_time_off_requests),
      allow_overtime: Boolean(data.allow_overtime),
    };

    try {
      if (editingConstraint) {
        await apiClient.updateSchedulingConstraints(editingConstraint.id, apiData);
        toast({ title: "Success", description: "Constraint template updated successfully." });
      } else {
        await apiClient.createSchedulingConstraints(apiData);
        toast({ title: "Success", description: "Constraint template created successfully." });
      }
      setIsFormOpen(false);
      setEditingConstraint(null);
      loadConstraints();
    } catch (error) {
      console.error('Error saving constraint:', error);
      toast({
        title: "Error",
        description: "Failed to save constraint template. Please check all fields and try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingConstraint) return;
    try {
      await apiClient.deleteSchedulingConstraint(deletingConstraint.id);
      toast({ title: "Success", description: "Constraint template deleted." });
      setDeletingConstraint(null);
      loadConstraints();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete template.", variant: "destructive" });
    }
  }

  const handleEditClick = (constraint: Constraint) => {
    // Helper function to get field value with fallback to parameters
    const getFieldValue = (directField: unknown, paramField: unknown, defaultValue: unknown): unknown => {
      return directField !== undefined ? directField : (paramField !== undefined ? paramField : defaultValue);
    };

    // Ensure operating_hours has all 7 days (0=Sunday to 6=Saturday)
    // The backend now returns flat structure, so use constraint.operating_hours directly
    const existingHours = constraint.operating_hours || [];

    // Map days in the correct order: Monday(1), Tuesday(2), Wednesday(3), Thursday(4), Friday(5), Saturday(6), Sunday(0)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Monday to Sunday
    const fullWeekHours = dayOrder.map((dayOfWeek) => {
      const existing = existingHours.find(h => h.day_of_week === dayOfWeek);
      return existing || {
        day_of_week: dayOfWeek,
        open_time: "09:00",
        close_time: "17:00",
        is_open: dayOfWeek >= 1 && dayOfWeek <= 5, // Monday to Friday default to open
        min_staff: 1,
        max_staff: undefined
      };
    });

    // Properly map backend constraint data to form schema with fallbacks
    // Backend now returns flat structure, so use direct fields
    const initialData = {
      name: constraint.name,
      operating_hours: fullWeekHours,

      max_consecutive_days: constraint.max_consecutive_days || 5,
      min_rest_hours_between_shifts: constraint.min_rest_hours_between_shifts || 8,
      max_hours_per_week: constraint.max_hours_per_week || 40,
      break_rules: (constraint.break_rules || []).map((rule) => ({
        ...rule,
        type: rule.type as "short_break" | "meal_break" | "rest_period"
      })),
      skill_requirements: (constraint.skill_requirements || []).map(sr => ({
        role: sr.role || '',
        required_skills: Array.isArray(sr.required_skills) ? sr.required_skills : [],
        minimum_experience_months: sr.minimum_experience_months || 0,
        is_mandatory: Boolean(sr.is_mandatory),
      })),
      shift_templates: constraint.shift_templates || [],
      locations: constraint.locations || [],
      departments: constraint.departments || [],
      roles: constraint.roles || [],
      skills: (() => {
        console.log("DEBUG: Skills from constraint:", constraint.skills);
        console.log("DEBUG: Skills type:", typeof constraint.skills);
        console.log("DEBUG: Skills isArray:", Array.isArray(constraint.skills));
        return Array.isArray(constraint.skills) ? constraint.skills : [];
      })(),
      min_consecutive_hours_per_shift: constraint.min_consecutive_hours_per_shift || 4,
      max_consecutive_hours_per_shift: constraint.max_consecutive_hours_per_shift || 12,
      optimization_priority: (() => {
         const op = constraint.optimization_priority || "balance_staffing";
         if (typeof op !== "string" || !["balance_staffing", "minimize_cost", "maximize_coverage", "fairness"].includes(op)) {
            return "balance_staffing";
          }
          return op as "balance_staffing" | "minimize_cost" | "maximize_coverage" | "fairness";
       })(),
      require_manager_coverage: constraint.require_manager_coverage ?? true,
      enforce_employee_availability: constraint.enforce_employee_availability ?? true,
      enforce_time_off_requests: constraint.enforce_time_off_requests ?? true,
      allow_overtime: constraint.allow_overtime ?? false,
    };

    setEditingConstraint(constraint);
    setEditingConstraintInitialData(initialData);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setEditingConstraint(null);
    setEditingConstraintInitialData(undefined);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scheduling Constraints</h1>
        <p className="text-gray-600 mt-1">
          Manage templates for AI-powered schedule generation.
        </p>
      </div>

      <Dialog open={isFormOpen} onOpenChange={(isOpen) => {
        setIsFormOpen(isOpen);
        if (!isOpen) {
          setEditingConstraint(null);
          setEditingConstraintInitialData(undefined);
        }
      }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Constraint Templates</CardTitle>
              <CardDescription>
                A list of saved scheduling constraint templates.
              </CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : constraints.length > 0 ? (
              <div className="space-y-3">
                {constraints.map((constraint) => (
                  <div key={constraint.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <SlidersHorizontal className="h-6 w-6 text-gray-500" />
                      <div>
                        <p className="font-semibold">{constraint.name}</p>
                        <p className="text-sm text-gray-500">
                          {(() => {
                            // Count actual constraint fields that have meaningful values
                            let count = 0;
                            if (constraint.operating_hours?.length) count++;
                            if (constraint.locations?.length) count++;
                            if (constraint.departments?.length) count++;
                            if (constraint.roles?.length) count++;
                            if (constraint.skills?.length) count++;
                            if (constraint.break_rules?.length) count++;
                            if (constraint.shift_templates?.length) count++;
                            return `${count} parameter group(s) configured`;
                          })()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEditClick(constraint)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => setDeletingConstraint(constraint)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>No constraint templates found.</p>
                <p className="text-sm">Click "New Template" to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <DialogContent className="max-w-3xl"> {/* Increased size for luxury feel */}
          <DialogHeader>
            <DialogTitle>{editingConstraint ? 'Edit' : 'New'} Constraint Template</DialogTitle>
            <DialogDescription>
              Define the parameters for schedule generation.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] p-4">
            <ConstraintForm
              key={editingConstraint?.id || 'new'}
              onSubmit={handleFormSubmit}
              onCancel={() => { setIsFormOpen(false); setEditingConstraint(null); setEditingConstraintInitialData(undefined); }}
              isLoading={isSubmitting}
              initialData={editingConstraintInitialData || {
                name: "",
                operating_hours: Array.from({ length: 7 }, (_, dayIndex) => ({
                  day_of_week: dayIndex === 6 ? 0 : dayIndex + 1, // Map 0-6 to 1-6,0 (Mon-Sat,Sun)
                  open_time: "09:00",
                  close_time: "17:00",
                  is_open: (dayIndex === 6 ? 0 : dayIndex + 1) >= 1 && (dayIndex === 6 ? 0 : dayIndex + 1) <= 5, // Monday to Friday open
                  min_staff: 1
                })),
                
                max_consecutive_days: 5,
                min_rest_hours_between_shifts: 8,
                max_hours_per_week: 40,
                break_rules: [
                  { type: "short_break" as const, duration_minutes: 15, required_after_hours: 4, is_paid: true },
                ],
                skill_requirements: [],
                shift_templates: [],
                locations: locations, // Pre-select all available locations for new forms
                departments: departments, // Pre-select all available departments for new forms  
                roles: roles, // Pre-select all available roles for new forms
                skills: skills, // Pre-select all available skills for new forms
                min_consecutive_hours_per_shift: 4,
      max_consecutive_hours_per_shift: 12,
                optimization_priority: "fairness" as const,
                enforce_employee_availability: true,
                enforce_time_off_requests: true,
                allow_overtime: false,
              }}
              locationOptions={locations}
              departmentOptions={departments}
              roleOptions={roles}
              skillOptions={skills}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingConstraint} onOpenChange={(isOpen) => !isOpen && setDeletingConstraint(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the constraint template "{deletingConstraint?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};