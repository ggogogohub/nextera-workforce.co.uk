
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import { Users, Plus, Search, Filter, MoreVertical, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"; // Import Popover components
import { Label } from "@/components/ui/label"; // Import Label
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select components
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Ensure all AlertDialog parts are imported
import { AddEmployeeForm } from '@/components/forms/AddEmployeeForm';
import { EditEmployeeForm } from '@/components/forms/EditEmployeeForm';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { User, AddEmployeeFormData, EditEmployeeFormData, UserRole } from '@/types'; // Import UserRole
import { useToast } from '@/hooks/use-toast';

export const TeamManagement = () => {
  const navigate = useNavigate();
  const { user: loggedInUser, logout: authLogout } = useAuthStore();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isAddEmployeeDialogOpen, setIsAddEmployeeDialogOpen] = useState(false);
  const [isSubmittingEmployee, setIsSubmittingEmployee] = useState(false);
  const [isEditEmployeeDialogOpen, setIsEditEmployeeDialogOpen] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<User | null>(null);
  const [isUpdatingEmployee, setIsUpdatingEmployee] = useState(false);
  const [isToggleActiveAlertOpen, setIsToggleActiveAlertOpen] = useState(false);
  const [employeeToToggleActive, setEmployeeToToggleActive] = useState<User | null>(null);
  const [isTogglingActiveState, setIsTogglingActiveState] = useState(false);

  // State for filters
  const [filterRole, setFilterRole] = useState<UserRole | ''>('');
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  // const [filterStatus, setFilterStatus] = useState<boolean | ''>(''); // For later if we add status filter

  // For populating department filter options dynamically
  const [uniqueDepartments, setUniqueDepartments] = useState<string[]>([]);

  useEffect(() => {
    loadEmployees();
  }, []); // Initial load

  useEffect(() => {
    if (employees.length > 0) {
      const departments = new Set(employees.map(emp => emp.department).filter(Boolean) as string[]);
      setUniqueDepartments(Array.from(departments).sort());
    }
  }, [employees]);

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);


  const loadEmployees = async (currentFilters?: { role?: UserRole | '', department?: string, search?: string }) => {
    try {
      setIsLoading(true);
      const params: Record<string, string> = {};
      if (currentFilters?.role) params.role = currentFilters.role;
      if (currentFilters?.department) params.department = currentFilters.department;
      if (currentFilters?.search) params.search = currentFilters.search; // Integrate search term

      const response = await apiClient.getUsers(params);
      if (response.success && response.data && response.data.items) {
        const formattedUsers = response.data.items.map((item) => {
          const rawItem = item as User & { _id?: string };
          return {
            ...rawItem,
            id: rawItem.id || rawItem._id!,
          } as User;
        });
        setEmployees(formattedUsers);
      } else {
        console.error('Failed to load employees:', response.message || "No data items received");
        setEmployees([]);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmployeeSubmit = async (data: AddEmployeeFormData) => {
    setIsSubmittingEmployee(true);
    try {
      const response = await apiClient.createUser(data);
      if (response.success) {
        toast({
          title: "Success!",
          description: "Employee created successfully.",
          variant: "default",
        });
        setIsAddEmployeeDialogOpen(false);
        loadEmployees(); // Refresh the list
      } else {
        toast({
          title: "Error",
          description: response.message || "Failed to create employee.",
          variant: "destructive",
        });
        console.error("Failed to create employee:", response.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      console.error("Error creating employee:", error);
    } finally {
      setIsSubmittingEmployee(false);
    }
  };

  const handleEditEmployeeSubmit = async (data: EditEmployeeFormData) => {
    if (!employeeToEdit) return;
    setIsUpdatingEmployee(true);
    try {
      const response = await apiClient.updateUser(employeeToEdit.id, data);
      if (response.success) {
        toast({
          title: "Success!",
          description: "Employee updated successfully.",
          variant: "default",
        });
        setIsEditEmployeeDialogOpen(false);
        setEmployeeToEdit(null);
        loadEmployees(); // Refresh the list
      } else {
        toast({
          title: "Error",
          description: response.message || "Failed to update employee.",
          variant: "destructive",
        });
        console.error("Failed to update employee:", response.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      console.error("Error updating employee:", error);
    } finally {
      setIsUpdatingEmployee(false);
    }
  };

  const handleToggleActiveState = async () => {
    if (!employeeToToggleActive) return;
    setIsTogglingActiveState(true);
    const isSelfDeactivation = loggedInUser?.id === employeeToToggleActive.id && employeeToToggleActive.isActive;

    try {
      const newActiveState = !employeeToToggleActive.isActive;
      await apiClient.updateUser(employeeToToggleActive.id, { isActive: newActiveState });
      toast({
        title: "Success!",
        description: `Employee ${newActiveState ? 'activated' : 'deactivated'} successfully.`,
        variant: "default",
      });
      
      // If self-deactivation was successful, prioritize logout and redirect
      if (isSelfDeactivation && !newActiveState) {
        setIsTogglingActiveState(false); // Reset loading state
        setIsToggleActiveAlertOpen(false); // Close dialog
        setEmployeeToToggleActive(null);  // Clear target
        await authLogout(); // Perform frontend logout
        navigate('/login', { replace: true }); // Redirect to login page, replace history
        return; // Important: Stop further execution in this function for self-deactivation
      }
      
      // For other cases (activating self, or toggling other users)
      loadEmployees();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      console.error("Error toggling employee active state:", error);
    } finally {
      setIsTogglingActiveState(false);
      setIsToggleActiveAlertOpen(false);
      setEmployeeToToggleActive(null);
    }
  };

  // Client-side filtering is removed as backend now handles search and filters.
  // The 'filteredEmployees' variable will now just be 'employees' directly from state.
  // Or, if searchTerm is still to be applied client-side on top of backend filters:
  const displayedEmployees = employees.filter(employee =>
    // This client-side search can be removed if backend search is sufficient
    // or kept if more nuanced local searching is desired on the filtered results.
    // For now, let's assume backend search is primary. If searchTerm is passed to loadEmployees,
    // this client-side filter might be redundant or could be a secondary refinement.
    // Let's simplify and assume backend handles all filtering for now.
    true // Placeholder, will directly use 'employees' if backend handles all filtering
  );
  // If we want to keep client-side search on top of backend filters:
  // const displayedEmployees = employees.filter(employee =>
  //   `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
  //   employee.email.toLowerCase().includes(searchTerm.toLowerCase())
  // );


  const handleApplyFilters = () => {
    loadEmployees({ role: filterRole, department: filterDepartment, search: searchTerm });
  };

  const handleClearFilters = () => {
    setFilterRole('');
    setFilterDepartment('');
    setSearchTerm(''); // Also clear search term
    // Clear any pending search timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      setSearchTimeout(null);
    }
    loadEmployees({ search: '' }); // Load all users
  };

  // Debounced search function
  const debouncedSearch = useCallback((searchValue: string) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeout = setTimeout(() => {
      loadEmployees({ role: filterRole, department: filterDepartment, search: searchValue });
    }, 300); // 300ms delay
    
    setSearchTimeout(timeout);
  }, [filterRole, filterDepartment, searchTimeout]);


  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'administrator': return 'bg-red-100 text-red-800';
      case 'manager': return 'bg-blue-100 text-blue-800';
      case 'employee': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper function to format last login date safely
  const formatLastLogin = (lastLogin: string | null | undefined) => {
    if (!lastLogin) return 'Never logged in';
    try {
      const date = new Date(lastLogin);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  // Helper function to check if user logged in today
  const isLoggedInToday = (lastLogin: string | null | undefined) => {
    if (!lastLogin) return false;
    try {
      const loginDate = new Date(lastLogin);
      if (isNaN(loginDate.getTime())) return false;
      return loginDate.toDateString() === new Date().toDateString();
    } catch {
      return false;
    }
  };

  // Helper function to count active filters
  const getActiveFilterCount = () => {
    let count = 0;
    if (filterRole) count++;
    if (filterDepartment) count++;
    if (searchTerm && searchTerm.trim() !== '') count++;
    return count;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="text-gray-600 mt-1">
            Manage your team members and their information
          </p>
        </div>
        
        <Dialog open={isAddEmployeeDialogOpen} onOpenChange={setIsAddEmployeeDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Fill in the details below to add a new team member.
              </DialogDescription>
            </DialogHeader>
            <AddEmployeeForm
              onSubmit={handleAddEmployeeSubmit}
              onCancel={() => setIsAddEmployeeDialogOpen(false)}
              isLoading={isSubmittingEmployee}
            />
          </DialogContent>
        </Dialog>

        {/* Edit Employee Dialog */}
        {employeeToEdit && (
          <Dialog open={isEditEmployeeDialogOpen} onOpenChange={(open) => {
            setIsEditEmployeeDialogOpen(open);
            if (!open) setEmployeeToEdit(null); // Clear selection when dialog closes
          }}>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Edit Employee</DialogTitle>
                <DialogDescription>
                  Update the details for {employeeToEdit.firstName} {employeeToEdit.lastName}.
                </DialogDescription>
              </DialogHeader>
              <EditEmployeeForm
                initialData={employeeToEdit}
                onSubmit={handleEditEmployeeSubmit}
                onCancel={() => {
                  setIsEditEmployeeDialogOpen(false);
                  setEmployeeToEdit(null);
                }}
                isLoading={isUpdatingEmployee}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Activate/Deactivate Confirmation Dialog */}
        {employeeToToggleActive && (
          <AlertDialog open={isToggleActiveAlertOpen} onOpenChange={(open) => {
            setIsToggleActiveAlertOpen(open);
            if (!open) setEmployeeToToggleActive(null);
          }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  {(() => {
                    if (!employeeToToggleActive) return "Loading user information..."; // Fallback if somehow null
                    const isSelf = loggedInUser?.id === employeeToToggleActive.id;
                    const isCurrentlyActive = employeeToToggleActive.isActive;

                    if (isSelf && isCurrentlyActive) {
                      return <>You are about to deactivate your own account (<span className="font-semibold">{employeeToToggleActive.firstName} {employeeToToggleActive.lastName}</span>). This will log you out immediately.</>;
                    } else {
                      return <>You are about to {employeeToToggleActive.isActive ? "deactivate" : "activate"} the user: <span className="font-semibold">{employeeToToggleActive.firstName} {employeeToToggleActive.lastName}</span>.</>;
                    }
                  })()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setEmployeeToToggleActive(null)}>Back</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleToggleActiveState}
                  disabled={isTogglingActiveState}
                  className={employeeToToggleActive.isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                >
                  {isTogglingActiveState ? "Processing..." : (employeeToToggleActive.isActive ? "Deactivate" : "Activate")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
            <p className="text-xs text-muted-foreground">
              All team members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {employees.filter(emp => emp.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Departments</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(employees.map(emp => emp.department)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Different departments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Today</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {employees.filter(emp => isLoggedInToday(emp.lastLogin)).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Logged in today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  debouncedSearch(value);
                }}
                className="pl-10"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <Filter className="mr-2 h-4 w-4" />
                  Filter ({ getActiveFilterCount() })
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">Filters</h4>
                    <p className="text-sm text-muted-foreground">
                      Apply filters to the employee list.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="filter-role">Role</Label>
                      <Select value={filterRole} onValueChange={(value) => setFilterRole(value as UserRole | '')}>
                        <SelectTrigger id="filter-role" className="col-span-2 h-8">
                          <SelectValue placeholder="Any Role" />
                        </SelectTrigger>
                                        <SelectContent>
                  {/* <SelectItem value="">Any Role</SelectItem>  Removed: value="" is not allowed for SelectItem */}
                  <SelectItem key="employee" value="employee">Employee</SelectItem>
                  <SelectItem key="manager" value="manager">Manager</SelectItem>
                  <SelectItem key="administrator" value="administrator">Administrator</SelectItem>
                </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="filter-department">Department</Label>
                      <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                        <SelectTrigger id="filter-department" className="col-span-2 h-8">
                          <SelectValue placeholder="Any Department" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* <SelectItem value="">Any Department</SelectItem> Removed: value="" is not allowed for SelectItem */}
                          {uniqueDepartments.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="ghost" onClick={handleClearFilters}>Clear</Button>
                    <Button onClick={handleApplyFilters}>Apply</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {employees.length} employee{employees.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Use 'employees' directly as backend handles filtering */}
              {employees.map((employee) => {
                return (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src="" />
                        <AvatarFallback>
                          {getInitials(employee.firstName, employee.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {employee.firstName} {employee.lastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {employee.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{employee.department}</TableCell>
                  <TableCell>
                    <Badge className={getRoleColor(employee.role)}>
                      {employee.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.isActive ? "default" : "secondary"}>
                      {employee.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatLastLogin(employee.lastLogin)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {employee.skills.slice(0, 2).map((skill, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {employee.skills.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{employee.skills.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => {
                          setEmployeeToEdit(employee);
                          setIsEditEmployeeDialogOpen(true);
                        }}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={employee.isActive ? "text-red-600 hover:!text-red-600 focus:text-red-600" : "text-green-600 hover:!text-green-600 focus:text-green-600"}
                          onSelect={(e) => {
                            e.preventDefault(); // Prevent DropdownMenu from closing
                            setEmployeeToToggleActive(employee);
                            setIsToggleActiveAlertOpen(true);
                          }}
                        >
                          {employee.isActive ? <PowerOff className="mr-2 h-4 w-4" /> : <Power className="mr-2 h-4 w-4" />}
                          {employee.isActive ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
