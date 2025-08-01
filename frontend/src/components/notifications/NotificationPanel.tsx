import { useEffect, useRef, useState } from 'react'; // Added useState
import { Bell, X, CheckCircle, AlertCircle, Info, AlertTriangle, Loader2 } from 'lucide-react'; // Added Loader2
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationStore } from '@/stores/notificationStore'; // Import notification store
import { AppNotification } from '@/types'; // Import AppNotification type
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'; // For detail view

interface NotificationPanelProps {
  onClose: () => void;
}

export const NotificationPanel = ({ onClose }: NotificationPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    isLoading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    initialFetchAttempted // Get initialFetchAttempted from the store
  } = useNotificationStore();

  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Fetch a full notifications list once when the panel is mounted / opened.
  // We deliberately do NOT include `notifications.length` or `isLoading` in the
  // dependency array to avoid an infinite loop when the server returns an empty
  // list (length stays 0 → re-fetch → length still 0 …).
  useEffect(() => {
    fetchNotifications({ page: 1, limit: 20 });
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const formatTime = (timestamp: string) => { // timestamp is now createdAt
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const handleNotificationClick = (notification: AppNotification) => {
    setSelectedNotification(notification);
    setIsDetailDialogOpen(true);
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  return (
    <>
      <Card
        ref={panelRef}
        className="absolute right-0 top-12 w-80 max-h-[500px] flex flex-col shadow-lg border z-50 bg-white"
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0 flex-grow overflow-hidden">
          <ScrollArea className="h-[calc(500px-100px)]"> {/* Adjust height based on header/footer */}
            {isLoading && notifications.length === 0 && (
              <div className="p-6 text-center text-gray-500 flex flex-col items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-sm">Loading notifications...</p>
              </div>
            )}
            {error && (
              <div className="p-6 text-center text-red-500">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Error: {error}</p>
              </div>
            )}
            {!isLoading && !error && notifications.length === 0 && (
              <div className="p-6 text-center text-gray-500 flex flex-col items-center justify-center h-full">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No new notifications</p>
              </div>
            )}
            {!isLoading && notifications.length > 0 && (
              <div className="space-y-0"> {/* Removed space-y-1 for tighter packing if desired */}
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 border-b hover:bg-gray-100 cursor-pointer ${
                      !notification.isRead ? 'bg-blue-50 font-semibold' : 'bg-white'
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      {getIcon(notification.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm truncate ${!notification.isRead ? 'font-bold' : 'font-medium'}`}>
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0.5">
                              New
                            </Badge>
                          )}
                        </div>
                        <p className={`text-xs mt-1 truncate ${!notification.isRead ? 'text-gray-700' : 'text-gray-600'}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatTime(notification.createdAt)} {/* Use createdAt */}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
        
        {notifications.length > 0 && !isLoading && (
          <div className="p-2 border-t mt-auto"> {/* Ensure footer is at bottom */}
            <Button variant="outline" size="sm" className="w-full" onClick={handleMarkAllRead}>
              Mark all as read
            </Button>
          </div>
        )}
      </Card>

      {/* Notification Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotification && getIcon(selectedNotification.type)}
              {selectedNotification?.title}
            </DialogTitle>
            <DialogDescription>
              Received: {selectedNotification && formatTime(selectedNotification.createdAt)}
              {selectedNotification?.createdAt && selectedNotification?.updatedAt && new Date(selectedNotification.updatedAt) > new Date(selectedNotification.createdAt) &&
                ` (Updated: ${formatTime(selectedNotification.updatedAt)})`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {selectedNotification?.message}
            </p>
            {selectedNotification?.link && (
              <Button variant="link" asChild className="p-0 h-auto">
                <a href={selectedNotification.link} target="_blank" rel="noopener noreferrer">
                  View Details
                </a>
              </Button>
            )}
             {selectedNotification?.payload && Object.keys(selectedNotification.payload).length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs font-semibold text-gray-600 mb-1">Additional Data:</p>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                  {JSON.stringify(selectedNotification.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
