import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Calendar, Clock, User, CheckCircle, XCircle, AlertCircle, MinusCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'; // Added DialogFooter
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
} from "@/components/ui/alert-dialog"; // Added AlertDialog imports
import { TimeOffRequestForm } from '@/components/forms/TimeOffRequestForm';
import { useAuthStore } from '@/lib/auth';
import { apiClient } from '@/lib/api'; // Import apiClient
import { TimeOffRequest, TimeOffFormData } from '@/types';
import { useToast } from '@/hooks/use-toast';

export const TimeOff = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(searchParams.get("new") === "1");
  const [isCancelAlertOpen, setIsCancelAlertOpen] = useState(false);
  const [requestToCancelId, setRequestToCancelId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedRequestDetails, setSelectedRequestDetails] = useState<TimeOffRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTimeOffRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getTimeOffRequests(); // Fetch real data
      if (response.success && response.data && response.data.items) {
        // response.data.items is typed as TimeOffRequest[] by apiClient.
        // If item.id is undefined, it means the backend data (despite Pydantic alias)
        // or apiClient isn't correctly providing 'id'.
        const formattedRequests = response.data.items.map((item) => {
          // Explicitly cast item to include a potential _id field for the mapping logic
          const rawItem = item as TimeOffRequest & { _id?: string };
          return {
            ...rawItem, // Spread all properties from rawItem
            id: rawItem.id || rawItem._id!, // Use existing id, or _id (asserting _id exists if id doesn't)
          } as TimeOffRequest; // Assert the final object conforms to TimeOffRequest
        });
        setRequests(formattedRequests);
      } else {
        console.error('Failed to load time-off requests:', response.message || 'No data returned');
        setRequests([]); // Clear requests on failure or no data
      }
    } catch (error) {
      console.error('Error fetching time-off requests:', error);
      toast({
        title: "Error",
        description: "Failed to load your time-off requests.",
        variant: "destructive",
      });
      setRequests([]); // Clear requests on error
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTimeOffRequests();
  }, [loadTimeOffRequests]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'cancelled':
        return <MinusCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-gray-200 text-gray-700'; // Style for cancelled
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'vacation': return 'bg-blue-100 text-blue-800';
      case 'sick': return 'bg-red-100 text-red-800';
      case 'personal': return 'bg-purple-100 text-purple-800';
      case 'emergency': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleFormSubmit = async (formData: TimeOffFormData) => {
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      
      const response = await apiClient.createTimeOffRequest(formData);
      
      if (response.success) {
        toast({
          title: "Success",
          description: "Your time-off request has been submitted successfully and is pending approval.",
        });
        
        setIsFormOpen(false);
        navigate("/time-off", { replace: true }); // Remove ?new=1 from URL
        await loadTimeOffRequests(); // Reload the list to show the new request
      } else {
        throw new Error(response.message || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Failed to submit time-off request:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit your time-off request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pendingRequests = requests.filter(req => req.status === 'pending');
  const approvedRequests = requests.filter(req => req.status === 'approved');
  const totalDaysRequested = requests.reduce((sum, req) => sum + req.totalDays, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Off Requests</h1>
          <p className="text-gray-600 mt-1">
            Manage your time-off requests and view your balance
          </p>
        </div>
        
        <Dialog open={isFormOpen} onOpenChange={(open)=>{
            setIsFormOpen(open);
            if(!open){navigate("/time-off",{replace:true});}
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Submit Time-Off Request</DialogTitle>
              <DialogDescription>
                Fill out the form below to request time off
              </DialogDescription>
            </DialogHeader>
            <TimeOffRequestForm 
              onSubmit={handleFormSubmit} 
              isSubmitting={isSubmitting} 
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* View Details Dialog */}
      {selectedRequestDetails && (
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Time Off Request Details</DialogTitle>
              <DialogDescription>
                Details for your time off request from {formatDate(selectedRequestDetails.startDate)} to {formatDate(selectedRequestDetails.endDate)}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Employee:</span>
                <span className="text-sm font-medium">{selectedRequestDetails.employee?.firstName} {selectedRequestDetails.employee?.lastName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Type:</span>
                <Badge className={getTypeColor(selectedRequestDetails.type)}>{selectedRequestDetails.type}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge className={getStatusColor(selectedRequestDetails.status)}>{selectedRequestDetails.status}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Reason:</span>
                <span className="text-sm font-medium text-right max-w-[70%] truncate" title={selectedRequestDetails.reason}>{selectedRequestDetails.reason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Days:</span>
                <span className="text-sm font-medium">{selectedRequestDetails.totalDays}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Submitted:</span>
                <span className="text-sm font-medium">{formatDate(selectedRequestDetails.submittedAt)}</span>
              </div>
              {selectedRequestDetails.reviewedAt && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Reviewed:</span>
                  <span className="text-sm font-medium">{formatDate(selectedRequestDetails.reviewedAt)}</span>
                </div>
              )}
              {selectedRequestDetails.reviewerNotes && (
                <div>
                  <span className="text-sm text-muted-foreground">Reviewer Notes:</span>
                  <p className="text-sm font-medium bg-gray-50 p-2 rounded mt-1">{selectedRequestDetails.reviewerNotes}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">18</div>
            <p className="text-xs text-muted-foreground">
              Days remaining
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved This Year</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedRequests.length}</div>
            <p className="text-xs text-muted-foreground">
              Total approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Days Used</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDaysRequested}</div>
            <p className="text-xs text-muted-foreground">
              Total requested
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Requests List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Requests</CardTitle>
          <CardDescription>
            All your time-off requests and their current status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length > 0 ? (
            <div className="space-y-4">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-start gap-4">
                    {getStatusIcon(request.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium">
                          {formatDate(request.startDate)}
                          {request.startDate !== request.endDate && 
                            ` - ${formatDate(request.endDate)}`
                          }
                        </h3>
                        <Badge className={getTypeColor(request.type)}>
                          {request.type}
                        </Badge>
                        <Badge className={getStatusColor(request.status)}>
                          {request.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        {request.reason}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{request.totalDays} day(s)</span>
                        <span>Submitted {formatDate(request.submittedAt)}</span>
                        {request.reviewedAt && (
                          <span>Reviewed {formatDate(request.reviewedAt)}</span>
                        )}
                      </div>
                      {request.reviewerNotes && (
                        <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                          <strong>Note:</strong> {request.reviewerNotes}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {request.status === 'pending' && (
                      <AlertDialog open={isCancelAlertOpen && requestToCancelId === request.id} onOpenChange={(open) => {
                        if (!open) setRequestToCancelId(null); // Clear target on close
                        setIsCancelAlertOpen(open);
                      }}>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setRequestToCancelId(request.id);
                              setIsCancelAlertOpen(true);
                            }}
                          >
                            Cancel
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently cancel your time off request.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => { setRequestToCancelId(null); setIsCancelAlertOpen(false); }}>Back</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={isCancelling} // Disable button while processing
                              onClick={async () => {
                                if (requestToCancelId) {
                                  setIsCancelling(true);
                                  try {
                                    await apiClient.cancelTimeOffRequest(requestToCancelId);
                                    // TODO: Add success toast
                                    
                                    // Rely solely on fetching the updated list
                                    await loadTimeOffRequests();
                                    
                                  } catch (error) {
                                    console.error(`Failed to cancel request ${requestToCancelId}:`, error);
                                    // TODO: Add error toast
                                  } finally {
                                    setIsCancelling(false);
                                    setIsCancelAlertOpen(false); // Close dialog
                                    setRequestToCancelId(null); // Clear target
                                  }
                                } else {
                                  console.error("No requestToCancelId set.");
                                  setIsCancelAlertOpen(false); // Close dialog if no ID
                                }
                              }}
                            >
                              {isCancelling ? "Cancelling..." : "Confirm Cancellation"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedRequestDetails(request);
                        setIsDetailsDialogOpen(true);
                      }}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No time-off requests yet
              </h3>
              <p className="text-gray-500 mb-4">
                Submit your first time-off request to get started.
              </p>
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Request
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
