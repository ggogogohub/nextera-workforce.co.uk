import { useState, useEffect } from 'react';
import { User as UserIcon, Mail, Phone, MapPin, Calendar, Edit, Save, X } from 'lucide-react'; // Renamed User from lucide to UserIcon
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// Textarea is not used, can be removed if not planned
// import { Textarea } from '@/components/ui/textarea'; 
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { AvailabilityPattern, User as UserType } from '@/types'; // User aliased to UserType

// Define the order and names for displaying days, mapping to backend dayOfWeek (0=Sun, 1=Mon, ...)
const displayDaysConfig = [
  { name: "Monday", dayOfWeekValue: 1 },
  { name: "Tuesday", dayOfWeekValue: 2 },
  { name: "Wednesday", dayOfWeekValue: 3 },
  { name: "Thursday", dayOfWeekValue: 4 },
  { name: "Friday", dayOfWeekValue: 5 },
  { name: "Saturday", dayOfWeekValue: 6 },
  { name: "Sunday", dayOfWeekValue: 0 },
];

export const Profile = () => {
  const { user, updateProfile } = useAuthStore();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    department: '',
    skills: [] as string[],
    emergencyContact: {
      name: '',
      relationship: '',
      phoneNumber: '',
    },
  });
  const [editableAvailability, setEditableAvailability] = useState<AvailabilityPattern[]>([]);

  const initializeProfileAndAvailability = () => {
    if (user) {
      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        department: user.department || '',
        skills: user.skills || [],
        emergencyContact: user.emergencyContact || { name: '', relationship: '', phoneNumber: '' },
      });

      const backendAvailability = user.availability && user.availability.length > 0 ? user.availability : [];
      const newEditableAvailability = displayDaysConfig.map(configDay => {
        const existingAvail = backendAvailability.find(ba => ba.dayOfWeek === configDay.dayOfWeekValue);
        return existingAvail || {
          dayOfWeek: configDay.dayOfWeekValue,
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: configDay.dayOfWeekValue >= 1 && configDay.dayOfWeekValue <= 5
        };
      });
      setEditableAvailability(newEditableAvailability);
    } else {
       setEditableAvailability(displayDaysConfig.map(configDay => ({
        dayOfWeek: configDay.dayOfWeekValue,
        startTime: '09:00',
        endTime: '17:00',
        isAvailable: configDay.dayOfWeekValue >= 1 && configDay.dayOfWeekValue <= 5,
      })));
    }
  };

  useEffect(() => {
    initializeProfileAndAvailability();
  }, [user]);

  const handleSave = async () => {
    try {
      const payloadToUpdate: Partial<UserType> = { // Use UserType here
        ...profileData,
        availability: editableAvailability,
      };
      await updateProfile(payloadToUpdate);
      setIsEditing(false);
      toast({
        title: 'Profile updated',
        description: 'Your profile has been successfully updated.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update profile. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    if (user) {
      initializeProfileAndAvailability(); // Just re-initialize
    }
    setIsEditing(false);
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName || !lastName) return 'U';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getRoleColor = (role?: UserType['role']) => {
    switch (role) {
      case 'administrator': return 'bg-red-500';
      case 'manager': return 'bg-blue-500';
      case 'employee': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };
  
  // Handler for availability changes within Profile.tsx
  const handleAvailabilityDayChange = (dayIndex: number, field: keyof AvailabilityPattern, value: string | boolean) => {
    const newAvailability = editableAvailability.map((item, i) =>
      i === dayIndex ? { ...item, [field]: value } : item
    );
    setEditableAvailability(newAvailability);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-gray-600 mt-1">
            Manage your personal information and preferences
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Profile
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Overview */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Profile Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <Avatar className="h-24 w-24 mx-auto mb-4">
                  <AvatarImage src="" /> {/* Consider adding user.avatarUrl if available */}
                  <AvatarFallback className="text-xl">
                    {getInitials(user?.firstName, user?.lastName)}
                  </AvatarFallback>
                </Avatar>
                
                <h2 className="text-xl font-semibold">
                  {user?.firstName} {user?.lastName}
                </h2>
                <p className="text-gray-600">{user?.email}</p>
                
                <div className="flex justify-center gap-2 mt-2">
                  <Badge className={`${getRoleColor(user?.role)} text-white`}>
                    {user?.role}
                  </Badge>
                  {user?.department && (
                    <Badge variant="outline">
                      {user.department}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span>{user?.email}</span>
                </div>
                {user?.phoneNumber && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{user.phoneNumber}</span>
                  </div>
                )}
                {user?.department && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>{user.department}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>Joined {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Profile Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Update your personal details and contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={profileData.firstName}
                    onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                    disabled={!isEditing}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  disabled={true} /* Email typically not editable by user directly */
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={profileData.phoneNumber}
                    onChange={(e) => setProfileData({ ...profileData, phoneNumber: e.target.value })}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={profileData.department}
                    onChange={(e) => setProfileData({ ...profileData, department: e.target.value })}
                    disabled={!isEditing}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Emergency Contact</CardTitle>
              <CardDescription>
                Emergency contact information for urgent situations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emergencyName">Contact Name</Label>
                  <Input
                    id="emergencyName"
                    value={profileData.emergencyContact.name}
                    onChange={(e) => setProfileData({
                      ...profileData,
                      emergencyContact: { ...profileData.emergencyContact, name: e.target.value }
                    })}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyRelationship">Relationship</Label>
                  <Input
                    id="emergencyRelationship"
                    value={profileData.emergencyContact.relationship}
                    onChange={(e) => setProfileData({
                      ...profileData,
                      emergencyContact: { ...profileData.emergencyContact, relationship: e.target.value }
                    })}
                    disabled={!isEditing}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="emergencyPhone">Phone Number</Label>
                <Input
                  id="emergencyPhone"
                  value={profileData.emergencyContact.phoneNumber}
                  onChange={(e) => setProfileData({
                    ...profileData,
                    emergencyContact: { ...profileData.emergencyContact, phoneNumber: e.target.value }
                  })}
                  disabled={!isEditing}
                />
              </div>
            </CardContent>
          </Card>

          {/* Skills and Availability */}
          <Card>
            <CardHeader>
              <CardTitle>Skills & Availability</CardTitle>
              <CardDescription>
                Your skills and regular availability schedule
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Skills</Label>
                <div className="flex flex-wrap gap-2">
                  {profileData.skills.map((skill, index) => (
                    <Badge key={index} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                  {profileData.skills.length === 0 && !isEditing && (
                    <p className="text-sm text-gray-500">No skills listed</p>
                  )}
                  {/* TODO: Add UI for editing skills when isEditing is true */}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Weekly Availability</Label>
                <div className="space-y-3">
                  {editableAvailability.map((avail, index) => (
                    <div key={avail.dayOfWeek} className="p-3 border rounded-lg bg-slate-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium w-28">
                          {displayDaysConfig.find(d => d.dayOfWeekValue === avail.dayOfWeek)?.name || `Day ${avail.dayOfWeek}`}
                        </span>
                        {isEditing ? (
                          <Input
                            type="checkbox"
                            id={`profile-avail-check-${avail.dayOfWeek}`}
                            checked={avail.isAvailable}
                            className="form-checkbox h-5 w-5 text-blue-600"
                            onChange={(e) => handleAvailabilityDayChange(index, 'isAvailable', e.target.checked)}
                          />
                        ) : avail.isAvailable ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            Available
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-500">
                            Not Available
                          </Badge>
                        )}
                      </div>
                      {isEditing && avail.isAvailable && (
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            type="time"
                            id={`profile-avail-start-${avail.dayOfWeek}`}
                            value={avail.startTime}
                            className="w-full h-8 text-sm"
                            onChange={(e) => handleAvailabilityDayChange(index, 'startTime', e.target.value)}
                          />
                          <span className="text-gray-500">-</span>
                          <Input
                            type="time"
                            id={`profile-avail-end-${avail.dayOfWeek}`}
                            value={avail.endTime}
                            className="w-full h-8 text-sm"
                            onChange={(e) => handleAvailabilityDayChange(index, 'endTime', e.target.value)}
                          />
                        </div>
                      )}
                      {!isEditing && avail.isAvailable && (
                         <div className="text-sm text-gray-700 mt-1">
                           {avail.startTime} - {avail.endTime}
                         </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
