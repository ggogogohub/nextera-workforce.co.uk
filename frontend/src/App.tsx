import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Pages
import Index from "./pages/Index";
import { Dashboard } from "./pages/Dashboard";
import { Schedule } from "./pages/Schedule";
import { TimeOff } from "./pages/TimeOff";
import { Messages } from "./pages/Messages";
import { TeamManagement } from "./pages/TeamManagement";
import { ScheduleManagement } from "./pages/ScheduleManagement";
import { Analytics } from "./pages/Analytics";
import { Reports } from "./pages/Reports";
import { Administration } from "./pages/Administration";
import { Profile } from "./pages/Profile";
import { Login } from "./pages/Login";
import { Unauthorized } from "./pages/Unauthorized";
import { AvailabilityPage } from "./pages/AvailabilityPage"; // Import the new page
import { ConstraintManagement } from "./pages/ConstraintManagement"; // Import the new page
import { Privacy } from "./pages/Privacy"; // Import GDPR Privacy page
import ShiftSwaps from "./pages/ShiftSwaps"; // Import Shift Swaps page
import AuditLogs from "./pages/AuditLogs"; // Import Audit Logs page

// Components
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Auth
import { useAuthStore, initializeSessionManagement } from "@/lib/auth";

const queryClient = new QueryClient();

const App = () => {
  const { isAuthenticated, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
    initializeSessionManagement();
  }, [checkAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            
            {/* Protected Routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              {/* Redirect root to dashboard */}
              <Route index element={<Navigate to="/dashboard" replace />} />
              
              {/* All user roles */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="time-off" element={<TimeOff />} />
              <Route path="messages" element={<Messages />} />
              <Route path="profile" element={<Profile />} />
              <Route path="availability" element={<AvailabilityPage />} /> {/* Add route for AvailabilityPage */}
              <Route path="privacy" element={<Privacy />} /> {/* GDPR Privacy page */}
              <Route path="shift-swaps" element={<ShiftSwaps />} /> {/* Shift Swap functionality */}
              
              {/* Manager and Administrator only */}
              <Route path="team" element={
                <ProtectedRoute allowedRoles={['manager', 'administrator']}>
                  <TeamManagement />
                </ProtectedRoute>
              } />
              <Route path="admin/schedules" element={
                <ProtectedRoute allowedRoles={['manager', 'administrator']}>
                  <ScheduleManagement />
                </ProtectedRoute>
              } />
              <Route path="analytics" element={
                <ProtectedRoute allowedRoles={['manager', 'administrator']}>
                  <Analytics />
                </ProtectedRoute>
              } />
              <Route path="reports" element={
                <ProtectedRoute allowedRoles={['manager', 'administrator']}>
                  <Reports />
                </ProtectedRoute>
              } />
              <Route path="admin/constraints" element={
                <ProtectedRoute allowedRoles={['manager', 'administrator']}>
                  <ConstraintManagement />
                </ProtectedRoute>
              } />
              
              {/* Administrator only */}
              <Route path="admin" element={
                <ProtectedRoute requiredRole="administrator">
                  <Administration />
                </ProtectedRoute>
              } />
              <Route path="admin/audit" element={
                <ProtectedRoute requiredRole="administrator">
                  <AuditLogs />
                </ProtectedRoute>
              } />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
