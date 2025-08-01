import React from 'react';
import { Check, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface PasswordStrengthIndicatorProps {
  password: string;
  onValidationChange?: (isValid: boolean) => void;
}

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
  weight: number;
}

const passwordRequirements: PasswordRequirement[] = [
  {
    label: "At least 8 characters long",
    test: (password) => password.length >= 8,
    weight: 20
  },
  {
    label: "Contains uppercase letter (A-Z)",
    test: (password) => /[A-Z]/.test(password),
    weight: 20
  },
  {
    label: "Contains lowercase letter (a-z)",
    test: (password) => /[a-z]/.test(password),
    weight: 20
  },
  {
    label: "Contains number (0-9)",
    test: (password) => /[0-9]/.test(password),
    weight: 20
  },
  {
    label: "Contains special character (!@#$%^&*)",
    test: (password) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    weight: 20
  }
];

const getPasswordStrength = (password: string): { score: number; level: string; color: string } => {
  const score = passwordRequirements.reduce((acc, req) => {
    return acc + (req.test(password) ? req.weight : 0);
  }, 0);

  if (score === 100) return { score, level: "Very Strong", color: "bg-green-500" };
  if (score >= 80) return { score, level: "Strong", color: "bg-green-400" };
  if (score >= 60) return { score, level: "Medium", color: "bg-yellow-500" };
  if (score >= 40) return { score, level: "Weak", color: "bg-orange-500" };
  return { score, level: "Very Weak", color: "bg-red-500" };
};

export const isPasswordValid = (password: string): boolean => {
  return passwordRequirements.every(req => req.test(password));
};

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({ 
  password, 
  onValidationChange 
}) => {
  const strength = getPasswordStrength(password);
  const isValid = isPasswordValid(password);

  React.useEffect(() => {
    onValidationChange?.(isValid);
  }, [isValid, onValidationChange]);

  if (!password) return null;

  return (
    <div className="space-y-3 mt-2">
      {/* Password Strength Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Password Strength</span>
          <span className={`font-medium ${
            strength.level === "Very Strong" ? "text-green-600" :
            strength.level === "Strong" ? "text-green-500" :
            strength.level === "Medium" ? "text-yellow-600" :
            strength.level === "Weak" ? "text-orange-600" :
            "text-red-600"
          }`}>
            {strength.level}
          </span>
        </div>
        <Progress 
          value={strength.score} 
          className="h-2"
        />
      </div>

      {/* Requirements Checklist */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-700">Password Requirements:</p>
        <div className="space-y-1">
          {passwordRequirements.map((requirement, index) => {
            const isPassed = requirement.test(password);
            return (
              <div key={index} className="flex items-center gap-2 text-sm">
                {isPassed ? (
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                )}
                <span className={isPassed ? "text-green-700" : "text-gray-600"}>
                  {requirement.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Security Tips */}
      {strength.score < 100 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-sm text-blue-800 font-medium mb-1">💡 Security Tips:</p>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>Use a mix of uppercase and lowercase letters</li>
            <li>Include numbers and special characters</li>
            <li>Avoid common words and personal information</li>
            <li>Consider using a passphrase with multiple words</li>
          </ul>
        </div>
      )}

      {/* Validation Status */}
      {isValid && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-2">
          <Check className="h-4 w-4" />
          <span>Password meets all security requirements</span>
        </div>
      )}
    </div>
  );
};

export default PasswordStrengthIndicator; 