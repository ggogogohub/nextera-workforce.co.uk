import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Schedule as ScheduleType } from '@/types';

interface ShiftCardProps {
  schedule: ScheduleType;
  onClick: () => void;
}

const getInitials = (firstName: string = "U", lastName: string = "") => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};





export const ShiftCard = ({ schedule, onClick }: ShiftCardProps) => {
  const { employee, startTime, endTime, employeeId } = schedule;

  // Create a more meaningful fallback name
  const employeeName = employee
    ? `${employee.firstName} ${employee.lastName}`
    : `Employee ${employeeId?.slice(-4) || 'Unknown'}`;

  return (
    <Card
      className="cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200 border-border bg-card/80 backdrop-blur-sm hover:bg-card group"
      onClick={onClick}
    >
      <CardContent className="p-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Avatar className="h-6 w-6 ring-2 ring-background shadow-sm">
            <AvatarImage src="" alt={employeeName} />
            <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
              {getInitials(employee?.firstName, employee?.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-xs text-card-foreground truncate group-hover:text-primary transition-colors" title={employeeName}>
              {employeeName}
            </p>
          </div>
        </div>

        <div className="text-xs font-medium text-muted-foreground bg-muted rounded-md px-2 py-1 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          {startTime}-{endTime}
        </div>
      </CardContent>
    </Card>
  );
};