import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Lightbulb, 
  Users, 
  Clock, 
  MapPin, 
  Building,
  Zap,
  ArrowRight,
  RefreshCw,
  Settings,
  TrendingUp,
  AlertCircle
} from "lucide-react";

interface ConflictAnalysisConflict {
  type: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  day?: string;
  current_min?: number;
  suggested_min?: number;
  current_max?: number;
  suggested_max?: number;
  affected_days?: number;
}

interface ConflictAnalysisSuggestion {
  type: string;
  message: string;
  action?: string;
  day?: string;
  current_min?: number;
  suggested_min?: number;
  current_max?: number;
  suggested_max?: number;
  suggested_value?: number;
  affected_days?: number;
  priority?: 'high' | 'medium' | 'low';
  impact?: string;
  effort?: 'easy' | 'moderate' | 'complex';
}

interface ConflictAnalysisData {
  constraint_name: string;
  date_range: {
    start: string;
    end: string;
  };
  total_employees: number;
  conflict_count: number;
  has_critical_conflicts: boolean;
  conflicts: ConflictAnalysisConflict[];
  suggestions: ConflictAnalysisSuggestion[];
  can_proceed: boolean;
}

interface ConflictResolutionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conflictData: ConflictAnalysisData | null;
  onApplyFixes: (fixes: ConflictAnalysisSuggestion[]) => Promise<void>;
  onProceedAnyway: () => void;
  onEditConstraints: () => void;
  isApplyingFixes?: boolean;
}

const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  isOpen,
  onClose,
  conflictData,
  onApplyFixes,
  onProceedAnyway,
  onEditConstraints,
  isApplyingFixes = false
}) => {
  const [selectedFixes, setSelectedFixes] = useState<ConflictAnalysisSuggestion[]>([]);

  if (!conflictData) return null;

  const criticalConflicts = conflictData.conflicts.filter(c => c.severity === 'critical');
  const warningConflicts = conflictData.conflicts.filter(c => c.severity === 'warning');
  const infoConflicts = conflictData.conflicts.filter(c => c.severity === 'info');

  const autoFixableSuggestions = conflictData.suggestions.filter(s => 
    ['reduce_min_staff', 'fix_staff_range', 'increase_consecutive_limit'].includes(s.type)
  );

  const manualSuggestions = conflictData.suggestions.filter(s => 
    !['reduce_min_staff', 'fix_staff_range', 'increase_consecutive_limit'].includes(s.type)
  );

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'info': return <AlertCircle className="w-4 h-4 text-blue-500" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-50 border-red-200 text-red-800';
      case 'warning': return 'bg-amber-50 border-amber-200 text-amber-800';
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getConflictTypeIcon = (type: string) => {
    switch (type) {
      case 'insufficient_staff': return <Users className="w-4 h-4" />;
      case 'no_operating_days': return <Clock className="w-4 h-4" />;
      case 'invalid_staff_range': return <Settings className="w-4 h-4" />;
      case 'availability_conflicts': return <MapPin className="w-4 h-4" />;
      case 'unrealistic_consecutive_limit': return <TrendingUp className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case 'easy': return <Badge variant="secondary" className="bg-green-100 text-green-800">Easy Fix</Badge>;
      case 'moderate': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Moderate</Badge>;
      case 'complex': return <Badge variant="secondary" className="bg-red-100 text-red-800">Complex</Badge>;
      default: return null;
    }
  };

  const toggleFixSelection = (suggestion: ConflictAnalysisSuggestion) => {
    setSelectedFixes(prev => {
      const isSelected = prev.some(s => s.type === suggestion.type && s.day === suggestion.day);
      if (isSelected) {
        return prev.filter(s => !(s.type === suggestion.type && s.day === suggestion.day));
      } else {
        return [...prev, suggestion];
      }
    });
  };

  const handleApplySelectedFixes = async () => {
    if (selectedFixes.length > 0) {
      await onApplyFixes(selectedFixes);
      setSelectedFixes([]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-blue-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold text-slate-900">
                Schedule Generation Conflicts
              </DialogTitle>
              <p className="text-sm text-slate-600 mt-1">
                {conflictData.constraint_name} • {conflictData.date_range.start} to {conflictData.date_range.end}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">
            {/* Summary Card */}
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-amber-600" />
                    Conflict Summary
                  </CardTitle>
                  <Badge variant={conflictData.has_critical_conflicts ? "destructive" : "secondary"}>
                    {conflictData.conflict_count} {conflictData.conflict_count === 1 ? 'Issue' : 'Issues'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <div className="font-semibold text-slate-900">{conflictData.total_employees}</div>
                    <div className="text-slate-600">Available Employees</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="font-semibold text-red-900">{criticalConflicts.length}</div>
                    <div className="text-red-600">Critical Issues</div>
                  </div>
                  <div className="text-center p-3 bg-amber-50 rounded-lg">
                    <div className="font-semibold text-amber-900">{warningConflicts.length}</div>
                    <div className="text-amber-600">Warnings</div>
                  </div>
                </div>
                
                {!conflictData.can_proceed && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-red-800">
                      <strong>Schedule generation blocked:</strong> Critical conflicts must be resolved before proceeding.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Critical Conflicts */}
            {criticalConflicts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-red-700">
                    <XCircle className="w-5 h-5" />
                    Critical Issues ({criticalConflicts.length})
                  </CardTitle>
                  <CardDescription>These issues prevent schedule generation and must be resolved.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {criticalConflicts.map((conflict, index) => (
                    <div key={index} className={`p-4 rounded-lg border ${getSeverityColor(conflict.severity)}`}>
                      <div className="flex items-start gap-3">
                        {getConflictTypeIcon(conflict.type)}
                        <div className="flex-1">
                          <div className="font-medium">{conflict.message}</div>
                          {conflict.day && (
                            <div className="text-sm opacity-75 mt-1">Affects: {conflict.day}</div>
                          )}
                        </div>
                        {getSeverityIcon(conflict.severity)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Warning Conflicts */}
            {warningConflicts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="w-5 h-5" />
                    Warnings ({warningConflicts.length})
                  </CardTitle>
                  <CardDescription>These issues may affect schedule quality but won't prevent generation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {warningConflicts.map((conflict, index) => (
                    <div key={index} className={`p-4 rounded-lg border ${getSeverityColor(conflict.severity)}`}>
                      <div className="flex items-start gap-3">
                        {getConflictTypeIcon(conflict.type)}
                        <div className="flex-1">
                          <div className="font-medium">{conflict.message}</div>
                          {conflict.day && (
                            <div className="text-sm opacity-75 mt-1">Affects: {conflict.day}</div>
                          )}
                        </div>
                        {getSeverityIcon(conflict.severity)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Auto-Fixable Suggestions */}
            {autoFixableSuggestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                    <Zap className="w-5 h-5" />
                    Quick Fixes ({autoFixableSuggestions.length})
                  </CardTitle>
                  <CardDescription>These issues can be automatically resolved with one click.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {autoFixableSuggestions.map((suggestion, index) => {
                    const isSelected = selectedFixes.some(s => s.type === suggestion.type && s.day === suggestion.day);
                    return (
                      <div 
                        key={index} 
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-green-300 bg-green-50' 
                            : 'border-gray-200 bg-white hover:border-green-200 hover:bg-green-25'
                        }`}
                        onClick={() => toggleFixSelection(suggestion)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-4 h-4 rounded border-2 mt-0.5 flex items-center justify-center ${
                            isSelected ? 'border-green-500 bg-green-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-slate-900">{suggestion.message}</div>
                            {suggestion.day && (
                              <div className="text-sm text-slate-600 mt-1">Day: {suggestion.day}</div>
                            )}
                            {(suggestion.current_min !== undefined && suggestion.suggested_min !== undefined) && (
                              <div className="text-sm text-slate-600 mt-1">
                                Change: {suggestion.current_min} → {suggestion.suggested_min} staff
                              </div>
                            )}
                            {(suggestion.current_max !== undefined && suggestion.suggested_max !== undefined) && (
                              <div className="text-sm text-slate-600 mt-1">
                                Change: {suggestion.current_max} → {suggestion.suggested_max} max staff
                              </div>
                            )}
                          </div>
                          {getEffortBadge(suggestion.effort || 'easy')}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Manual Suggestions */}
            {manualSuggestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
                    <Lightbulb className="w-5 h-5" />
                    Manual Recommendations ({manualSuggestions.length})
                  </CardTitle>
                  <CardDescription>These suggestions require manual intervention or policy changes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {manualSuggestions.map((suggestion, index) => (
                    <div key={index} className="p-4 rounded-lg border border-blue-200 bg-blue-50">
                      <div className="flex items-start gap-3">
                        <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-medium text-blue-900">{suggestion.message}</div>
                          {suggestion.action && (
                            <div className="text-sm text-blue-700 mt-1">Action: {suggestion.action}</div>
                          )}
                          {suggestion.affected_days && (
                            <div className="text-sm text-blue-700 mt-1">Affects {suggestion.affected_days} day(s)</div>
                          )}
                        </div>
                        {getEffortBadge(suggestion.effort || 'moderate')}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t bg-slate-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {selectedFixes.length > 0 && (
                <Button 
                  onClick={handleApplySelectedFixes}
                  disabled={isApplyingFixes}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isApplyingFixes ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Applying Fixes...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Apply {selectedFixes.length} Fix{selectedFixes.length !== 1 ? 'es' : ''}
                    </>
                  )}
                </Button>
              )}
              
              <Button 
                variant="outline" 
                onClick={onEditConstraints}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Settings className="w-4 h-4 mr-2" />
                Edit Constraints
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              
              {conflictData.can_proceed && (
                <Button 
                  onClick={onProceedAnyway}
                  variant="secondary"
                  className="bg-amber-100 text-amber-800 hover:bg-amber-200"
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Proceed Anyway
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConflictResolutionDialog;