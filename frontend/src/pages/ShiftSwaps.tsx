import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { ArrowLeftRight, Calendar, Clock, MapPin, Users, CheckCircle, XCircle, Clock3, Plus, Eye, UserCheck } from 'lucide-react';

interface ShiftSwapRequest {
  _id: string;
  requester_id: string;
  requester_shift_id: string;
  target_employee_id?: string;
  target_shift_id?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  responses: Array<{
    employee_id: string;
    shift_id: string;
    accepted: boolean;
    notes?: string;
    responded_at: string;
  }>;
  final_swap_partner_id?: string;
  final_swap_shift_id?: string;
  created_at: string;
  updated_at?: string;
  expires_at?: string;
  // Added fields for populated data
  requester?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  target_employee?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  requester_shift?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    role: string;
  };
}

interface Schedule {
  _id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  role: string;
  department: string;
  status: string;
}

interface EligiblePartner {
  shift: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    role: string;
    department: string;
  };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    department?: string;
  };
  eligibility: {
    is_eligible: boolean;
    reasons: string[];
    suggestions: Array<{
      type: string;
      message: string;
    }>;
  };
}

const ShiftSwaps: React.FC = () => {
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([]);
  const [mySchedules, setMySchedules] = useState<Schedule[]>([]);
  const [eligiblePartners, setEligiblePartners] = useState<EligiblePartner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPartnersDialogOpen, setIsPartnersDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Schedule | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<EligiblePartner | null>(null);
  const [activeTab, setActiveTab] = useState('my-requests');

  const { user } = useAuthStore();
  const { toast } = useToast();
  const isManager = user?.role === 'manager' || user?.role === 'administrator';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Ensure we always get arrays, even if API fails
      let swapRequestsData: ShiftSwapRequest[] = [];
      let userSchedules: Schedule[] = [];

      try {
        const requestsRes = await apiClient.getShiftSwapRequests({});
        swapRequestsData = Array.isArray(requestsRes) 
          ? requestsRes 
          : (requestsRes?.success && Array.isArray(requestsRes.data) ? requestsRes.data : []);
      } catch (error) {
        console.error('Error loading swap requests:', error);
        swapRequestsData = [];
      }

      try {
        const schedulesRes = await apiClient.getSchedules({
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        });
        
        const schedulesData = schedulesRes?.success && schedulesRes.data?.items ? schedulesRes.data.items : [];
        userSchedules = schedulesData
          .filter((schedule: unknown) => {
            const s = schedule as { employeeId?: string; status?: string; date: string };
            return s.employeeId === user?.id && 
              s.status === 'confirmed' &&
              new Date(s.date) > new Date();
          })
          .map((schedule: unknown) => {
            const s = schedule as { _id?: string; id?: string; [key: string]: unknown };
            return {
              ...s,
              _id: s._id || s.id
            };
          }) as Schedule[];
      } catch (error) {
        console.error('Error loading schedules:', error);
        userSchedules = [];
      }
      
      setSwapRequests(swapRequestsData);
      setMySchedules(userSchedules);
    } catch (error) {
      console.error('Error loading shift swap data:', error);
      setSwapRequests([]);
      setMySchedules([]);
      toast({
        title: "Error",
        description: "Failed to load shift swap data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const findEligiblePartners = async (shift: Schedule) => {
    try {
      setSelectedShift(shift);
      const response = await apiClient.getEligibleSwapPartners(shift._id);
      const partnersData = response?.success && response.data?.eligible_partners 
        ? response.data.eligible_partners 
        : [];
      setEligiblePartners(partnersData);
      setIsPartnersDialogOpen(true);
    } catch (error) {
      console.error('Error finding eligible partners:', error);
      setEligiblePartners([]);
      toast({
        title: "Error",
        description: "Failed to find eligible swap partners",
        variant: "destructive"
      });
    }
  };

  const createSwapRequest = async () => {
    if (!selectedShift || !swapReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for the swap",
        variant: "destructive"
      });
      return;
    }

    try {
      const requestData = {
        requester_shift_id: selectedShift._id,
        target_employee_id: selectedPartner?.employee.id,
        target_shift_id: selectedPartner?.shift.id,
        reason: swapReason.trim()
      };

      await apiClient.createShiftSwapRequest(requestData);
      
      toast({
        title: "Success",
        description: "Shift swap request created successfully"
      });

      // Reset form and close dialogs
      setSwapReason('');
      setSelectedPartner(null);
      setSelectedShift(null);
      setIsCreateDialogOpen(false);
      setIsPartnersDialogOpen(false);
      
      // Reload data
      loadData();
    } catch (error) {
      console.error('Error creating swap request:', error);
      toast({
        title: "Error",
        description: "Failed to create swap request",
        variant: "destructive"
      });
    }
  };

  const respondToSwapRequest = async (requestId: string, accepted: boolean, shiftId?: string, notes?: string) => {
    if (accepted && !shiftId) {
      toast({
        title: "Error",
        description: "Please select a shift to offer in exchange",
        variant: "destructive"
      });
      return;
    }

    try {
      await apiClient.respondToShiftSwapRequest(requestId, {
        employee_id: user?.id || '',
        shift_id: shiftId || '',
        accepted,
        notes
      });

      toast({
        title: "Success",
        description: `Swap request ${accepted ? 'accepted' : 'declined'} successfully`
      });

      loadData();
    } catch (error) {
      console.error('Error responding to swap request:', error);
      toast({
        title: "Error",
        description: "Failed to respond to swap request",
        variant: "destructive"
      });
    }
  };

  const reviewSwapRequest = async (requestId: string, approved: boolean, notes?: string, partnerId?: string, shiftId?: string) => {
    try {
      await apiClient.reviewShiftSwapRequest(requestId, {
        status: approved ? 'approved' : 'rejected',
        review_notes: notes,
        final_swap_partner_id: partnerId,
        final_swap_shift_id: shiftId
      });

      toast({
        title: "Success",
        description: `Swap request ${approved ? 'approved' : 'rejected'} successfully`
      });

      loadData();
    } catch (error) {
      console.error('Error reviewing swap request:', error);
      toast({
        title: "Error",
        description: "Failed to review swap request",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: React.ReactNode }> = {
      pending: { variant: "outline", icon: <Clock3 className="w-3 h-3" /> },
      approved: { variant: "default", icon: <CheckCircle className="w-3 h-3" /> },
      rejected: { variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
      completed: { variant: "default", icon: <CheckCircle className="w-3 h-3" /> },
      cancelled: { variant: "secondary", icon: <XCircle className="w-3 h-3" /> }
    };

    const config = variants[status] || variants.pending;
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (timeString: string) => {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Shift Swaps</h2>
          <p className="text-gray-600 mt-1">Loading shift swap requests...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Shift Swaps</h2>
          <p className="text-gray-600 mt-1">Manage shift exchange requests</p>
        </div>
        
        {!isManager && mySchedules.length > 0 && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Request Swap
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Request Shift Swap</DialogTitle>
                <DialogDescription>
                  Select a shift you'd like to swap and we'll find eligible partners
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="shift">Select Your Shift</Label>
                  <Select onValueChange={(value) => {
                    const shift = mySchedules.find(s => s._id === value);
                    if (shift) setSelectedShift(shift);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a shift to swap" />
                    </SelectTrigger>
                    <SelectContent>
                      {mySchedules.map((schedule) => (
                        <SelectItem key={schedule._id} value={schedule._id}>
                          {formatDate(schedule.date)} • {formatTime(schedule.startTime)}-{formatTime(schedule.endTime)} • {schedule.location}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="reason">Reason for Swap</Label>
                  <Textarea
                    id="reason"
                    placeholder="Please explain why you need to swap this shift..."
                    value={swapReason}
                    onChange={(e) => setSwapReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedShift) {
                      findEligiblePartners(selectedShift);
                    }
                  }}
                  disabled={!selectedShift || !swapReason.trim()}
                >
                  Find Partners
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="my-requests">My Requests</TabsTrigger>
          <TabsTrigger value="available">Available Swaps</TabsTrigger>
          {isManager && <TabsTrigger value="pending-approval">Pending Approval</TabsTrigger>}
        </TabsList>

        <TabsContent value="my-requests" className="space-y-4">
          {(Array.isArray(swapRequests) ? swapRequests : []).filter(req => req.requester_id === user?.id).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <ArrowLeftRight className="w-12 h-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Swap Requests</h3>
                <p className="text-gray-500 mb-4">You haven't created any shift swap requests yet.</p>
                {mySchedules.length > 0 && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Request
                  </Button>
                )}
              </CardContent>
            </Card>
                      ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Array.isArray(swapRequests) ? swapRequests : []).filter(req => req.requester_id === user?.id).map((request) => (
                <Card key={request._id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">
                        Swap Request
                      </CardTitle>
                      {getStatusBadge(request.status)}
                    </div>
                    <CardDescription>
                      Created {formatDate(request.created_at)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {request.requester_shift && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(request.requester_shift.date)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                          <Clock className="w-4 h-4" />
                          {formatTime(request.requester_shift.startTime)}-{formatTime(request.requester_shift.endTime)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4" />
                          {request.requester_shift.location}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Reason:</p>
                      <p className="text-sm text-gray-600">{request.reason}</p>
                    </div>

                    {request.responses.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Responses ({request.responses.length})
                        </p>
                        <div className="space-y-2">
                          {request.responses.slice(0, 2).map((response, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm">
                              {response.accepted ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
                              <span className="text-gray-600">
                                {response.accepted ? 'Accepted' : 'Declined'}
                              </span>
                            </div>
                          ))}
                          {request.responses.length > 2 && (
                            <p className="text-xs text-gray-500">
                              +{request.responses.length - 2} more responses
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {request.status === 'pending' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full">
                            Cancel Request
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Swap Request</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to cancel this shift swap request? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Request</AlertDialogCancel>
                            <AlertDialogAction
                                                          onClick={() => {
                              apiClient.cancelShiftSwapRequest(request._id)
                                .then(() => {
                                  toast({
                                    title: "Success",
                                    description: "Swap request cancelled successfully"
                                  });
                                  loadData();
                                })
                                .catch((error) => {
                                  console.error('Error cancelling request:', error);
                                  toast({
                                    title: "Error",
                                    description: "Failed to cancel request",
                                    variant: "destructive"
                                  });
                                });
                            }}
                            >
                              Cancel Request
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          {(Array.isArray(swapRequests) ? swapRequests : []).filter(req => 
            req.requester_id !== user?.id && 
            req.status === 'pending' &&
            (!req.target_employee_id || req.target_employee_id === user?.id)
          ).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="w-12 h-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Available Swaps</h3>
                <p className="text-gray-500">There are no open shift swap requests available at the moment.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Array.isArray(swapRequests) ? swapRequests : []).filter(req => 
                req.requester_id !== user?.id && 
                req.status === 'pending' &&
                (!req.target_employee_id || req.target_employee_id === user?.id)
              ).map((request) => (
                <Card key={request._id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">
                        Swap Opportunity
                      </CardTitle>
                      {getStatusBadge(request.status)}
                    </div>
                    <CardDescription>
                      From {request.requester?.firstName} {request.requester?.lastName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {request.requester_shift && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm font-medium text-gray-700 mb-2">Available Shift:</p>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(request.requester_shift.date)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                          <Clock className="w-4 h-4" />
                          {formatTime(request.requester_shift.startTime)}-{formatTime(request.requester_shift.endTime)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4" />
                          {request.requester_shift.location}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Reason:</p>
                      <p className="text-sm text-gray-600">{request.reason}</p>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => respondToSwapRequest(request._id, true, mySchedules[0]?._id)}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Accept
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => respondToSwapRequest(request._id, false)}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Decline
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {isManager && (
          <TabsContent value="pending-approval" className="space-y-4">
            {(Array.isArray(swapRequests) ? swapRequests : []).filter(req => req.status === 'pending').length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                  <UserCheck className="w-12 h-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Approvals</h3>
                  <p className="text-gray-500">All shift swap requests have been reviewed.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Array.isArray(swapRequests) ? swapRequests : []).filter(req => req.status === 'pending').map((request) => (
                  <Card key={request._id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">
                          Manager Review Required
                        </CardTitle>
                        {getStatusBadge(request.status)}
                      </div>
                      <CardDescription>
                        From {request.requester?.firstName} {request.requester?.lastName}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {request.requester_shift && (
                        <div className="p-3 bg-amber-50 rounded-lg">
                          <p className="text-sm font-medium text-gray-700 mb-2">Requested Shift:</p>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(request.requester_shift.date)}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                            <Clock className="w-4 h-4" />
                            {formatTime(request.requester_shift.startTime)}-{formatTime(request.requester_shift.endTime)}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin className="w-4 h-4" />
                            {request.requester_shift.location}
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Reason:</p>
                        <p className="text-sm text-gray-600">{request.reason}</p>
                      </div>

                      {request.responses.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-2">
                            Responses ({request.responses.filter(r => r.accepted).length} accepted)
                          </p>
                          <div className="space-y-2">
                            {request.responses.filter(r => r.accepted).slice(0, 2).map((response, index) => (
                              <div key={index} className="flex items-center gap-2 text-sm">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span className="text-gray-600">Available for swap</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className="flex-1"
                          onClick={() => reviewSwapRequest(request._id, true, 'Approved by manager', request.responses[0]?.employee_id, request.responses[0]?.shift_id)}
                          disabled={request.responses.filter(r => r.accepted).length === 0}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => reviewSwapRequest(request._id, false, 'Rejected by manager')}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Eligible Partners Dialog */}
      <Dialog open={isPartnersDialogOpen} onOpenChange={setIsPartnersDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Eligible Swap Partners</DialogTitle>
            <DialogDescription>
              Found {eligiblePartners.length} potential partners for your shift
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {eligiblePartners.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No eligible partners found for this shift.</p>
                <p className="text-sm text-gray-500 mt-2">You can still create an open request that all employees can see.</p>
              </div>
            ) : (
              eligiblePartners.map((partner, index) => (
                <Card 
                  key={index} 
                  className={`cursor-pointer transition-all ${selectedPartner === partner ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'}`}
                  onClick={() => setSelectedPartner(partner)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium">{partner.employee.firstName} {partner.employee.lastName}</h4>
                        <p className="text-sm text-gray-600">{partner.employee.department}</p>
                      </div>
                      {partner.eligibility.is_eligible ? (
                        <Badge variant="default">Eligible</Badge>
                      ) : (
                        <Badge variant="destructive">Not Eligible</Badge>
                      )}
                    </div>
                    
                    <div className="p-3 bg-gray-50 rounded-lg mb-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(partner.shift.date)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Clock className="w-4 h-4" />
                        {formatTime(partner.shift.startTime)}-{formatTime(partner.shift.endTime)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        {partner.shift.location}
                      </div>
                    </div>

                    {partner.eligibility.reasons.length > 0 && (
                      <div className="space-y-1">
                        {partner.eligibility.reasons.map((reason, idx) => (
                          <p key={idx} className="text-xs text-red-600">{reason}</p>
                        ))}
                      </div>
                    )}

                    {partner.eligibility.suggestions.length > 0 && (
                      <div className="space-y-1">
                        {partner.eligibility.suggestions.map((suggestion, idx) => (
                          <p key={idx} className="text-xs text-amber-600">{suggestion.message}</p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPartnersDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={createSwapRequest}
              disabled={!swapReason.trim()}
            >
              {selectedPartner ? 'Request Swap with Partner' : 'Create Open Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShiftSwaps; 