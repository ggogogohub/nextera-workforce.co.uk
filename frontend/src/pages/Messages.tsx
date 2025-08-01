import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, MoreVertical, MessageSquare, Megaphone, Pencil, Trash2, ArrowDown, UserX } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/auth';
import { apiClient } from '@/lib/api';
import { Message as MessageType, User } from '@/types';
import { format, isToday, isYesterday, isSameDay, isThisYear, differenceInSeconds, differenceInMinutes, differenceInCalendarDays } from 'date-fns';

type MongoId = { $oid: string };
type IdLike = string | number | bigint | MongoId;

// ------------------------------------------------------------------
// Helper to safely extract a user's id (fallback to _id) as string
// ------------------------------------------------------------------
const getUserId = (u: Partial<User> & { _id?: IdLike; id?: IdLike }): string => {
  if (typeof u.id === 'string' && u.id) return u.id;
  if (u.id !== undefined && u.id !== null && (typeof u.id === 'number' || typeof u.id === 'bigint')) {
    return String(u.id);
  }
  if (typeof u._id === 'string' && u._id) return u._id;
  if (u._id && typeof u._id === 'object' && '$oid' in u._id && typeof (u._id as MongoId).$oid === 'string') {
    return (u._id as MongoId).$oid;
  }
  return '';
};

// ------------------------------------------------------------------
// Helper to safely get user's full name with proper fallbacks
// ------------------------------------------------------------------
const getUserFullName = (user?: Partial<User> | null): string => {
  if (!user) return "Unknown User";
  
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  
  if (firstName && lastName) return `${firstName} ${lastName}`;
  if (firstName) return firstName;
  if (lastName) return lastName;
  
  return user.email ? user.email.split('@')[0] : "Unknown User";
};

// ------------------------------------------------------------------
// Date helpers – WhatsApp-style day label & relative time
// ------------------------------------------------------------------
const getDayLabel = (date: Date): string => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (differenceInSeconds(new Date(), date) < 7 * 24 * 60 * 60) return format(date, 'EEEE');
  return format(date, 'd MMM yyyy');
};

// For chat bubbles we now always show absolute 12-hour clock (WhatsApp style)
const formatBubbleTime = (date: Date): string => format(date, 'h:mm a');

// ------------------------------------------------------------------
// Timestamp for chat preview rows (left list)
// ------------------------------------------------------------------
const formatPreviewTimestamp = (date: Date): string => {
  const now = new Date();
  const sec = differenceInSeconds(now, date);
  if (sec < 60) return 'Just now';
  const min = differenceInMinutes(now, date);
  if (min < 60 && isToday(date)) return `${min} min`;

  if (isToday(date)) return format(date, 'p'); // 3:45 PM
  if (isYesterday(date)) return 'Yesterday';

  const diffDays = differenceInCalendarDays(now, date);
  if (diffDays < 7) return format(date, 'EEE'); // Mon, Tue

  if (isThisYear(date)) return format(date, 'M/d'); // 6/13
  return format(date, 'M/d/yy');
};

export const Messages = () => {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [announcementMessages, setAnnouncementMessages] = useState<MessageType[]>([]);
  const [selectedChatUser, setSelectedChatUser] = useState<User | null>(null);
  const [chatMessages, setChatMessages] = useState<MessageType[]>([]);
  const [searchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'inbox' | 'announcements'>('inbox');
  const canPostAnnouncement = user?.role === 'manager' || user?.role === 'administrator';
  const [announcementInput, setAnnouncementInput] = useState({ subject: '', content: '' });
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');

  // ------------------------------------------------------------------
  // Inbox sub-tabs
  // ------------------------------------------------------------------
  type InboxTab = 'chats' | 'people';
  const [inboxTab, setInboxTab] = useState<InboxTab>('chats');
  const [allPeople, setAllPeople] = useState<User[]>([]);
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);

  // ------------------------------------------------------------------
  // Infinite-scroll paging state for the selected conversation
  // ------------------------------------------------------------------
  const [chatPage, setChatPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Ref to the scrollable messages container so we can listen to scroll events
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // ------------------------------------------------------------------
  // Ensure no chat is pre-selected when the page mounts
  // ------------------------------------------------------------------
  useEffect(() => {
    setSelectedChatUser(null);
    setChatMessages([]);
    setChatPage(1);
    setTotalPages(1);
  }, []);

  // ------------------------------------------------------------------
  // Fetch colleagues list once and cache it for the session
  // ------------------------------------------------------------------
  const ensurePeopleLoaded = useCallback(async (): Promise<User[]> => {
    if (allPeople.length) return allPeople;
    setIsLoadingPeople(true);
    try {
      const res = await apiClient.getUsers({ limit: 500 });
      if (res.success && res.data) {
        const items = (res.data.items as (Partial<User> & { _id?: IdLike })[])
          .map((u) => ({ ...u, id: getUserId(u) }))
          .filter((u) => u.id && u.id !== user?.id) as User[];
        setAllPeople(items);
        return items;
      }
    } catch (e) {
      console.error('load people', e);
    }
    finally { setIsLoadingPeople(false); }
    return allPeople;
  }, [allPeople, user?.id]);

  // Fetch messages (initial + polling)
  const loadMessages = useCallback(async (page: number = 1) => {
    try {
      const res = await apiClient.getMessages({ page, limit: 100, type: 'direct' });
      if (res.success && res.data) {
        if(page===1){
          setTotalPages(res.data.totalPages ?? 1);
          setChatPage(1);
        }
        // Ensure colleagues list is available (will only fetch once)
        const people = allPeople.length ? allPeople : await ensurePeopleLoaded();

        // Build quick map of userId -> user for enrichment
        const userMap: Record<string, User> = {};
        people.forEach((p) => {
          userMap[p.id] = p;
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = res.data.items.map((m: any) => {
          const normalized: MessageType = {
            ...m,
            id: (m.id ?? m._id ?? '').toString(),
          };

          // Enrich sender if Unknown
          if (
            (!normalized.sender?.firstName || normalized.sender.firstName === 'Unknown') &&
            userMap[normalized.senderId]
          ) {
            normalized.sender = userMap[normalized.senderId];
          }

          // Enrich recipient if Unknown
          if (
            normalized.recipientId &&
            (!normalized.recipient?.firstName || normalized.recipient.firstName === 'Unknown') &&
            userMap[normalized.recipientId]
          ) {
            normalized.recipient = userMap[normalized.recipientId];
          }

          return normalized;
        });

        setMessages(items);
        // If a chat is selected refresh its messages
        if (selectedChatUser) {
          const conv = items.filter((m: MessageType) =>
            (m.senderId === user?.id && m.recipientId === selectedChatUser.id) ||
            (m.senderId === selectedChatUser.id && m.recipientId === user?.id)
          ).sort((a,b)=> new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());

          // Merge with any previously-loaded older messages to avoid losing them on refresh
          setChatMessages(prev=>{
            const combined = [...prev];
            const existingIds = new Set(prev.map(p=>p.id));
            conv.forEach(msg=>{ if(!existingIds.has(msg.id)) combined.push(msg); });
            return combined.sort((a,b)=> new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
          });
        }
      }
    } catch (e) {
      console.error('Failed to load messages', e);
    }
  }, [ensurePeopleLoaded, allPeople, selectedChatUser, user?.id]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await apiClient.getMessages({ limit: 100, type: 'announcement' });
      if (res.success && res.data) {
        // Ensure id normalization
        const items = res.data.items.map((m: Partial<MessageType> & { _id?: unknown }) => ({
          ...m,
          id: (m.id ?? m._id ?? '').toString(),
        }) as MessageType);
        setAnnouncementMessages(items.reverse()); // oldest first for chat
      }
    } catch (e) { console.error('loadAnnouncements', e); }
  }, []);

  // ------------------------------------------------------------------
  // Controlled background polling (single interval across re-renders)
  // ------------------------------------------------------------------
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadMessagesRef = useRef(loadMessages);

  useEffect(() => {
    // Fetch immediately on mount
    loadMessages();
    loadAnnouncements();

    const fetchAll = () => {
      if (document.visibilityState !== 'visible') return;
      loadMessagesRef.current();
      loadAnnouncements();
    };

    // Page/tab visibility handler
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Lazily start interval only when tab is active
        if (!pollingRef.current) {
          pollingRef.current = setInterval(fetchAll, 60000); // 1-min
        }
        // Also trigger an immediate refresh when the tab becomes visible.
        fetchAll();
      } else if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    // Attach listener and kick-off if visible
    document.addEventListener('visibilitychange', handleVisibility);
    if (document.visibilityState === 'visible') {
      pollingRef.current = setInterval(fetchAll, 60000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadMessages, loadAnnouncements]); // stable, interval managed internally

  // Keep chatMessages in sync whenever we receive new messages or change selection
  useEffect(() => {
    if (!selectedChatUser) return;
    const conv = messages
      .filter((m) =>
        (m.senderId === user?.id && m.recipientId === selectedChatUser.id) ||
        (m.senderId === selectedChatUser.id && m.recipientId === user?.id)
      )
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    setChatMessages(conv);
  }, [messages, selectedChatUser, user?.id]);

  // Auto-scroll chat to bottom when new messages arrive
  const chatBottomRef = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Build chat previews – group by the other participant
  const chatMap: Record<string, { message: MessageType; unreadCount: number }> = {};
  
  messages.forEach((msg) => {
    const otherUserId = msg.senderId === user?.id ? msg.recipientId : msg.senderId;
    if (!otherUserId) return;
  
    // Initialize if this is the first message for this user
    if (!chatMap[otherUserId]) {
      chatMap[otherUserId] = { message: msg, unreadCount: 0 };
    }
  
    // Update with the latest message
    if (new Date(msg.sentAt) > new Date(chatMap[otherUserId].message.sentAt)) {
      chatMap[otherUserId].message = msg;
    }
  
    // Increment unread count if the message is unread and sent by the other person
    if (!msg.isRead && msg.senderId === otherUserId) {
      chatMap[otherUserId].unreadCount += 1;
    }
  });
  
  const chatPreviews = Object.values(chatMap)
    .sort((a, b) => new Date(b.message.sentAt).getTime() - new Date(a.message.sentAt).getTime());

  const getInitials = (firstName: string = "U", lastName: string = "") => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      case 'low': return 'bg-gray-500';
      default: return 'bg-blue-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'announcement': return '📢';
      case 'system': return '⚙️';
      case 'emergency': return '🚨';
      default: return '💬';
    }
  };

  // Handle sending a direct message
  const sendDirectMessage = async () => {
    if (!chatInput.trim() || !selectedChatUser) return;
    const tempContent = chatInput;
    setChatInput('');

    // Optimistic update
    const recipId = getUserId(selectedChatUser);
    const tempMsg: MessageType = {
      id: `temp-${Date.now()}`,
      senderId: user!.id,
      sender: user!,
      recipientId: recipId,
      recipient: selectedChatUser,
      departmentId: undefined,
      subject: '',
      content: tempContent,
      type: 'direct',
      priority: 'normal',
      isRead: true,
      sentAt: new Date().toISOString(),
      requiresAcknowledgment: false,
      acknowledgments: []
    } as MessageType;
    setChatMessages(prev => [...prev, tempMsg]);

    try {
      if (!recipId) {
        console.error('Cannot send message – recipientId is empty', selectedChatUser);
        return;
      }

      await apiClient.sendMessage({ subject: '', content: tempContent, recipientId: recipId, type: 'direct', priority: 'normal' });
      loadMessages();
    } catch (e) { console.error('send msg', e); }
  };

  // Handle sending an announcement
  const sendAnnouncement = async () => {
    if (!announcementInput.content) return;
    
    if (editingAnnouncementId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await apiClient.updateMessage(editingAnnouncementId, { subject: announcementInput.subject, content: announcementInput.content } as any);
    } else {
      await apiClient.sendMessage({ subject: announcementInput.subject, content: announcementInput.content, type:'announcement', priority:'normal' });
    }
    
    setAnnouncementInput({ subject:'', content:'' });
    setEditingAnnouncementId(null);
    loadAnnouncements();
  };

  // Handle keyboard events for message input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, isAnnouncement: boolean = false) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isAnnouncement) {
        sendAnnouncement();
      } else {
        sendDirectMessage();
      }
    }
  };

  // -----------------------------------------------------------
  // Load additional (older) pages when user scrolls to the top
  // -----------------------------------------------------------
  const loadOlderMessages = useCallback(async () => {
    if(isLoadingOlder || chatPage >= totalPages) return;
    setIsLoadingOlder(true);
    const nextPage = chatPage + 1;
    try{
      const res = await apiClient.getMessages({ page: nextPage, limit: 100, type:'direct' });
      if(res.success && res.data){
        setTotalPages(res.data.totalPages ?? totalPages);
        // Normalise & filter for current conversation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newItems = res.data.items.map((m:any)=>({ ...m, id:(m.id??m._id??'').toString() })) as MessageType[];
        const conv = newItems.filter((m)=>
          selectedChatUser && (
            (m.senderId===user?.id && m.recipientId===selectedChatUser.id) ||
            (m.senderId===selectedChatUser.id && m.recipientId===user?.id)
          )
        ).sort((a,b)=> new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());

        if(conv.length){
          setChatMessages(prev=>[...conv, ...prev]);
        }
        setChatPage(nextPage);
      }
    }catch(e){ console.error('loadOlderMessages',e);}finally{
      setIsLoadingOlder(false);
    }
  },[isLoadingOlder, chatPage, totalPages, selectedChatUser, user?.id]);

  // ------------------------------------------
  // Scroll handlers to trigger above behaviour
  // ------------------------------------------
  const handleScroll = useCallback(() => {
    if(!messagesContainerRef.current) return;
    const el = messagesContainerRef.current;
    const nearTop = el.scrollTop < 80;
    if(nearTop) loadOlderMessages();

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    setShowScrollToBottom(!nearBottom);
  }, [loadOlderMessages]);

  const scrollToBottom = () => {
    if(messagesContainerRef.current){
      messagesContainerRef.current.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior:'smooth' });
    }
  };

  // Keep ref updated with the latest callback to avoid stale closures in the interval
  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  // When a user is selected, mark their messages as read
  useEffect(() => {
    if (selectedChatUser) {
      const unreadMessageIds = messages
        .filter(m => m.recipientId === user?.id && m.senderId === selectedChatUser.id && !m.isRead)
        .map(m => m.id);
      
      if (unreadMessageIds.length > 0) {
        unreadMessageIds.forEach(id => apiClient.markMessageAsRead(id));
        // Optimistically update the UI
        setMessages(prev => 
          prev.map(m => 
            unreadMessageIds.includes(m.id) ? { ...m, isRead: true } : m
          )
        );
      }
    }
  }, [selectedChatUser, messages, user?.id]);

  return (
    <div className="h-[calc(100vh-10rem)] flex flex-col overflow-hidden min-h-0">
      {/* Tabs */}
      <div className="flex gap-2 pb-2">
        <Button variant={activeTab==='inbox'?'default':'outline'} size="sm" onClick={()=>setActiveTab('inbox')}>Inbox</Button>
        <Button variant={activeTab==='announcements'?'default':'outline'} size="sm" onClick={()=>setActiveTab('announcements')}>Announcements</Button>
      </div>

      {/* Main Grid */}
      <div className={`grid gap-4 flex-1 overflow-hidden min-h-0 ${activeTab==='announcements' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3' }`}>
        {/* Chat list or announcements */}
        <Card className="flex flex-col h-full overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {activeTab==='inbox' ? 'Inbox' : (
                <>
                  <Megaphone className="h-5 w-5"/>
                  Announcements
                </>
              )}
            </CardTitle>
            {activeTab==='inbox' && <CardDescription>{chatPreviews.length} message(s)</CardDescription>}
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
            {activeTab==='inbox' ? (
              <>
                {/* Inbox sub-tabs */}
                <div className="flex gap-1 px-4 pb-2 border-b">
                  <Button variant={inboxTab==='chats'?'default':'ghost'} size="sm" onClick={()=>setInboxTab('chats')}>Chats</Button>
                  <Button variant={inboxTab==='people'?'default':'ghost'} size="sm" onClick={async()=>{setInboxTab('people'); await ensurePeopleLoaded();}}>People</Button>
                </div>
          
                {/* Scrollable list */}
                <div className="space-y-1 flex-1 overflow-y-auto pr-2">
                  {inboxTab==='chats' ? (
                    chatPreviews.length > 0 ? (
                      chatPreviews.map(({ message: preview, unreadCount }) => {
                        let otherUser: User | undefined;
                        const otherUserId = preview.senderId === user?.id ? preview.recipientId : preview.senderId;
                        if (otherUserId) {
                          otherUser = allPeople.find(p => p.id === otherUserId);
                        }

                        // If user not found in allPeople, try to use the embedded object, but mark as potentially deleted/inactive
                        if (!otherUser) {
                          otherUser = (preview.senderId === user?.id ? preview.recipient : preview.sender) as User | undefined;
                          if(!otherUser || !otherUser.id) {
                            otherUser = { 
                                id: otherUserId || `unknown-${preview.id}`,
                                firstName: '(Deleted',
                                lastName: 'User)',
                                isActive: false, // Assume inactive if not found
                            } as User;
                          }
                        }

                        const isUnread = unreadCount > 0;

                        return (
                          <div
                            key={otherUser.id || preview.id}
                            className={`p-4 cursor-pointer hover:bg-gray-50 border-b flex items-center gap-3 ${selectedChatUser && selectedChatUser.id===otherUser.id ? 'bg-blue-100' : ''}`}
                            onClick={() => {
                              setSelectedChatUser(otherUser);
                              // The main useEffect will handle filtering messages for this chat
                            }}
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src=""/>
                              <AvatarFallback>{getInitials(otherUser.firstName, otherUser.lastName)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center">
                                <span className={`font-medium truncate ${isUnread ? 'font-bold' : ''}`}>{getUserFullName(otherUser)}</span>
                                {isUnread ? (
                                  <Badge className="h-5 px-2 text-xs" variant="destructive">{unreadCount}</Badge>
                                ) : (
                                  <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{formatPreviewTimestamp(new Date(preview.sentAt))}</span>
                                )}
                              </div>
                              <p className={`text-xs truncate ${isUnread ? 'text-gray-800 font-semibold' : 'text-gray-600'}`}>{preview.content}</p>
                            </div>
                            {isUnread && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full self-start mt-1"></div>}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>No conversations yet</p>
                        <p className="text-xs mt-1">Start a new conversation from the People tab</p>
                      </div>
                    )
                  ) : (
                    allPeople.length > 0 ? (
                      allPeople.map((person)=>(
                        <div 
                          key={person.id} 
                          className={`p-4 cursor-pointer hover:bg-gray-50 border-b ${selectedChatUser?.id===person.id?'bg-blue-100':''}`} 
                          onClick={()=>{
                            // Normalise otherUser so it definitely contains `id`
                            const normalizedOther = {
                              ...person,
                              id: getUserId(person),
                            } as User;
                            setSelectedChatUser(normalizedOther);
                            const conv = messages.filter(m=> (m.senderId===user?.id && m.recipientId===normalizedOther.id) || (m.senderId===normalizedOther.id && m.recipientId===user?.id)).sort((a,b)=> new Date(a.sentAt).getTime()-new Date(b.sentAt).getTime());
                            setChatMessages(conv);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src=""/>
                              <AvatarFallback>{getInitials(person.firstName, person.lastName)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium truncate">{getUserFullName(person)}</span>
                              {person.department && <p className="text-xs text-gray-500">{person.department}</p>}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>Loading contacts...</p>
                      </div>
                    )
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-2 p-4 min-h-0 max-h-[55vh]">
                {announcementMessages.length > 0 ? (
                  announcementMessages.map(msg=> {
                    const canEdit = msg.senderId === user?.id;
                    const canDelete = canEdit || user?.role === 'administrator';
                    return (
                      <div key={msg.id} className="p-3 rounded-lg shadow-sm border bg-gray-100">
                        <div className="flex justify-between gap-2">
                          <div className="flex-1">
                            {msg.subject && <div className="font-semibold mb-1">{msg.subject}</div>}
                            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                          </div>
                          <div className="flex flex-col items-end whitespace-nowrap pl-2">
                            <span className="text-xs text-gray-500">{format(new Date(msg.sentAt), 'MMM d, yyyy • hh:mm a')}</span>
                            {(canEdit || canDelete) && (
                              <div className="flex gap-1 mt-1">
                                {canEdit && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>{
                                    setEditingAnnouncementId(msg.id);
                                    setAnnouncementInput({ subject: msg.subject, content: msg.content });
                                  }}>
                                    <Pencil className="h-4 w-4"/>
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={()=>setPendingDelete(msg.id)}>
                                    <Trash2 className="h-4 w-4"/>
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <Megaphone className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>No announcements yet</p>
                    {canPostAnnouncement && (
                      <p className="text-xs mt-1">Use the form below to create an announcement</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>

          {activeTab==='announcements' && canPostAnnouncement && (
            <div className="border-t p-4 flex flex-col gap-2">
              <Input placeholder="Subject (optional)" value={announcementInput.subject} onChange={e=>setAnnouncementInput({...announcementInput, subject:e.target.value})} />
              <div className="flex gap-2">
                <Textarea 
                  placeholder="Announcement..." 
                  className="flex-1" 
                  rows={3} 
                  value={announcementInput.content} 
                  onChange={e=>setAnnouncementInput({...announcementInput, content:e.target.value})}
                  onKeyDown={(e) => handleKeyDown(e, true)}
                />
                <Button onClick={sendAnnouncement} className="self-end h-10">
                  {editingAnnouncementId ? 'Update' : <Send className="h-4 w-4"/>}
                </Button>
              </div>
              {editingAnnouncementId && (
                <div className="text-right pr-1">
                  <Button variant="link" size="sm" onClick={()=>{setEditingAnnouncementId(null); setAnnouncementInput({subject:'', content:''});}}>Cancel Edit</Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Details panel only for inbox */}
        {activeTab==='inbox' && (
          <Card className="lg:col-span-2 flex flex-col h-full overflow-hidden">
            {selectedChatUser ? (
              <>
                <CardHeader className="flex-row items-center gap-3 border-b">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src=""/>
                    <AvatarFallback>{getInitials(selectedChatUser.firstName, selectedChatUser.lastName)}</AvatarFallback>
                  </Avatar>
                  <CardTitle className="text-lg">{getUserFullName(selectedChatUser)}</CardTitle>
                </CardHeader>
                <CardContent ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-2 p-4 pb-28 relative min-h-0">
                  {chatMessages.length > 0 ? (
                    chatMessages.map((msg, idx)=> {
                      const date = new Date(msg.sentAt);
                      const showDivider = idx === 0 || !isSameDay(new Date(chatMessages[idx-1].sentAt), date);
                      return (
                        <div key={`${msg.id}-container`}>
                          {showDivider && (
                            <div className="flex justify-center my-4" key={`${msg.id}-divider`}>
                              <span className="bg-gray-300 text-gray-700 text-xs px-3 py-0.5 rounded-full shadow-sm">{getDayLabel(date)}</span>
                            </div>
                          )}
                          <div className={`flex ${msg.senderId===user?.id ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
                            <div className={`inline-block max-w-[70%] px-3 py-2 rounded-lg shadow-sm text-sm whitespace-pre-wrap ${msg.senderId===user?.id ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                              {msg.content}
                              <div className="text-[10px] opacity-70 pt-0.5 text-right">{formatBubbleTime(date)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 py-10">
                      <MessageSquare className="h-12 w-12 mb-2 opacity-20" />
                      <p>No messages yet</p>
                      <p className="text-xs mt-1">Send a message to start the conversation</p>
                    </div>
                  )}
                  <div ref={chatBottomRef} />

                  {/* Floating scroll-to-bottom button */}
                  {showScrollToBottom && (
                    <Button size="icon" variant="secondary" onClick={scrollToBottom} className="absolute bottom-4 right-4 shadow-lg">
                      <ArrowDown className="h-5 w-5" />
                    </Button>
                  )}
                </CardContent>
                
                {selectedChatUser.isActive ? (
                  <div className="p-4 border-t flex gap-2">
                    <Textarea 
                      className="flex-1 resize-none" 
                      rows={1} 
                      placeholder="Type a message..." 
                      value={chatInput} 
                      onChange={e=>setChatInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    <Button onClick={sendDirectMessage}>
                      <Send className="h-4 w-4"/>
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 border-t text-center text-sm text-gray-500 bg-gray-50 flex items-center justify-center gap-2">
                    <UserX className="h-4 w-4" /> This user is inactive and cannot receive new messages.
                  </div>
                )}
              </>
            ) : <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8"><MessageSquare className="h-16 w-16 mb-4 opacity-20" /><h3 className="text-xl font-semibold mb-2">Welcome to Messages</h3><p className="text-center mb-4">Select a chat from the sidebar or start a new conversation</p><Button variant="outline" size="sm" onClick={() => { setInboxTab('people'); ensurePeopleLoaded(); }}>Find someone to message</Button></div>}
          </Card>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open)=>{ if(!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The announcement will be permanently removed for all users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async()=>{
              if(pendingDelete){
                await apiClient.deleteMessage(pendingDelete);
                setPendingDelete(null);
                loadAnnouncements();
              }
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
