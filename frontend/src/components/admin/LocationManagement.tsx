import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Plus, Edit, Trash2, Check, X, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Location {
  _id?: string;
  id?: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  radius_meters: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

interface LocationFormData {
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  radius_meters: number;
}

const LocationManagement: React.FC = () => {
  const { toast } = useToast();

  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<LocationFormData>({
    name: '',
    address: '',
    coordinates: { lat: 0, lng: 0 },
    radius_meters: 100
  });

  // Load locations
  const loadLocations = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getLocations();

      if (response.success && response.data) {
        setLocations(response.data);
      } else {
        throw new Error(response.message || 'Failed to load locations');
      }
    } catch (error) {
      console.error('Failed to load locations:', error);
      toast({
        title: "Error",
        description: "Failed to load locations. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      coordinates: { lat: 0, lng: 0 },
      radius_meters: 100
    });
    setEditingLocation(null);
  };

  // Open dialog for new location
  const handleAddNew = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      address: location.address,
      coordinates: location.coordinates,
      radius_meters: location.radius_meters
    });
    setIsDialogOpen(true);
  };

  // Get current location from GPS
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location Error",
        description: "Geolocation is not supported by this browser",
        variant: "destructive",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(prev => ({
          ...prev,
          coordinates: {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        }));
        toast({
          title: "Location Retrieved",
          description: "Current GPS coordinates have been set.",
        });
      },
      (error) => {
        let errorMessage = 'Failed to get current location';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location permissions.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
        }

        toast({
          title: "Location Error",
          description: errorMessage,
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Location name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.address.trim()) {
      toast({
        title: "Validation Error",
        description: "Address is required.",
        variant: "destructive",
      });
      return;
    }

    if (formData.coordinates.lat === 0 || formData.coordinates.lng === 0) {
      toast({
        title: "Validation Error",
        description: "Please set valid GPS coordinates.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingLocation) {
        // Update existing location
        const response = await apiClient.updateLocation(editingLocation.id, formData);

        if (response.success) {
          toast({
            title: "Success",
            description: "Location updated successfully.",
          });
          setIsDialogOpen(false);
          resetForm();
          await loadLocations();
        } else {
          throw new Error(response.message || 'Failed to update location');
        }
      } else {
        // Create new location
        const response = await apiClient.createLocation(formData);

        if (response.success) {
          toast({
            title: "Success",
            description: "Location created successfully.",
          });
          setIsDialogOpen(false);
          resetForm();
          await loadLocations();
        } else {
          throw new Error(response.message || 'Failed to create location');
        }
      }
    } catch (error) {
      console.error('Failed to save location:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save location.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle location active status
  const handleToggleActive = async (location: Location) => {
    try {
      const response = await apiClient.updateLocation(location.id, {
        is_active: !location.is_active
      });

      if (response.success) {
        toast({
          title: "Success",
          description: `Location ${location.is_active ? 'deactivated' : 'activated'} successfully.`,
        });
        await loadLocations();
      } else {
        throw new Error(response.message || 'Failed to update location');
      }
    } catch (error) {
      console.error('Failed to toggle location status:', error);
      toast({
        title: "Error",
        description: "Failed to update location status.",
        variant: "destructive",
      });
    }
  };

  // Delete location
  const handleDelete = async (location: Location) => {
    if (!confirm(`Are you sure you want to delete "${location.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiClient.deleteLocation(location.id);

      if (response.success) {
        toast({
          title: "Success",
          description: "Location deleted successfully.",
        });
        await loadLocations();
      } else {
        throw new Error(response.message || 'Failed to delete location');
      }
    } catch (error) {
      console.error('Failed to delete location:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete location.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading locations...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Location Management</h2>
          <p className="text-muted-foreground">
            Manage workplace locations with GPS coordinates for attendance tracking
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddNew}>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingLocation ? 'Edit Location' : 'Add New Location'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Location Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Main Office, North Branch"
                  required
                />
              </div>

              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Full address of the location"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lat">Latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    value={formData.coordinates.lat}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      coordinates: { ...prev.coordinates, lat: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="0.000000"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="lng">Longitude</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    value={formData.coordinates.lng}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      coordinates: { ...prev.coordinates, lng: parseFloat(e.target.value) || 0 }
                    }))}
                    placeholder="0.000000"
                    required
                  />
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={getCurrentLocation}
                className="w-full"
              >
                <MapPin className="h-4 w-4 mr-2" />
                Use Current GPS Location
              </Button>

              <div>
                <Label htmlFor="radius">Allowed Radius (meters)</Label>
                <Input
                  id="radius"
                  type="number"
                  min="10"
                  max="1000"
                  value={formData.radius_meters}
                  onChange={(e) => setFormData(prev => ({ ...prev, radius_meters: parseInt(e.target.value) || 100 }))}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Employees must be within this distance to clock in/out (10-1000m)
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {editingLocation ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Locations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Workplace Locations ({locations.length})</CardTitle>
        </CardHeader>

        <CardContent>
          {locations.length === 0 ? (
            <div className="text-center py-8">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Locations Yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your first workplace location to enable GPS-based attendance tracking.
              </p>
              <Button onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Location
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead>Radius</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((location, index) => (
                  <TableRow key={location.id ?? location._id ?? index}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{location.name}</p>
                        <p className="text-sm text-muted-foreground">{location.address}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {location.coordinates.lat.toFixed(6)}, {location.coordinates.lng.toFixed(6)}
                    </TableCell>
                    <TableCell>{location.radius_meters}m</TableCell>
                    <TableCell>
                      <Badge variant={location.is_active ? "default" : "secondary"}>
                        {location.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(location.created_at), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(location)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(location)}
                        >
                          {location.is_active ? (
                            <X className="h-4 w-4" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(location)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationManagement; 