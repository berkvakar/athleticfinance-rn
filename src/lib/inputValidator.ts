/**
 * Input Validation and Sanitization Utility
 * 
 * Provides comprehensive validation and sanitization for user inputs
 * to prevent XSS, SQL injection, and other security vulnerabilities
 */

/**
 * Sanitize HTML string to prevent XSS attacks
 */
export const sanitizeHtml = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Validate email format (RFC 5322 compliant)
 */
export const isValidEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const trimmedEmail = email.trim();
  if (trimmedEmail.length === 0 || trimmedEmail.length > 256) return false;
  
  const atIndex = trimmedEmail.indexOf('@');
  if (atIndex === -1 || atIndex !== trimmedEmail.lastIndexOf('@')) return false;
  
  const localPart = trimmedEmail.substring(0, atIndex);
  const domainPart = trimmedEmail.substring(atIndex + 1);
  
  // Local part validation
  if (localPart.length === 0 || localPart.length > 64) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;
  if (!/^[a-zA-Z0-9._+-]+$/.test(localPart)) return false;
  
  // Domain part validation
  if (domainPart.length === 0 || domainPart.length > 253) return false;
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false;
  if (domainPart.includes('..')) return false;
  if (!domainPart.includes('.')) return false;
  
  const domainParts = domainPart.split('.');
  if (domainParts.length < 2) return false;
  
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;
  
  for (const part of domainParts) {
    if (part.length === 0 || part.length > 63) return false;
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part)) return false;
  }
  
  return true;
};

/**
 * Validate username format
 * - 3-25 characters (excluding @ symbol)
 * - Alphanumeric and underscores only
 * - No consecutive underscores
 * - Cannot start or end with underscore
 */
export const isValidUsername = (username: string): boolean => {
  if (!username || typeof username !== 'string') return false;
  
  // Remove @ symbol if present
  const cleanUsername = username.replace(/^@+/, '');
  
  // Length check
  if (cleanUsername.length < 3 || cleanUsername.length > 25) return false;
  
  // Character validation: only alphanumeric and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) return false;
  
  // Cannot start or end with underscore
  if (cleanUsername.startsWith('_') || cleanUsername.endsWith('_')) return false;
  
  // No consecutive underscores
  if (cleanUsername.includes('__')) return false;
  
  return true;
};

/**
 * Validate password strength
 */
export const isValidPassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!password || typeof password !== 'string') {
    errors.push('Password is required');
    return { valid: false, errors };
  }
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password should contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password should contain at least one lowercase letter');
  }
  
  // Check for common weak passwords
  const weakPasswords = ['password', '12345678', 'qwerty', 'admin', 'letmein'];
  if (weakPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common, please choose a stronger password');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Sanitize user input to prevent injection attacks
 */
export const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Limit whitespace
    .replace(/\s+/g, ' ');
};

/**
 * Validate name (first/last name)
 */
export const isValidName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false;
  
  const trimmed = name.trim();
  
  // Length check (1-50 characters)
  if (trimmed.length < 1 || trimmed.length > 50) return false;
  
  // Only letters, spaces, hyphens, and apostrophes
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) return false;
  
  return true;
};

/**
 * Check if string contains potential SQL injection patterns
 */
export const containsSqlInjection = (input: string): boolean => {
  const sqlPatterns = [
    /(\bor\b|\band\b).*=.*=/i,
    /union.*select/i,
    /insert.*into/i,
    /delete.*from/i,
    /drop.*table/i,
    /update.*set/i,
    /exec\s*\(/i,
    /script.*>/i,
    /<.*script/i,
  ];
  
  return sqlPatterns.some(pattern => pattern.test(input));
};

/**
 * Check if string contains potential XSS patterns
 */
export const containsXss = (input: string): boolean => {
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // event handlers like onclick=
    /<iframe/i,
    /<object/i,
    /<embed/i,
  ];
  
  return xssPatterns.some(pattern => pattern.test(input));
};

/**
 * Comprehensive input validation
 */
export const validateInput = (input: string, type: 'email' | 'username' | 'password' | 'name' | 'general'): {
  valid: boolean;
  sanitized: string;
  errors: string[];
} => {
  const errors: string[] = [];
  
  // Check for malicious patterns
  if (containsSqlInjection(input)) {
    errors.push('Input contains invalid characters');
  }
  
  if (containsXss(input)) {
    errors.push('Input contains invalid characters');
  }
  
  // Sanitize input
  const sanitized = sanitizeInput(input);
  
  // Type-specific validation
  switch (type) {
    case 'email':
      if (!isValidEmail(sanitized)) {
        errors.push('Invalid email format');
      }
      break;
    case 'username':
      if (!isValidUsername(sanitized)) {
        errors.push('Invalid username format');
      }
      break;
    case 'password':
      const passwordValidation = isValidPassword(sanitized);
      if (!passwordValidation.valid) {
        errors.push(...passwordValidation.errors);
      }
      break;
    case 'name':
      if (!isValidName(sanitized)) {
        errors.push('Invalid name format');
      }
      break;
  }
  
  return {
    valid: errors.length === 0,
    sanitized,
    errors,
  };
};

