import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddEmployeeFormData, UserRole } from "@/types"; // Assuming UserRole is exported from types
import { PasswordStrengthIndicator, isPasswordValid } from "@/components/auth/PasswordStrengthIndicator";
import { useState } from "react";

const addEmployeeSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required." }),
  lastName: z.string().min(1, { message: "Last name is required." }),
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string()
    .min(8, { message: "Password must be at least 8 characters." })
    .regex(/[A-Z]/, { message: "Password must include at least one uppercase letter." })
    .regex(/[a-z]/, { message: "Password must include at least one lowercase letter." })
    .regex(/[0-9]/, { message: "Password must include at least one digit." }),
  role: z.enum(["employee", "manager", "administrator"], { required_error: "Role is required." }),
  department: z.string().optional(),
});

interface AddEmployeeFormProps {
  onSubmit: (data: AddEmployeeFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export const AddEmployeeForm = ({ onSubmit, onCancel, isLoading }: AddEmployeeFormProps) => {
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  
  const form = useForm<z.infer<typeof addEmployeeSchema>>({
    resolver: zodResolver(addEmployeeSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      role: "employee" as UserRole, // Provide a valid default
      department: "",
    },
  });

  // values will be inferred by Zod schema to have required fields as non-optional
  const handleFormSubmit = async (values: z.infer<typeof addEmployeeSchema>) => {
    // The schema ensures firstName, lastName, email, password, role are present.
    // AddEmployeeFormData expects these.
    const submitData: AddEmployeeFormData = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      password: values.password,
      role: values.role as UserRole, // role from schema is z.enum, compatible with UserRole
      department: values.department,
    };
    await onSubmit(submitData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="john.doe@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input 
                  type="password" 
                  placeholder="********" 
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    setCurrentPassword(e.target.value);
                  }}
                />
              </FormControl>
              <PasswordStrengthIndicator 
                password={currentPassword}
                onValidationChange={setIsPasswordValid}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                  </FormControl>
                                <SelectContent>
                <SelectItem key="employee" value="employee">Employee</SelectItem>
                <SelectItem key="manager" value="manager">Manager</SelectItem>
                <SelectItem key="administrator" value="administrator">Administrator</SelectItem>
              </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Sales, Engineering" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !isPasswordValid}>
            {isLoading ? "Adding..." : "Add Employee"}
          </Button>
        </div>
      </form>
    </Form>
  );
};