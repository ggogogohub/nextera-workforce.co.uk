import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Download, Shield, Eye, Trash2, UserX, FileText, Info, CheckCircle, RefreshCw } from 'lucide-react';

interface ProcessingInfo {
  data_controller: {
    organization: string;
    contact: string;
  };
  processing_purposes: Record<string, string>;
  legal_basis: Record<string, string>;
  data_categories: Record<string, string[]>;
  retention_periods: Record<string, string>;
  your_rights: Record<string, string>;
}

export const Privacy: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [processingInfo, setProcessingInfo] = useState<ProcessingInfo | null>(null);
  const [showProcessingInfo, setShowProcessingInfo] = useState(false);
  const { toast } = useToast();
  const { logout } = useAuthStore();

  const loadProcessingInfo = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getDataProcessingInfo();
      
      if (response.success) {
        setProcessingInfo(response.data.processing_info);
        setShowProcessingInfo(true);
        toast({
          title: "Success",
          description: "Data processing information loaded successfully"
        });
      }
    } catch (error) {
      console.error('Error loading processing info:', error);
      toast({
        title: "Error",
        description: "Failed to load data processing information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewMyData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getMyPersonalData();
      
      if (response.success) {
        // Display the data in a dialog or new window
        const dataWindow = window.open('', '_blank');
        if (dataWindow) {
          dataWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>My Personal Data - NextEra Workforce</title>
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; 
                    padding: 20px;
                    background: #f8fafc;
                  }
                  .container { 
                    max-width: 1200px; 
                    margin: 0 auto; 
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    padding: 30px;
                  }
                  h1 { 
                    color: #1e40af; 
                    border-bottom: 2px solid #e5e7eb; 
                    padding-bottom: 10px;
                  }
                  .export-info {
                    background: #dbeafe;
                    border: 1px solid #93c5fd;
                    border-radius: 6px;
                    padding: 15px;
                    margin: 20px 0;
                  }
                  pre { 
                    background: #f1f5f9; 
                    padding: 20px; 
                    border-radius: 6px; 
                    overflow-x: auto;
                    font-size: 13px;
                    border: 1px solid #e2e8f0;
                  }
                  .print-btn {
                    background: #2563eb;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    margin: 10px 5px 0 0;
                  }
                  .print-btn:hover {
                    background: #1d4ed8;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <h1>📋 Your Personal Data Export</h1>
                  <div class="export-info">
                    <strong>📅 Export Date:</strong> ${new Date().toLocaleString()}<br>
                    <strong>🔒 Privacy Notice:</strong> This data is exported in compliance with GDPR Article 15 (Right to Access)
                  </div>
                  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
                  <button class="print-btn" onclick="downloadData()">💾 Save as File</button>
                  <pre style="white-space: pre-wrap; font-family: 'Monaco', 'Menlo', monospace;">
${JSON.stringify(response.data.data, null, 2)}</pre>
                  <script>
                    function downloadData() {
                      const dataStr = JSON.stringify(${JSON.stringify(response.data.data)}, null, 2);
                      const dataBlob = new Blob([dataStr], {type: 'application/json'});
                      const url = URL.createObjectURL(dataBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'my_personal_data_${new Date().toISOString().split('T')[0]}.json';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }
                  </script>
                </div>
              </body>
            </html>
          `);
          dataWindow.document.close();
        }
        toast({
          title: "Success",
          description: "Your personal data has been displayed in a new window"
        });
      }
    } catch (error) {
      console.error('Error viewing data:', error);
      toast({
        title: "Error",
        description: "Failed to retrieve your personal data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      setLoading(true);
      
      const blob = await apiClient.exportMyPersonalData();
      
      // Create filename
      const filename = `personal_data_export_${new Date().toISOString().split('T')[0]}.zip`;
      
      // Create blob and download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: `Your personal data export (${filename}) has been downloaded successfully`
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export your personal data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.deleteMyPersonalData();
      
      if (response.success) {
        toast({
          title: "Data Deleted",
          description: "Your personal data has been permanently deleted. You will be logged out immediately."
        });
        
        // Use the auth store logout function for immediate logout
        setTimeout(async () => {
          try {
            await logout();
            window.location.href = '/login';
          } catch (error) {
            // Fallback if logout fails
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/login';
          }
        }, 1000); // Reduced to 1 second for immediate logout
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: "Failed to delete your personal data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymizeData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.anonymizeMyPersonalData();
      
      if (response.success) {
        toast({
          title: "Data Anonymized",
          description: `Your personal data has been anonymized. Your new anonymous ID is: ${response.data.anonymous_id}`
        });
      }
    } catch (error) {
      console.error('Anonymize error:', error);
      toast({
        title: "Error",
        description: "Failed to anonymize your personal data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Privacy & Data Protection</h1>
        <p className="text-gray-600 mt-1">
          Manage your personal data and exercise your privacy rights under GDPR. 
          All actions are performed in real-time with your current data.
        </p>
      </div>

      {/* Data Subject Rights */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Right to Access */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-gray-600" />
              Right to Access
            </CardTitle>
            <CardDescription>
              View all personal data we have about you in real-time
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Access your current schedules, profiles, messages, attendance records, and all other personal data.
            </p>
            <Button 
              onClick={handleViewMyData} 
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              <Eye className="h-4 w-4 mr-2" />
              {loading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              View My Data
            </Button>
          </CardContent>
        </Card>

        {/* Right to Portability */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-gray-600" />
              Right to Portability
            </CardTitle>
            <CardDescription>
              Download your data in a portable ZIP format
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Get a complete copy of your personal data in machine-readable JSON format with GDPR documentation.
            </p>
            <Button 
              onClick={handleExportData} 
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              <Download className="h-4 w-4 mr-2" />
              {loading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Export My Data
            </Button>
          </CardContent>
        </Card>

        {/* Right to Erasure */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-gray-600" />
              Right to Erasure
            </CardTitle>
            <CardDescription>
              Permanently delete your personal data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Request permanent deletion of all your personal data. This action cannot be undone.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete My Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Permanently Delete Your Data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. All your personal data including schedules, 
                    messages, and profile information will be permanently deleted. You will 
                    be logged out and your account will be closed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteData}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Yes, Delete Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Data Anonymization */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-gray-600" />
              Data Anonymization
            </CardTitle>
            <CardDescription>
              Anonymize your data while preserving analytics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Remove personal identifiers while keeping data for business analytics and reporting.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <UserX className="h-4 w-4 mr-2" />
                  Anonymize My Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Anonymize Your Data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all personal identifiers from your data while 
                    preserving it for business analytics. Your name, email, and other 
                    identifying information will be replaced with anonymous identifiers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAnonymizeData}>
                    Yes, Anonymize My Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* Data Processing Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-gray-600" />
            Data Processing Information
          </CardTitle>
          <CardDescription>
            Learn how we process your personal data according to GDPR
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={loadProcessingInfo} 
            disabled={loading}
            variant="outline"
            className="mb-4"
          >
            <FileText className="h-4 w-4 mr-2" />
            {loading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            View Processing Details
          </Button>

          {showProcessingInfo && processingInfo && (
            <div className="mt-6 space-y-6">
              <Separator />
              
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-semibold mb-3 text-gray-900">Data Controller</h3>
                <p className="text-sm text-gray-600"><strong>Organization:</strong> {processingInfo.data_controller.organization}</p>
                <p className="text-sm text-gray-600"><strong>Contact:</strong> {processingInfo.data_controller.contact}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-semibold mb-3 text-gray-900">Processing Purposes</h3>
                <div className="grid gap-2">
                  {Object.entries(processingInfo.processing_purposes).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2">
                      <Badge variant="outline">
                        {key.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-sm text-gray-600">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-semibold mb-3 text-gray-900">Data Categories</h3>
                <div className="grid gap-2">
                  {Object.entries(processingInfo.data_categories).map(([category, items]) => (
                    <div key={category} className="flex items-start gap-2">
                      <Badge variant="secondary">
                        {category}
                      </Badge>
                      <span className="text-sm text-gray-600">{items.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-semibold mb-3 text-gray-900">Your Rights</h3>
                <div className="grid gap-3">
                  {Object.entries(processingInfo.your_rights).map(([right, description]) => (
                    <div key={right} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <strong className="text-sm text-gray-900">{right.replace(/_/g, ' ')}</strong>
                        <p className="text-sm text-gray-600">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Privacy Policy Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-gray-600" />
            Privacy by Design
          </CardTitle>
          <CardDescription>
            How we protect your privacy in NextEra Workforce Management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Shield className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Data Minimization</h4>
                  <p className="text-sm text-gray-600">
                    We only collect and process data that is necessary for workforce management operations.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Shield className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Encryption</h4>
                  <p className="text-sm text-gray-600">
                    All personal data is encrypted both in transit and at rest using industry-standard AES-256 encryption.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Shield className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Access Controls</h4>
                  <p className="text-sm text-gray-600">
                    Role-based access ensures only authorized personnel can access your data based on job requirements.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Shield className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Audit Trails</h4>
                  <p className="text-sm text-gray-600">
                    All data access and modifications are logged with timestamps for security and compliance monitoring.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 