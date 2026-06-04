/** Shared password validation rules enforced during signup and password reset. */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordValidationResult {
  valid: boolean;
  error: string | null;
}

export interface PasswordRequirement {
  id: "length" | "uppercase" | "lowercase" | "number" | "special" | "notCommon";
  label: string;
  met: boolean;
}

const COMMON_PASSWORD_SIGNATURES = new Set([
  "123456",
  "123456789",
  "admin",
  "admin123",
  "changeme",
  "default",
  "letmein",
  "maiprop",
  "maiprop2026",
  "password",
  "password1",
  "password123",
  "qwerty",
  "qwerty123",
  "welcome",
  "welcome1",
  "welcome123",
]);

function passwordSignature(password: string): string {
  return password.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isCommonOrCompromisedPassword(password: string): boolean {
  const signature = passwordSignature(password);
  return (
    COMMON_PASSWORD_SIGNATURES.has(signature) ||
    /^password\d*$/.test(signature) ||
    /^qwerty\d*$/.test(signature) ||
    /^welcome\d*$/.test(signature)
  );
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "uppercase",
      label: "One uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      label: "One lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      id: "number",
      label: "One number",
      met: /[0-9]/.test(password),
    },
    {
      id: "special",
      label: "One special character",
      met: /[^A-Za-z0-9]/.test(password),
    },
    {
      id: "notCommon",
      label: "Not a common or compromised password",
      met: Boolean(password) && !isCommonOrCompromisedPassword(password),
    },
  ];
}

export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number" };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one special character" };
  }
  if (isCommonOrCompromisedPassword(password)) {
    return { valid: false, error: "Password must not be a common or compromised password" };
  }
  return { valid: true, error: null };
}
