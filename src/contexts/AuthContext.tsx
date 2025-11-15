import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { signUp, signIn, signOut, getCurrentUser, fetchAuthSession, updateUserAttribute, confirmSignUp } from 'aws-amplify/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  isPremium: boolean;
  avatar?: string;
  bio?: string;
  hideProfile?: boolean;
}

export interface SavedItem {
  id: string;
  type: 'article' | 'comment';
  title?: string;
  content: string;
  timestamp: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, username: string) => Promise<{ requiresVerification: boolean; username: string; email: string } | void>;
  confirmSignUp: (username: string, confirmationCode: string, password: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  upgradeToPremium: () => Promise<void>;
  savedItems: SavedItem[];
  saveItem: (item: SavedItem) => void;
  unsaveItem: (id: string) => void;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  
  // Store username in AsyncStorage since custom attributes are not available yet
  const getStoredUsername = async (email: string): Promise<string> => {
    try {
      const stored = await AsyncStorage.getItem(`username_${email}`);
      if (stored) return stored;
      // Generate default username without @ symbol
      const defaultUsername = `${email.split('@')[0]}AF`;
      return `@${defaultUsername}`;
    } catch (error) {
      const defaultUsername = `${email.split('@')[0]}AF`;
      return `@${defaultUsername}`;
    }
  };
  
  const setStoredUsername = async (email: string, username: string) => {
    try {
      await AsyncStorage.setItem(`username_${email}`, username);
    } catch (error) {
      console.error('[AUTH] Error storing username:', error);
    }
  };

  // Store Cognito username mapping for login
  const getCognitoUsername = async (email: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(`cognito_username_${email}`);
    } catch (error) {
      return null;
    }
  };
  
  const setCognitoUsername = async (email: string, cognitoUsername: string) => {
    try {
      await AsyncStorage.setItem(`cognito_username_${email}`, cognitoUsername);
    } catch (error) {
      console.error('[AUTH] Error storing Cognito username:', error);
    }
  };

  // Load user session on mount
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    console.log('[AUTH] loadUser: Starting to load user session...');
    try {
      // This will throw if user is not authenticated
      console.log('[AUTH] loadUser: Calling getCurrentUser()...');
      const currentUser = await getCurrentUser();
      console.log('[AUTH] loadUser: getCurrentUser() succeeded, userId:', currentUser.userId);
      
      // Fetch fresh session (Amplify handles token refresh automatically)
      console.log('[AUTH] loadUser: Fetching auth session...');
      const session = await fetchAuthSession({ forceRefresh: false });
      console.log('[AUTH] loadUser: Session fetched, has tokens:', !!session.tokens);
      
      if (currentUser && session.tokens?.idToken) {
        // Fetch user attributes from ID token payload
        const attributes = session.tokens.idToken.payload as any;
        console.log('[AUTH] loadUser: ID token payload:', attributes);
        
        const email = attributes.email || '';
        const storedUsername = await getStoredUsername(email);
        console.log('[AUTH] loadUser: Email:', email, 'Username:', storedUsername);
        
        // Base user data from Cognito
        let userData: User = {
          id: currentUser.userId,
          email: email,
          name: attributes.name || '',
          username: storedUsername,
          isPremium: false, // Will be set later when custom attributes are added
        };
        
        // Try to fetch additional profile data from DynamoDB
        try {
          console.log('[AUTH] loadUser: Fetching profile from DynamoDB...');
          const profile = await apiClient.getUserProfile(storedUsername);
          console.log('[AUTH] loadUser: Profile fetched from DynamoDB:', profile);
          
          // Merge DynamoDB data with Cognito data
          userData = {
            ...userData,
            bio: profile.description || undefined,
            avatar: profile.profilePicture || undefined,
            // You can add more fields here as needed
          };
          
          console.log('[AUTH] loadUser: Merged user data with DynamoDB profile');
        } catch (profileError: any) {
          console.warn('[AUTH] loadUser:Could not fetch profile from DynamoDB:', profileError.message);
          console.log('[AUTH] loadUser: Continuing with Cognito data only');
          // Continue with Cognito data only - don't fail the login
        }
        
        console.log('[AUTH] loadUser: Setting user data:', userData);
        setUser(userData);
        console.log('[AUTH] loadUser: User loaded successfully');
      } else {
        console.log('[AUTH] loadUser: No valid session tokens, setting user to null');
        setUser(null);
      }
    } catch (error: any) {
      // User not authenticated - clear any stale data
      console.log('[AUTH] loadUser: Error loading user:', error.message);
      console.log('[AUTH] loadUser: User not authenticated, clearing user state');
      setUser(null);
    } finally {
      setLoading(false);
      console.log('[AUTH] loadUser: Finished loading user, loading state set to false');
    }
  };

  const login = async (email: string, password: string) => {
    console.log('[AUTH] login: Starting login for email:', email);
    
    // Validate inputs
    if (!email || !password) {
      throw new Error('Please enter both email and password.');
    }
  
    try {
      // Try to get stored Cognito username, otherwise use email (if alias enabled)
      let loginIdentifier = email.trim().toLowerCase();
      try {
        const cognitoUsername = await getCognitoUsername(email);
        if (cognitoUsername) {
          loginIdentifier = cognitoUsername;
          console.log('[AUTH] login: Found stored Cognito username');
        }
      } catch (e) {
        console.warn('[AUTH] login: Could not fetch Cognito username, using email instead');
      }
  
      console.log('[AUTH] login: Using login identifier:', loginIdentifier);
      console.log('[AUTH] login: Calling signIn() with Amplify v6 (Expo compatible)...');
  
      // Call signIn with proper error handling for Expo/Amplify v6
      let signInResult;
      try {
        // For Expo/Amplify v6 compatibility, ensure we're using the correct API
        signInResult = await signIn({ 
          username: loginIdentifier, 
          password: password 
        });
        console.log('[AUTH] login: signIn() completed successfully');
        console.log('[AUTH] login: signIn result:', JSON.stringify(signInResult, null, 2));
      } catch (signInError: any) {
        // Log detailed error for debugging Expo/Amplify issues
        console.error('[AUTH] login: signIn() threw an error');
        console.error('[AUTH] login: Error type:', typeof signInError);
        console.error('[AUTH] login: Error name:', signInError?.name);
        console.error('[AUTH] login: Error message:', signInError?.message);
        console.error('[AUTH] login: Error code:', signInError?.code);
        console.error('[AUTH] login: Error toString:', signInError?.toString?.());
        
        // Try to extract more error details from Amplify error structure
        let errorDetails = '';
        try {
          // Check for nested error properties (common in Amplify errors)
          if (signInError?.underlyingError) {
            console.error('[AUTH] login: Underlying error:', signInError.underlyingError);
            errorDetails = signInError.underlyingError?.message || signInError.underlyingError?.toString() || '';
          }
          if (signInError?.cause) {
            console.error('[AUTH] login: Error cause:', signInError.cause);
            errorDetails = signInError.cause?.message || signInError.cause?.toString() || errorDetails;
          }
          if (signInError?.errors && Array.isArray(signInError.errors)) {
            console.error('[AUTH] login: Error array:', signInError.errors);
            errorDetails = signInError.errors.map((e: any) => e?.message || e?.toString()).join(', ') || errorDetails;
          }
          
          // Try to stringify the entire error object to see its structure
          try {
            const errorString = JSON.stringify(signInError, Object.getOwnPropertyNames(signInError), 2);
            console.error('[AUTH] login: Full error object:', errorString);
          } catch (stringifyError) {
            console.error('[AUTH] login: Could not stringify error:', stringifyError);
          }
        } catch (extractError) {
          console.error('[AUTH] login: Error extracting error details:', extractError);
        }
        
        // Build comprehensive error message
        const errorMsg = 
          signInError?.message || 
          errorDetails ||
          signInError?.name || 
          signInError?.code ||
          signInError?.toString?.() || 
          'Unknown error';
        
        console.error('[AUTH] login: Extracted error message:', errorMsg);
        
        // Check for network/permission errors (common with Expo)
        if (
          errorMsg.includes('Network') ||
          errorMsg.includes('network') ||
          errorMsg.includes('fetch') ||
          errorMsg.includes('Failed to fetch') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ENOTFOUND') ||
          errorMsg.includes('ERR_NETWORK')
        ) {
          throw new Error('Network error. Please check your internet connection and try again.');
        }
        
        // Check for specific Amplify/Cognito error patterns
        if (errorMsg.includes('NotAuthorizedException') || errorMsg.includes('Incorrect')) {
          throw new Error('Incorrect email or password. Please try again.');
        }
        
        if (errorMsg.includes('UserNotFoundException')) {
          throw new Error('No account found with this email. Please sign up first.');
        }
        
        if (errorMsg.includes('UserNotConfirmedException')) {
          throw new Error('Account verification required. Please check your email.');
        }
        
        // If we still don't have a good error message, provide a helpful default
        if (errorMsg === 'Unknown error' || errorMsg.includes('unknown')) {
          throw new Error('Sign in failed. Please check your email and password, and ensure you have an internet connection.');
        }
        
        // Re-throw with the extracted message
        throw new Error(errorMsg);
      }
  
      const isSignedIn = signInResult?.isSignedIn ?? false;
      const nextStep = signInResult?.nextStep;
  
      console.log('[AUTH] login: isSignedIn:', isSignedIn, 'nextStep:', nextStep);
  
      // ✅ Handle sign-in success
      if (isSignedIn) {
        console.log('[AUTH] login: User is signed in, loading user data...');
        try {
          await loadUser();
          console.log('[AUTH] login: ✅ Login successful - user session loaded');
          return;
        } catch (loadError: any) {
          console.error('[AUTH] login: Error loading user after sign-in:', loadError?.message);
          // Even if loadUser fails, sign-in was successful, so try to continue
          // The user state will be updated on next app load
          throw new Error('Sign in successful, but could not load user data. Please try again.');
        }
      }
  
      // ⚙️ Handle additional required steps (like verification or new password)
      if (nextStep?.signInStep) {
        console.log('[AUTH] login: Additional step required:', nextStep.signInStep);
        
        if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          throw new Error('New password required. Please reset your password.');
        } else if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
          throw new Error('Account verification required. Please check your email.');
        } else if (nextStep.signInStep === 'RESET_PASSWORD') {
          throw new Error('Password reset required. Please check your email.');
        }
      }
  
      // ❌ If not signed in and no next step, fail explicitly
      console.error('[AUTH] login: Sign-in result indicates failure without next step.');
      throw new Error('Sign in failed. Please check your email and password.');
  
    } catch (error: any) {
      console.error('[AUTH] login: Error during login process');
      console.error('[AUTH] login: Error object:', error);
      
      // Extract error message safely
      let errorMsg = '';
      try {
        errorMsg = 
          error?.message ||
          error?.name ||
          error?.code ||
          (typeof error === 'string' ? error : error?.toString?.() || '');
      } catch {
        errorMsg = 'Unknown error occurred';
      }
  
      console.log('[AUTH] login: Extracted error message:', errorMsg);
  
      // 💬 Map to user-friendly message based on Cognito/Amplify error codes
      let errorMessage = 'Failed to sign in. Please check your email and password.';
  
      // Network/Connection errors (important for Expo)
      if (
        errorMsg.includes('Network') ||
        errorMsg.includes('network') ||
        errorMsg.includes('fetch') ||
        errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ENOTFOUND')
      ) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      }
      // Authentication errors
      else if (
        errorMsg.includes('NotAuthorizedException') ||
        errorMsg.includes('Incorrect username or password') ||
        errorMsg.includes('Incorrect username') ||
        errorMsg.includes('Incorrect password') ||
        errorMsg.includes('Invalid credentials')
      ) {
        errorMessage = 'Incorrect email or password. Please try again.';
      }
      // User not found
      else if (
        errorMsg.includes('UserNotFoundException') ||
        errorMsg.includes('User does not exist') ||
        errorMsg.includes('does not exist')
      ) {
        errorMessage = 'No account found with this email. Please sign up first.';
      }
      // Verification required
      else if (
        errorMsg.includes('UserNotConfirmedException') ||
        errorMsg.includes('verification') ||
        errorMsg.includes('not confirmed') ||
        errorMsg.includes('CONFIRM_SIGN_UP')
      ) {
        errorMessage = 'Account verification required. Please check your email.';
      }
      // Too many attempts
      else if (
        errorMsg.includes('TooManyFailedAttemptsException') ||
        errorMsg.includes('Attempt limit exceeded') ||
        errorMsg.includes('rate limit')
      ) {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }
      // Use actual error message if it's meaningful
      else if (errorMsg && errorMsg !== 'Unknown' && !errorMsg.toLowerCase().includes('unknown')) {
        errorMessage = errorMsg;
      }
  
      console.log('[AUTH] login: Final error message to show:', errorMessage);
      throw new Error(errorMessage);
    }
  };
  
  const signup = async (email: string, password: string, name: string, username: string) => {
    console.log('[AUTH] signup: Starting signup process');
    console.log('[AUTH] signup: Email:', email);
    console.log('[AUTH] signup: Name:', name);
    console.log('[AUTH] signup: Username:', username);
    console.log('[AUTH] signup: NOTE - Email and username are already validated in handleSubmit before this function is called');
    
    try {
      // Remove @ symbol if present
      let cleanedUsername = username.replace(/^@+/, '');
      
      // Remove AF suffix if present (case-insensitive)
      cleanedUsername = cleanedUsername.replace(/af$/i, '');
      
      // Use lowercase and trim
      cleanedUsername = cleanedUsername.toLowerCase().trim();
      
      console.log('[AUTH] signup: Cleaned username (no @, no AF):', cleanedUsername);

      // Use the cleaned username as Cognito username (no @, no AF suffix)
      const cognitoUsername = cleanedUsername;
      console.log('[AUTH] signup: Cognito username:', cognitoUsername);

      // Store username (with @ for display) and Cognito username mapping in AsyncStorage
      console.log('[AUTH] signup: Storing username in AsyncStorage...');
      await setStoredUsername(email, `@${cleanedUsername}`);
      await setCognitoUsername(email, cognitoUsername);
      console.log('[AUTH] signup: Username and Cognito username stored in AsyncStorage');

      // IMPORTANT: Email is validated in Auth.tsx handleSubmit before this function is called
      // Username uniqueness will be checked by Cognito during signup
      // The flow is: handleSubmit checks email (Lambda) → then calls this signup function → Cognito checks username

      console.log('[AUTH] signup: Proceeding to Cognito signUp() (email validated, Cognito will check username uniqueness)...');
      const { userId, nextStep } = await signUp({
        username: cognitoUsername, // Use actual username (without @) as Cognito username
        password,
        options: {
          userAttributes: {
            email,
            name,
            // Custom attributes removed - will be added later
          },
        },
      });
      console.log('[AUTH] signup: signUp() completed, userId:', userId, 'nextStep:', nextStep);

      // If email verification is required, return verification info
      if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        console.log('[AUTH] signup: Email verification required');
        return { requiresVerification: true, username: cognitoUsername, email };
      }

      // If auto-confirmed, sign in the user
      if (nextStep.signUpStep === 'DONE') {
        console.log('[AUTH] signup: Account auto-confirmed, signing in user...');
        // Sign in with the Cognito username, not email
        await signIn({ username: cognitoUsername, password });
        console.log('[AUTH] signup: User signed in, loading user data...');
        await loadUser();
        console.log('[AUTH] signup: Signup and login completed successfully');
      }
    } catch (error: any) {
      console.error('[AUTH] signup: Error during signup:', error.message);
      console.error('[AUTH] signup: Error details:', error);
      
      // Check if it's a username conflict error from Cognito
      const errorMessage = error.message || '';
      if (errorMessage.includes('UsernameExistsException') || 
          errorMessage.includes('already exists') ||
          errorMessage.includes('An account with the given username')) {
        throw new Error('This username is already taken. Please choose another.');
      }
      
      throw new Error(errorMessage || 'Failed to create account');
    }
  };

  const confirmSignUpVerification = async (username: string, confirmationCode: string, password: string, email?: string) => {
    console.log('[AUTH] confirmSignUp: Starting verification');
    console.log('[AUTH] confirmSignUp: Username:', username);
    console.log('[AUTH] confirmSignUp: Confirmation code length:', confirmationCode.length);
    
    let verificationSucceeded = false;
    
    try {
      console.log('[AUTH] confirmSignUp: Calling Cognito confirmSignUp()...');
      const { isSignUpComplete, nextStep } = await confirmSignUp({
        username,
        confirmationCode,
      });
      console.log('[AUTH] confirmSignUp: confirmSignUp() completed, isSignUpComplete:', isSignUpComplete, 'nextStep:', nextStep);

      if (isSignUpComplete) {
        verificationSucceeded = true;
        console.log('[AUTH] confirmSignUp: ✅ VERIFICATION SUCCEEDED - Account is now verified');
        console.log('[AUTH] confirmSignUp: Verification successful, signing in user...');
        
        // Store the Cognito username mapping for future logins
        if (email) {
          await setCognitoUsername(email, username);
          console.log('[AUTH] confirmSignUp: Stored Cognito username mapping');
        }
        
        // Sign in the user after successful verification - simple approach like Vite version
        console.log('[AUTH] confirmSignUp: Calling signIn with username:', username);
        await signIn({ username, password });
        console.log('[AUTH] confirmSignUp: User signed in, loading user data...');
        await loadUser();
        console.log('[AUTH] confirmSignUp: ✅ Verification and login completed successfully');
      } else {
        console.warn('[AUTH] confirmSignUp: Sign up not complete, nextStep:', nextStep);
        throw new Error('Verification completed but sign up is not complete');
      }
    } catch (error: any) {
      // If verification succeeded, don't throw an error - just log it
      if (verificationSucceeded) {
        console.log('[AUTH] confirmSignUp: ⚠️ Verification succeeded, but encountered error during sign-in process');
        console.log('[AUTH] confirmSignUp: Error details:', error?.message || error);
        console.log('[AUTH] confirmSignUp: Account is verified - user can sign in manually');
        // Don't throw - verification was successful
        return;
      }
      
      // Only throw errors if verification itself failed
      console.error('[AUTH] confirmSignUp: ❌ Error during verification:', error);
      console.error('[AUTH] confirmSignUp: Error message:', error?.message);
      console.error('[AUTH] confirmSignUp: Error name:', error?.name);
      console.error('[AUTH] confirmSignUp: Error stack:', error?.stack);
      
      // Provide better error messages
      let errorMessage = 'Failed to verify account';
      const errorMsg = error?.message || error?.toString() || '';
      
      if (errorMsg.includes('Invalid verification code') || 
          errorMsg.includes('CodeMismatchException') ||
          errorMsg.includes('code mismatch') ||
          errorMsg.includes('incorrect')) {
        errorMessage = 'Invalid verification code. Please check and try again.';
      } else if (errorMsg.includes('ExpiredCodeException') || errorMsg.includes('expired')) {
        errorMessage = 'Verification code has expired. Please request a new code.';
      } else if (errorMsg.includes('NotAuthorizedException') || errorMsg.includes('already used')) {
        errorMessage = 'This code has already been used.';
      } else if (errorMsg.includes('Unknown') || errorMsg.includes('unknown')) {
        // For unknown errors, provide a more helpful message
        errorMessage = 'Unable to verify code. Please check your code and try again.';
      } else if (errorMsg) {
        errorMessage = errorMsg;
      }
      
      throw new Error(errorMessage);
    }
  };

  const logout = async () => {
    console.log('[AUTH] logout: Starting logout process...');
    
    // Capture user email before clearing state
    const userEmail = user?.email;
    
    try {
      console.log('[AUTH] logout: Calling signOut()...');
      await signOut();
      console.log('[AUTH] logout: signOut() completed');
      
      // Clear user state immediately
      setUser(null);
      setSavedItems([]);
      
      // Clear AsyncStorage data for the current user if email exists
      if (userEmail) {
        try {
          await AsyncStorage.removeItem(`username_${userEmail}`);
          await AsyncStorage.removeItem(`cognito_username_${userEmail}`);
          console.log('[AUTH] logout: Cleared AsyncStorage data for:', userEmail);
        } catch (storageError) {
          console.warn('[AUTH] logout: Error clearing AsyncStorage:', storageError);
          // Don't throw - logout should still succeed even if storage clear fails
        }
      }
      
      console.log('[AUTH] logout: User state cleared, logout successful');
    } catch (error: any) {
      console.error('[AUTH] logout: Error during logout:', error.message);
      // Even if signOut fails, clear local state
      setUser(null);
      setSavedItems([]);
      
      // Still try to clear storage
      if (userEmail) {
        try {
          await AsyncStorage.removeItem(`username_${userEmail}`);
          await AsyncStorage.removeItem(`cognito_username_${userEmail}`);
        } catch (storageError) {
          // Ignore storage errors
        }
      }
      
      throw new Error(error.message || 'Failed to sign out');
    }
  };

  const upgradeToPremium = async () => {
    if (!user) return;
    
    // For now, just update local state
    // Will be updated to use custom:PaidPlan attribute when custom attributes are added
    setUser({ ...user, isPremium: true });
  };

  const saveItem = (item: SavedItem) => {
    setSavedItems([item, ...savedItems]);
  };

  const unsaveItem = (id: string) => {
    setSavedItems(savedItems.filter(item => item.id !== id));
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    
    try {
      // Only update name attribute for now (standard attribute)
      // Username and other custom attributes will be added later
      if (updates.name) {
        await updateUserAttribute({
          userAttribute: {
            attributeKey: 'name',
            value: updates.name,
          },
        });
      }
      
      // Update username in AsyncStorage if provided
      if (updates.username && user.email) {
        await setStoredUsername(user.email, updates.username);
      }
      
      // Update local state for other fields (username, etc.) until custom attributes are added
      setUser({ ...user, ...updates });
      
      // Reload user to get updated data from Cognito
      await loadUser();
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update profile');
    }
  };

  const contextValue: AuthContextType = {
    user,
    loading,
    login,
    signup,
    confirmSignUp: confirmSignUpVerification,
    logout,
    upgradeToPremium,
    savedItems,
    saveItem,
    unsaveItem,
    updateProfile,
  };

  console.log('[AUTH] AuthProvider: Rendering with context value, loading:', loading, 'user:', user?.email || 'null');

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.error('[AUTH] useAuth: Called outside of AuthProvider');
    console.error('[AUTH] useAuth: Stack trace:', new Error().stack);
    throw new Error('useAuth must be used within an AuthProvider. Make sure AuthProvider wraps your component tree.');
  }
  return context;
}

