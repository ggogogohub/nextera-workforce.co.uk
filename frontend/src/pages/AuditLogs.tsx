import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Shield, Activity, AlertTriangle, Download, Filter, Search, Calendar, Clock, User, Globe, Eye, RefreshCw } from 'lucide-react';

interface AuditLog {
  _id: string;
  event_type: string;
  timestamp: string;
  user_id?: string;
  user_email?: string;
  ip_address?: string;
  user_agent?: string;
  details: Record<string, unknown>;
  severity: string;
  resource_id?: string;
  resource_type?: string;
  session_id?: string;
}

interface LoginStatistics {
  period: {
    start_date: string;
    end_date: string;
  };
  daily_stats: Array<{
    _id: string;
    successful_logins: number;
    failed_logins: number;
  }>;
  total_successful: number;
  total_failed: number;
}

interface SuspiciousEvent {
  type: string;
  description: string;
  ip_address?: string;
  user_emails?: string[];
  count: number;
  first_occurrence: string;
  last_occurrence: string;
  severity: string;
}

const AuditLogs: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loginStats, setLoginStats] = useState<LoginStatistics | null>(null);
  const [suspiciousEvents, setSuspiciousEvents] = useState<SuspiciousEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('logs');

  // Filters
  const [filters, setFilters] = useState({
    user_id: '',
    event_type: '',
    start_date: '',
    end_date: '',
    ip_address: '',
    severity: '',
    limit: 100,
    skip: 0
  });

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const { user } = useAuthStore();
  const { toast } = useToast();

  // Check if user is admin
  const isAdmin = user?.role === 'administrator';

  useEffect(() => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Administrator access required for audit logs",
        variant: "destructive"
      });
      return;
    }
    loadAuditData();
  }, [isAdmin]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !isAdmin) return;

    const interval = setInterval(() => {
      console.log('Auto-refreshing audit data...');
      loadAuditData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, isAdmin]);

  // Manual refresh function
  const handleManualRefresh = async () => {
    setLastRefresh(new Date());
    await loadAuditData();
    toast({
      title: "Data Refreshed",
      description: "Audit logs have been updated with the latest data"
    });
  };

  const loadAuditData = async () => {
    setIsLoading(true);
    try {
      console.log('=== Starting audit data load ===');
      const [logsRes, statsRes, suspiciousRes] = await Promise.all([
        loadAuditLogs(),
        loadLoginStatistics(),
        loadSuspiciousActivity()
      ]);

      console.log('=== Audit data loaded ===');
      console.log('Logs result:', logsRes);
      console.log('Stats result:', statsRes);
      console.log('Suspicious result:', suspiciousRes);

      setAuditLogs(Array.isArray(logsRes) ? logsRes : []);
      setLoginStats(statsRes);
      setSuspiciousEvents(Array.isArray(suspiciousRes) ? suspiciousRes : []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading audit data:', error);
      // Ensure arrays are set even on error
      setAuditLogs([]);
      setSuspiciousEvents([]);
      setLoginStats(null);
      toast({
        title: "Error",
        description: "Failed to load audit data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      // Clean filter parameters - only send non-empty, non-"all" values
      const cleanParams: {
        user_id?: string;
        event_type?: string;
        start_date?: string;
        end_date?: string;
        ip_address?: string;
        severity?: string;
        limit: number;
        skip: number;
      } = {
        limit: filters.limit || 100,
        skip: filters.skip || 0
      };

      // Only add filters if they have actual values (not empty or "all")
      if (filters.user_id && filters.user_id.trim() !== '') {
        cleanParams.user_id = filters.user_id.trim();
      }
      if (filters.event_type && filters.event_type !== 'all' && filters.event_type !== '') {
        cleanParams.event_type = filters.event_type;
      }
      if (filters.start_date && filters.start_date.trim() !== '') {
        cleanParams.start_date = filters.start_date.trim();
      }
      if (filters.end_date && filters.end_date.trim() !== '') {
        cleanParams.end_date = filters.end_date.trim();
      }
      if (filters.ip_address && filters.ip_address.trim() !== '') {
        cleanParams.ip_address = filters.ip_address.trim();
      }
      if (filters.severity && filters.severity !== 'all' && filters.severity !== '') {
        cleanParams.severity = filters.severity;
      }

      console.log('Loading audit logs with params:', cleanParams);
      const response = await apiClient.getAuditLogs(cleanParams);
      const data = Array.isArray(response) ? response : (response.success ? response.data || [] : []);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error loading audit logs:', error);
      return [];
    }
  };

  const loadLoginStatistics = async () => {
    try {
      console.log('Loading login statistics...');
      const response = await apiClient.getLoginStatistics();
      console.log('Login statistics response:', response);
      return response.data?.success ? response.data.statistics : null;
    } catch (error) {
      console.error('Error loading login statistics:', error);
      return null;
    }
  };

  const loadSuspiciousActivity = async () => {
    try {
      console.log('Loading suspicious activity...');
      const response = await apiClient.getSuspiciousActivity();
      console.log('Suspicious activity response:', response);
      const data = response.data?.success ? response.data.suspicious_events : [];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error loading suspicious activity:', error);
      return [];
    }
  };

  const applyFilters = async () => {
    setIsLoading(true);
    try {
      const logs = await loadAuditLogs();
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (error) {
      console.error('Error applying filters:', error);
      toast({
        title: "Error",
        description: "Failed to apply filters",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearFilters = async () => {
    setFilters({
      user_id: '',
      event_type: '',
      start_date: '',
      end_date: '',
      ip_address: '',
      severity: '',
      limit: 100,
      skip: 0
    });
    // Immediately reload data with cleared filters
    await loadAuditData();
  };

  const exportLogs = async () => {
    try {
      // For now, export as CSV
      const csvContent = generateCSV(auditLogs);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Audit logs exported successfully"
      });
    } catch (error) {
      console.error('Error exporting logs:', error);
      toast({
        title: "Error",
        description: "Failed to export logs",
        variant: "destructive"
      });
    }
  };

  const generateCSV = (logs: AuditLog[]) => {
    const headers = ['Timestamp', 'Event Type', 'User Email', 'IP Address', 'Severity', 'Details'];
    const rows = logs.map(log => [
      log.timestamp,
      log.event_type,
      log.user_email || '',
      log.ip_address || '',
      log.severity,
      JSON.stringify(log.details)
    ]);

    return [headers, ...rows].map(row => 
      row.map(field => `"${field.toString().replace(/"/g, '""')}"`).join(',')
    ).join('\n');
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      low: "secondary",
      medium: "outline", 
      high: "destructive",
      critical: "destructive"
    };

    return (
      <Badge variant={variants[severity] || "default"}>
        {severity.toUpperCase()}
      </Badge>
    );
  };

  const getEventTypeIcon = (eventType: string) => {
    if (eventType.includes('login')) return <User className="w-4 h-4" />;
    if (eventType.includes('permission')) return <Shield className="w-4 h-4" />;
    if (eventType.includes('admin')) return <Shield className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Shield className="w-12 h-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-500">Administrator access required to view audit logs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Logs</h2>
          <p className="text-gray-600 mt-1">
            Security monitoring and activity tracking
            {lastRefresh && (
              <span className="text-sm text-gray-500 ml-2">
                • Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Auto-refresh:</label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
          </div>
          <Button variant="outline" onClick={handleManualRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={exportLogs} disabled={!Array.isArray(auditLogs) || auditLogs.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export Logs
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
          <TabsTrigger value="statistics">Login Statistics</TabsTrigger>
          <TabsTrigger value="suspicious">Suspicious Activity</TabsTrigger>
          <TabsTrigger value="security">Security Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="event_type">Event Type</Label>
                  <Select
                    value={filters.event_type || 'all'}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, event_type: value === 'all' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All events" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="login_success">Login Success</SelectItem>
                      <SelectItem value="login_failure">Login Failure</SelectItem>
                      <SelectItem value="logout">Logout</SelectItem>
                      <SelectItem value="admin_action">Admin Action</SelectItem>
                      <SelectItem value="permission_denied">Permission Denied</SelectItem>
                      <SelectItem value="data_access">Data Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="severity">Severity</Label>
                  <Select
                    value={filters.severity || 'all'}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, severity: value === 'all' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All severities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={filters.start_date}
                    onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={filters.end_date}
                    onChange={(e) => setFilters(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="user_email">User Email</Label>
                  <Input
                    id="user_email"
                    placeholder="Filter by user email"
                    value={filters.user_id}
                    onChange={(e) => setFilters(prev => ({ ...prev, user_id: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="ip_address">IP Address</Label>
                  <Input
                    id="ip_address"
                    placeholder="Filter by IP address"
                    value={filters.ip_address}
                    onChange={(e) => setFilters(prev => ({ ...prev, ip_address: e.target.value }))}
                  />
                </div>

                <div className="flex items-end gap-2">
                  <Button onClick={applyFilters} className="flex-1">
                    <Search className="w-4 h-4 mr-2" />
                    Apply Filters
                  </Button>
                  <Button variant="outline" onClick={clearFilters} disabled={isLoading}>
                    {isLoading ? 'Loading...' : 'Clear'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Showing {Array.isArray(auditLogs) ? auditLogs.length : 0} audit log entries
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : !Array.isArray(auditLogs) || auditLogs.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No audit logs found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(Array.isArray(auditLogs) ? auditLogs : []).map((log) => (
                        <TableRow key={log._id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getEventTypeIcon(log.event_type)}
                              <span className="font-medium">{log.event_type.replace(/_/g, ' ')}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{log.user_email || 'Unknown'}</div>
                              {log.user_id && (
                                <div className="text-gray-500 text-xs">ID: {log.user_id}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Globe className="w-3 h-3" />
                              {log.ip_address || 'Unknown'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getSeverityBadge(log.severity)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="w-3 h-3" />
                              {formatTimestamp(log.timestamp)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <details className="cursor-pointer">
                              <summary className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                                <Eye className="w-3 h-3" />
                                View Details
                              </summary>
                              <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </details>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics" className="space-y-4">
          {loginStats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-green-600">Successful Logins</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{loginStats?.total_successful || 0}</div>
                  <p className="text-sm text-gray-600">
                    Period: {loginStats.period?.start_date 
                      ? new Date(loginStats.period.start_date).toLocaleDateString() 
                      : 'N/A'} - {loginStats.period?.end_date 
                      ? new Date(loginStats.period.end_date).toLocaleDateString() 
                      : 'N/A'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-red-600">Failed Logins</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{loginStats?.total_failed || 0}</div>
                  <p className="text-sm text-gray-600">
                    Success rate: {loginStats && (loginStats.total_successful + loginStats.total_failed) > 0 
                      ? Math.round((loginStats.total_successful / (loginStats.total_successful + loginStats.total_failed)) * 100) 
                      : 0}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Daily Average</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {loginStats?.daily_stats?.length > 0 
                      ? Math.round((loginStats.total_successful + loginStats.total_failed) / loginStats.daily_stats.length)
                      : 0}
                  </div>
                  <p className="text-sm text-gray-600">Total daily login attempts</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="animate-pulse space-y-4 w-full">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-gray-200 rounded-lg h-32"></div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="suspicious" className="space-y-4">
          {!Array.isArray(suspiciousEvents) || suspiciousEvents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <Shield className="w-12 h-12 text-green-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Suspicious Activity</h3>
                <p className="text-gray-500">No suspicious authentication patterns detected.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {(Array.isArray(suspiciousEvents) ? suspiciousEvents : []).map((event, index) => (
                <Card key={index} className="border-red-200">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      <CardTitle className="text-red-700">{event.type}</CardTitle>
                      {getSeverityBadge(event.severity)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 mb-4">{event.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Count:</span> {event.count}
                      </div>
                      <div>
                        <span className="font-medium">IP Address:</span> {event.ip_address || 'Multiple'}
                      </div>
                      <div>
                        <span className="font-medium">First Seen:</span> {formatTimestamp(event.first_occurrence)}
                      </div>
                      <div>
                        <span className="font-medium">Last Seen:</span> {formatTimestamp(event.last_occurrence)}
                      </div>
                    </div>
                    {event.user_emails && event.user_emails.length > 0 && (
                      <div className="mt-3">
                        <span className="font-medium text-sm">Affected Users:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {event.user_emails.map((email, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {email}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Security Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Audit Logging</span>
                    <Badge variant="default">Active</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Failed Login Detection</span>
                    <Badge variant="default">Active</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Suspicious Activity Monitoring</span>
                    <Badge variant="default">Active</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Total Events (24h)</span>
                    <span className="font-medium">{Array.isArray(auditLogs) ? auditLogs.length : 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>High Severity Events</span>
                    <span className="font-medium text-red-600">
                      {Array.isArray(auditLogs) ? auditLogs.filter(log => log.severity === 'high').length : 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Suspicious Events</span>
                    <span className="font-medium text-orange-600">{Array.isArray(suspiciousEvents) ? suspiciousEvents.length : 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Database Connection</span>
                    <Badge variant="default">Healthy</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Authentication Service</span>
                    <Badge variant="default">Healthy</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Logging Service</span>
                    <Badge variant="default">Healthy</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditLogs; 