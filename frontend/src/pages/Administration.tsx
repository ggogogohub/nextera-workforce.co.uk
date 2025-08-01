
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Settings,
  Users,
  Shield,
  Database,
  MapPin,
  Clock,
  Bell,
  Activity,
  Lock,
  FileText,
  Zap,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import LocationManagement from '@/components/admin/LocationManagement';
import AttendanceDashboard from '@/components/manager/AttendanceDashboard';

export const Administration = () => {
  const [activeTab, setActiveTab] = useState("attendance");

  // Premium coming soon component with better UX
  const ComingSoonCard = ({
    icon: Icon,
    title,
    description,
    features,
    status = "planned",
    estimatedRelease
  }: {
    icon: React.ElementType;
    title: string;
    description: string;
    features: string[];
    status?: "planned" | "development" | "testing";
    estimatedRelease?: string;
  }) => (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-transparent opacity-50 rounded-full -translate-y-8 translate-x-8"></div>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </div>
          <Badge variant={status === "development" ? "default" : status === "testing" ? "secondary" : "outline"}>
            {status === "development" ? "In Development" :
              status === "testing" ? "Beta Testing" : "Planned"}
          </Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-gray-900">Planned Features:</h4>
          <ul className="space-y-2">
            {features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {status === "development" && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Development Progress</span>
              <span className="font-medium text-blue-600">65%</span>
            </div>
            <Progress value={65} className="h-2" />
          </div>
        )}

        {estimatedRelease && (
          <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
            <Info className="h-4 w-4" />
            <span>Expected release: {estimatedRelease}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1">
            Request Beta Access
          </Button>
          <Button variant="ghost" size="sm" className="flex-1">
            Get Notified
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Administration</h1>
          <p className="text-gray-600 mt-1 text-lg">
            Comprehensive system administration and workforce management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            System Healthy
          </Badge>
        </div>
      </div>

      {/* Admin Tabs - Responsive Design */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto">
          <TabsList className="grid grid-cols-3 lg:grid-cols-6 min-w-full lg:min-w-0">
            <TabsTrigger key="attendance" value="attendance" className="flex items-center gap-2 min-w-0">
              <Clock className="h-4 w-4 hidden sm:block" />
              <span>Attendance</span>
            </TabsTrigger>
            <TabsTrigger key="locations" value="locations" className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 hidden sm:block" />
              <span>Locations</span>
            </TabsTrigger>
            <TabsTrigger key="users" value="users" className="flex items-center gap-2 min-w-0">
              <Users className="h-4 w-4 hidden sm:block" />
              <span>Users</span>
            </TabsTrigger>
            <TabsTrigger key="security" value="security" className="flex items-center gap-2 min-w-0">
              <Shield className="h-4 w-4 hidden sm:block" />
              <span>Security</span>
            </TabsTrigger>
            <TabsTrigger key="system" value="system" className="flex items-center gap-2 min-w-0">
              <Settings className="h-4 w-4 hidden sm:block" />
              <span>System</span>
            </TabsTrigger>
            <TabsTrigger key="data" value="data" className="flex items-center gap-2 min-w-0">
              <Database className="h-4 w-4 hidden sm:block" />
              <span>Data</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Attendance Management */}
        <TabsContent value="attendance" className="space-y-6">
          <AttendanceDashboard />
        </TabsContent>

        {/* Location Management */}
        <TabsContent value="locations" className="space-y-6">
          <LocationManagement />
        </TabsContent>

        {/* User Management */}
        <TabsContent value="users" className="space-y-6">
          <ComingSoonCard
            icon={Users}
            title="Advanced User Management"
            description="Comprehensive user account management with advanced permissions and role-based access control."
            features={[
              "Role-based permission system",
              "Bulk user operations and imports",
              "Advanced user analytics and reporting",
              "Custom user fields and profiles",
              "Single Sign-On (SSO) integration",
              "User activity monitoring and audit logs"
            ]}
            status="development"
            estimatedRelease="Q2 2025"
          />
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <ComingSoonCard
            icon={Shield}
            title="Enterprise Security Center"
            description="Advanced security features including multi-factor authentication, access controls, and compliance monitoring."
            features={[
              "Multi-factor authentication (MFA)",
              "IP whitelisting and access controls",
              "Security audit logs and reporting",
              "Password policy enforcement",
              "Session management and timeout controls",
              "GDPR and compliance tools"
            ]}
            status="planned"
            estimatedRelease="Q3 2025"
          />
        </TabsContent>

        {/* System Configuration */}
        <TabsContent value="system" className="space-y-6">
          <ComingSoonCard
            icon={Settings}
            title="System Configuration Hub"
            description="Centralized system settings for customizing your workforce management platform."
            features={[
              "Custom branding and theming",
              "Email and notification templates",
              "Timezone and localization settings",
              "Integration with external systems",
              "Automated workflow configuration",
              "Performance monitoring and optimization"
            ]}
            status="testing"
            estimatedRelease="Q1 2025"
          />
        </TabsContent>

        {/* Data Management */}
        <TabsContent value="data" className="space-y-6">
          <ComingSoonCard
            icon={Database}
            title="Data Management Suite"
            description="Powerful tools for data backup, migration, analytics, and compliance management."
            features={[
              "Automated backup and restore",
              "Data export and migration tools",
              "Advanced analytics and reporting",
              "Data retention policy management",
              "Real-time data synchronization",
              "Custom report builder"
            ]}
            status="planned"
            estimatedRelease="Q3 2025"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
