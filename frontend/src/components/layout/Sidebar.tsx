import { Link, useLocation } from 'react-router-dom';
import { 
  Calendar, 
  Users, 
  Clock, 
  BarChart3, 
  Settings, 
  MessageSquare,
  Home,
  UserCheck,
  FileText,
  CalendarCheck, // Import new icon for Availability
  SlidersHorizontal, // Import new icon for Constraints
  Shield, // Import for Privacy page
  ArrowLeftRight, // Import for Shift Swaps
  Activity, // Import for Audit Logs
  LucideProps
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth';
import { UserRole } from '@/types';

interface SidebarProps {
  isCollapsed?: boolean;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<LucideProps>; // Use LucideProps
  roles: UserRole[];
  badge?: string;
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    roles: ['employee', 'manager', 'administrator'],
  },
  {
    title: 'My Schedule',
    href: '/schedule',
    icon: Calendar,
    roles: ['employee', 'manager', 'administrator'],
  },
  {
    title: 'Time Off',
    href: '/time-off',
    icon: Clock,
    roles: ['employee', 'manager', 'administrator'],
  },
  {
    title: 'Availability',
    href: '/availability',
    icon: CalendarCheck, // Changed icon to CalendarCheck
    roles: ['employee', 'manager', 'administrator'],
  },
  {
    title: 'Shift Swaps',
    href: '/shift-swaps',
    icon: ArrowLeftRight,
    roles: ['employee', 'manager', 'administrator'],
  },
  {
    title: 'Messages',
    href: '/messages',
    icon: MessageSquare,
    roles: ['employee', 'manager', 'administrator'],
  },
  {
    title: 'Privacy & Data',
    href: '/privacy',
    icon: Shield,
    roles: ['employee', 'manager', 'administrator'],
  },
  {
    title: 'Team Management',
    href: '/team',
    icon: Users,
    roles: ['manager', 'administrator'],
  },
  {
    title: 'Schedule Management',
    href: '/admin/schedules',
    icon: UserCheck,
    roles: ['manager', 'administrator'],
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    roles: ['manager', 'administrator'],
  },
  {
    title: 'Reports',
    href: '/reports',
    icon: FileText,
    roles: ['manager', 'administrator'],
  },
  {
    title: 'Constraints',
    href: '/admin/constraints',
    icon: SlidersHorizontal,
    roles: ['manager', 'administrator'],
  },
  {
    title: 'Administration',
    href: '/admin',
    icon: Settings,
    roles: ['administrator'],
  },
  {
    title: 'Audit Logs',
    href: '/admin/audit',
    icon: Activity,
    roles: ['administrator'],
  },
];

export const Sidebar = ({ isCollapsed = false }: SidebarProps) => {
  const location = useLocation();
  const { user } = useAuthStore();

  const filteredNavItems = navItems.filter(item => 
    user && item.roles.includes(user.role)
  );

  return (
    <aside className={cn(
      "bg-gray-900 text-white transition-all duration-300 flex flex-col",
      isCollapsed ? "w-16" : "w-64"
    )}>
      <nav className="flex-1 p-4 space-y-2">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive 
                  ? "bg-blue-600 text-white" 
                  : "text-gray-300 hover:bg-gray-800 hover:text-white",
                isCollapsed && "justify-center"
              )}
              title={isCollapsed ? item.title : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && (
                <div className="flex items-center justify-between flex-1">
                  <span>{item.title}</span>
                  {item.badge && (
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {!isCollapsed && (
        <div className="p-4 border-t border-gray-800">
          <div className="text-xs text-gray-400">
            NextEra Workforce v{import.meta.env.VITE_APP_VERSION || '1.0.0'}
          </div>
        </div>
      )}
    </aside>
  );
};
