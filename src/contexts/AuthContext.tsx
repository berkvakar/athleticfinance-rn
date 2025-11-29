import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { signUp, signIn, signOut, getCurrentUser, fetchAuthSession, updateUserAttribute, confirmSignUp } from 'aws-amplify/auth';
import { apiClient } from '../lib/api';
import { logger } from '../lib/logger';
import { storeSecure, getSecure, deleteSecure, clearSecureUserData } from '../lib/secureStorage';

interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  isPremium: boolean;
  plan?: string; // 'AF' or 'AF+' or 'AFPlus'
  avatar?: string;
  bio?: string;
  hideProfile?: boolean;
  memberNumber?: string;
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
  profileLoading: boolean; // Track if profile is being fetched
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, username: string) => Promise<{ requiresVerification: boolean; username: string; email: string; userId: string } | void>;
  confirmSignUp: (username: string, confirmationCode: string, password: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  upgradeToPremium: () => Promise<void>;
  savedItems: SavedItem[];
  saveItem: (item: SavedItem) => void;
  unsaveItem: (id: string) => void;
  savedArticleIds: Set<number>; // Set of saved article IDs for quick lookup
  bookmarkArticle: (articleId: number) => Promise<void>;
  unbookmarkArticle: (articleId: number) => Promise<void>;
  refreshSavedArticles: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false); // Track if profile is being fetched
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [savedArticleIds, setSavedArticleIds] = useState<Set<number>>(new Set());
  const profileFetchedRef = useRef(false); // Track if profile has been fetched in background
  
  // SECURITY: Store username in encrypted SecureStore instead of plain AsyncStorage
  const getStoredUsername = async (email: string): Promise<string> => {
    try {
      const stored = await getSecure(`username_${email}`);
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
      await storeSecure(`username_${email}`, username);
    } catch (error) {
      logger.error('[AUTH] Error storing username:', error);
    }
  };

  // SECURITY: Store Cognito username mapping in encrypted SecureStore
  const getCognitoUsername = async (email: string): Promise<string | null> => {
    try {
      return await getSecure(`cognito_username_${email}`);
    } catch (error) {
      return null;
    }
  };
  
  const setCognitoUsername = async (email: string, cognitoUsername: string) => {
    try {
      await storeSecure(`cognito_username_${email}`, cognitoUsername);
    } catch (error) {
      logger.error('[AUTH] Error storing Cognito username:', error);
    }
  };

  // Load user session on mount
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    logger.log('[AUTH] loadUser: Starting to load user session...');
    try {
      // This will throw if user is not authenticated
      logger.log('[AUTH] loadUser: Calling getCurrentUser()...');
      const currentUser = await getCurrentUser();
      logger.log('[AUTH] loadUser: getCurrentUser() succeeded');
      
      // Fetch fresh session (Amplify handles token refresh automatically)
      logger.log('[AUTH] loadUser: Fetching auth session...');
      const session = await fetchAuthSession({ forceRefresh: false });
      logger.log('[AUTH] loadUser: Session fetched, has tokens:', !!session.tokens);
      
      if (currentUser && session.tokens?.idToken) {
        // Extract and log tokens for debugging
        const idToken = session.tokens.idToken;
        const accessToken = session.tokens.accessToken;
        
        if (idToken) {
          const idTokenString = idToken.toString();
          console.log('========================================');
          console.log('🔐 CURRENT SESSION - ID TOKEN:');
          console.log(idTokenString);
          console.log('========================================');
        }
        
        if (accessToken) {
          const accessTokenString = accessToken.toString();
          console.log('========================================');
          console.log('🔑 CURRENT SESSION - ACCESS TOKEN:');
          console.log(accessTokenString);
          console.log('========================================');
          
          const accessTokenPayload = accessToken.payload as any;
          console.log('📋 ACCESS TOKEN PAYLOAD (Decoded):');
          console.log(JSON.stringify(accessTokenPayload, null, 2));
          console.log('========================================');
        }
        
        // Note: Refresh token is not directly accessible in Amplify v6 AuthTokens
        // It's managed internally by Amplify
        console.log('🔄 Token refresh is handled automatically by Amplify');
        
        // Fetch user attributes from ID token payload
        const attributes = session.tokens.idToken.payload as any;
        // SECURITY: Do not log token payload in production
        logger.debug('[AUTH] loadUser: ID token payload:', logger.sanitize(attributes));
        
        const email = attributes.email || '';
        
        // Get the actual Cognito username from the token (this is the real username in Cognito/DynamoDB)
        // Try different possible fields where Cognito might store the username
        const cognitoUsername = 
          attributes['cognito:username'] || 
          attributes.username || 
          currentUser.username ||
          attributes.sub?.split(':').pop() || // Fallback: extract from sub if needed
          null;
        
        console.log('🔍 [AUTH] loadUser: Cognito username from token:', cognitoUsername);
        //console.log('🔍 [AUTH] loadUser: All token attributes:', JSON.stringify(attributes, null, 2));
        
        // Use Cognito username directly, or fallback to stored username
        let usernameToUse: string;
        if (cognitoUsername) {
          // Use the actual Cognito username (add @ for display, but check if it already has @)
          const cleanCognitoUsername = cognitoUsername.startsWith('@') 
            ? cognitoUsername.substring(1) 
            : cognitoUsername;
          usernameToUse = `@${cleanCognitoUsername}`;
          // Store it for future use
          await setStoredUsername(email, usernameToUse);
          await setCognitoUsername(email, cleanCognitoUsername);
          console.log('✅ [AUTH] loadUser: Using Cognito username:', cleanCognitoUsername);
        } else {
          // Fallback to stored username if Cognito username not found
          const storedUsername = await getStoredUsername(email);
          usernameToUse = storedUsername;
          console.log('⚠️ [AUTH] loadUser: Cognito username not found, using stored:', storedUsername);
        }
        
        logger.log('[AUTH] loadUser: User authenticated');
        
        // Base user data from Cognito
        // Extract plan from custom attribute if available, otherwise default to 'AF'
        const planFromAttributes = (attributes['custom:plan'] || attributes.plan) as string | undefined;
        const userData: User = {
          id: currentUser.userId,
          email: email,
          name: attributes.name || '',
          username: usernameToUse,
          plan: planFromAttributes || 'AF', // Default to 'AF' if not set
          isPremium: false, // Will be updated when profile is fetched
        };
        
        logger.log('[AUTH] loadUser: User loaded successfully');
        setUser(userData);
        
        // Immediately fetch extended profile data after user is loaded
        // This ensures profile data is available before ProfileScreen renders
        // Pass userData directly to avoid race condition with state update
        if (!profileFetchedRef.current) {
          profileFetchedRef.current = true;
          logger.log('[AUTH] loadUser: Starting profile fetch immediately after user load...');
          logger.log('[AUTH] loadUser: Passing userData directly to refreshProfile to avoid race condition');
          setProfileLoading(true);
          // Pass userData directly since setUser() is async and user state won't be updated yet
          refreshProfile(userData)
            .then(() => {
              logger.log('[AUTH] loadUser: Profile fetch completed');
              setProfileLoading(false);
              // Load saved articles after profile is loaded
              refreshSavedArticles().catch((error) => {
                logger.error('[AUTH] loadUser: Failed to load saved articles:', error);
              });
            })
            .catch((error) => {
              logger.error('[AUTH] loadUser: Profile fetch failed:', error);
              profileFetchedRef.current = false; // Allow retry
              setProfileLoading(false);
            });
        } else {
          // If profile was already fetched, just load saved articles
          refreshSavedArticles().catch((error) => {
            logger.error('[AUTH] loadUser: Failed to load saved articles:', error);
          });
        }
      } else {
        logger.log('[AUTH] loadUser: No valid session tokens, setting user to null');
        setUser(null);
        profileFetchedRef.current = false; // Reset flag when user logs out
        setProfileLoading(false);
      }
    } catch (error: any) {
      // User not authenticated - clear any stale data
      logger.log('[AUTH] loadUser: User not authenticated, clearing user state');
      setUser(null);
      profileFetchedRef.current = false; // Reset flag
      setProfileLoading(false);
    } finally {
      setLoading(false);
      logger.log('[AUTH] loadUser: Finished loading user');
    }
  };

  const login = async (email: string, password: string) => {
    logger.log('[AUTH] login: Starting login');
    
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
          logger.log('[AUTH] login: Found stored Cognito username');
        }
      } catch (e) {
        logger.warn('[AUTH] login: Could not fetch Cognito username, using email instead');
      }
  
      logger.log('[AUTH] login: Calling signIn() with Amplify v6 (Expo compatible)...');
  
      // Call signIn with proper error handling for Expo/Amplify v6
      let signInResult;
      try {
        // For Expo/Amplify v6 compatibility, ensure we're using the correct API
        signInResult = await signIn({ 
          username: loginIdentifier, 
          password: password 
        });
        logger.log('[AUTH] login: signIn() completed successfully');
        logger.debug('[AUTH] login: signIn result:', logger.sanitize(signInResult));
      } catch (signInError: any) {
        // Log detailed error for debugging Expo/Amplify issues
        logger.error('[AUTH] login: signIn() threw an error');
        logger.error('[AUTH] login: Error:', signInError?.message || signInError);
        
        // Try to extract more error details from Amplify error structure
        let errorDetails = '';
        try {
          // Check for nested error properties (common in Amplify errors)
          if (signInError?.underlyingError) {
            errorDetails = signInError.underlyingError?.message || signInError.underlyingError?.toString() || '';
          }
          if (signInError?.cause) {
            errorDetails = signInError.cause?.message || signInError.cause?.toString() || errorDetails;
          }
          if (signInError?.errors && Array.isArray(signInError.errors)) {
            errorDetails = signInError.errors.map((e: any) => e?.message || e?.toString()).join(', ') || errorDetails;
          }
        } catch (extractError) {
          logger.error('[AUTH] login: Error extracting error details');
        }
        
        // Build comprehensive error message
        const errorMsg = 
          signInError?.message || 
          errorDetails ||
          signInError?.name || 
          signInError?.code ||
          signInError?.toString?.() || 
          'Unknown error';
        
        logger.error('[AUTH] login: Error message:', errorMsg);
        
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
  
      logger.log('[AUTH] login: isSignedIn:', isSignedIn);
  
      // ✅ Handle sign-in success
      if (isSignedIn) {
        logger.log('[AUTH] login: User is signed in, fetching Cognito tokens...');
        
        try {
          // Fetch auth session to get Cognito tokens
          const session = await fetchAuthSession({ forceRefresh: true });
          
          // Extract ID Token and Access Token
          const idToken = session.tokens?.idToken;
          const accessToken = session.tokens?.accessToken;
          
          // Log token strings (actual JWT tokens)
          if (idToken) {
            const idTokenString = idToken.toString();
            console.log('========================================');
            console.log('🔐 COGNITO ID TOKEN (JWT String):');
            console.log(idTokenString);
            console.log('========================================');
            
            // Log decoded ID token payload
            const idTokenPayload = idToken.payload as any;
            console.log('📋 ID TOKEN PAYLOAD (Decoded):');
            console.log(JSON.stringify(idTokenPayload, null, 2));
            console.log('========================================');
          } else {
            console.warn('⚠️ ID Token not available');
          }
          
          if (accessToken) {
            const accessTokenString = accessToken.toString();
            console.log('========================================');
            console.log('🔑 COGNITO ACCESS TOKEN (JWT String):');
            console.log(accessTokenString);
            console.log('========================================');
            
            // Log decoded access token payload
            const accessTokenPayload = accessToken.payload as any;
            console.log('📋 ACCESS TOKEN PAYLOAD (Decoded):');
            console.log(JSON.stringify(accessTokenPayload, null, 2));
            console.log('========================================');
          } else {
            console.warn('⚠️ Access Token not available');
          }
          
          // Log token expiration info
          if (idToken) {
            const expirationDate = new Date((idToken.payload as any).exp * 1000);
            const now = new Date();
            const timeUntilExpiry = expirationDate.getTime() - now.getTime();
            const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
            console.log('⏰ ID Token expires at:', expirationDate.toISOString());
            console.log('⏰ ID Token expires in:', minutesUntilExpiry, 'minutes');
          }
          if (accessToken) {
            const expirationDate = new Date((accessToken.payload as any).exp * 1000);
            const now = new Date();
            const timeUntilExpiry = expirationDate.getTime() - now.getTime();
            const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
            console.log('⏰ Access Token expires at:', expirationDate.toISOString());
            console.log('⏰ Access Token expires in:', minutesUntilExpiry, 'minutes');
          }
          
          // Note: Refresh token is not directly accessible in Amplify v6 AuthTokens
          // It's managed internally by Amplify
          console.log('🔄 Token refresh is handled automatically by Amplify');
          console.log('========================================');
          
          logger.log('[AUTH] login: Cognito tokens logged, fetching user profile from backend...');
          
          // Call /api/profile endpoint to sync authenticated user
          try {
            const userId = (idToken?.payload as any)?.sub || (accessToken?.payload as any)?.sub;
            logger.log(
              `[AUTH] login: Calling /api/profile${userId ? ` for user ${userId}` : ''}`
            );
            await apiClient.callProfileEndpoint();
            logger.log('[AUTH] login: Profile endpoint called successfully');
          } catch (profileError: any) {
            logger.warn('[AUTH] login: Error calling profile endpoint:', profileError);
            // Continue with login even if profile endpoint call fails
          }
          
          logger.log('[AUTH] login: Loading user data...');
          await loadUser();
          logger.log('[AUTH] login: Login successful');
          return;
        } catch (loadError: any) {
          logger.error('[AUTH] login: Error loading user after sign-in');
          // Even if loadUser fails, sign-in was successful, so try to continue
          // The user state will be updated on next app load
          throw new Error('Sign in successful, but could not load user data. Please try again.');
        }
      }
  
      // ⚙️ Handle additional required steps (like verification or new password)
      if (nextStep?.signInStep) {
        logger.log('[AUTH] login: Additional step required:', nextStep.signInStep);
        
        if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          throw new Error('New password required. Please reset your password.');
        } else if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
          throw new Error('Account verification required. Please check your email.');
        } else if (nextStep.signInStep === 'RESET_PASSWORD') {
          throw new Error('Password reset required. Please check your email.');
        }
      }
  
      // ❌ If not signed in and no next step, fail explicitly
      logger.error('[AUTH] login: Sign-in result indicates failure without next step.');
      throw new Error('Sign in failed. Please check your email and password.');
  
    } catch (error: any) {
      logger.error('[AUTH] login: Error during login process:', error?.message || error);
      
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
  
      throw new Error(errorMessage);
    }
  };
  
  const signup = async (email: string, password: string, name: string, username: string) => {
    logger.log('[AUTH] signup: Starting signup process');
    logger.log('[AUTH] signup: Email and username validated');
    
    try {
      // Remove @ symbol if present
      let cleanedUsername = username.replace(/^@+/, '');
      
      // Remove AF suffix if present (case-insensitive)
      cleanedUsername = cleanedUsername.replace(/af$/i, '');
      
      // Use lowercase and trim
      cleanedUsername = cleanedUsername.toLowerCase().trim();
      
      logger.log('[AUTH] signup: Username cleaned and validated');

      // Use the cleaned username as Cognito username (no @, no AF suffix)
      const cognitoUsername = cleanedUsername;

      // Store username (with @ for display) and Cognito username mapping in AsyncStorage
      logger.log('[AUTH] signup: Storing username in AsyncStorage...');
      await setStoredUsername(email, `@${cleanedUsername}`);
      await setCognitoUsername(email, cognitoUsername);
      logger.log('[AUTH] signup: Username stored in AsyncStorage');

      // IMPORTANT: Email is validated in Auth.tsx handleSubmit before this function is called
      // Username uniqueness will be checked by Cognito during signup
      // The flow is: handleSubmit checks email (Lambda) → then calls this signup function → Cognito checks username

      logger.log('[AUTH] signup: Proceeding to Cognito signUp()');
      const { userId, nextStep } = await signUp({
        username: cognitoUsername, // Use actual username (without @) as Cognito username
        password,
        options: {
          userAttributes: {
            email,
            name, // Combined firstName + surname
            // Custom attribute: plan set to 'AF' for all initial signups
            'custom:plan': 'AF',
          },
        },
      });
      
      // userId should always be present from signUp, but handle undefined case
      if (!userId) {
        throw new Error('Failed to get user ID from signup');
      }
      
      logger.log('[AUTH] signup: signUp() completed, userId:', userId);

      // Send username and userId to backend to start 5-minute timer
      logger.log('[AUTH] signup: Sending user info to backend to start verification timer...');
      try {
        await apiClient.registerUserForVerification({
          userId,
          username: cognitoUsername,
        });
        logger.log('[AUTH] signup: User info sent to backend successfully');
      } catch (backendError: any) {
        logger.error('[AUTH] signup: Error sending user info to backend:', backendError);
        // Don't fail the signup if backend call fails - user is already in Cognito
        // Log the error but continue with the flow
      }

      // If email verification is required, return verification info
      if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        logger.log('[AUTH] signup: Email verification required');
        return { requiresVerification: true, username: cognitoUsername, email, userId };
      }

      // If auto-confirmed, sign in the user
      if (nextStep.signUpStep === 'DONE') {
        logger.log('[AUTH] signup: Account auto-confirmed, signing in user...');
        // Sign in with the Cognito username, not email
        await signIn({ username: cognitoUsername, password });
        logger.log('[AUTH] signup: User signed in, calling profile endpoint...');
        
        // Call /api/profile endpoint
        try {
          logger.log('[AUTH] signup: Calling /api/profile for authenticated user');
          await apiClient.callProfileEndpoint();
          logger.log('[AUTH] signup: Profile endpoint called successfully');
        } catch (profileError: any) {
          logger.warn('[AUTH] signup: Error calling profile endpoint:', profileError);
          // Continue with signup even if profile endpoint call fails
        }
        
        // Fetch user profile from backend using the new endpoint
        try {
          const profileResponse = await apiClient.getUserProfile();
          
          if (profileResponse.success && profileResponse.profile && profileResponse.userInfo) {
            logger.log('[AUTH] signup: User profile fetched from backend successfully');
            console.log('📋 [AUTH] signup: Profile data:', JSON.stringify(profileResponse.profile, null, 2));
            console.log('📋 [AUTH] signup: User info:', JSON.stringify(profileResponse.userInfo, null, 2));
          } else {
            logger.warn('[AUTH] signup: Could not fetch profile from backend:', profileResponse.error);
          }
        } catch (profileError: any) {
          logger.warn('[AUTH] signup: Error fetching profile from backend:', profileError);
          // Continue with signup even if profile fetch fails
        }
        
        logger.log('[AUTH] signup: Loading user data...');
        await loadUser();
        logger.log('[AUTH] signup: Signup and login completed successfully');
      }
    } catch (error: any) {
      // Check if it's a username conflict error from Cognito
      const errorMessage = error.message || '';
      const isUsernameConflict = errorMessage.includes('UsernameExistsException') || 
          errorMessage.includes('already exists') ||
          errorMessage.includes('An account with the given username') ||
          errorMessage.includes('User already exists');
      
      // Only log errors that are NOT username conflicts (we use these errors to check username availability)
      if (!isUsernameConflict) {
        logger.error('[AUTH] signup: Error during signup:', error?.message || error);
      }
      
      if (isUsernameConflict) {
        throw new Error('This username is already taken. Please choose another.');
      }
      
      throw new Error(errorMessage || 'Failed to create account');
    }
  };

  const confirmSignUpVerification = async (username: string, confirmationCode: string, password: string, email?: string) => {
    logger.log('[AUTH] confirmSignUp: Starting verification');
    
    let verificationSucceeded = false;
    
    try {
      logger.log('[AUTH] confirmSignUp: Calling Cognito confirmSignUp()...');
      const { isSignUpComplete, nextStep } = await confirmSignUp({
        username,
        confirmationCode,
      });
      logger.log('[AUTH] confirmSignUp: confirmSignUp() completed');
      logger.log('[AUTH] confirmSignUp: isSignUpComplete:', isSignUpComplete);

      if (isSignUpComplete) {
        verificationSucceeded = true;
        logger.log('[AUTH] confirmSignUp: Verification succeeded, signing in user...');
        
        // Store the Cognito username mapping for future logins
        if (email) {
          await setCognitoUsername(email, username);
          logger.log('[AUTH] confirmSignUp: Stored Cognito username mapping');
        }
        
        // Sign in the user after successful verification - simple approach like Vite version
        await signIn({ username, password });
        logger.log('[AUTH] confirmSignUp: User signed in, fetching user info...');
        
        // Call /api/profile endpoint to sync authenticated user
        try {
          let userId: string | null = null;
          try {
            const session = await fetchAuthSession({ forceRefresh: false });
            const idToken = session.tokens?.idToken;
            if (idToken) {
              userId = (idToken.payload as any)?.sub || null;
            }
          } catch (error) {
            logger.warn('[AUTH] confirmSignUp: Could not get userId from session');
          }
          
          logger.log(
            `[AUTH] confirmSignUp: Calling /api/profile${userId ? ` for user ${userId}` : ''}`
          );
          await apiClient.callProfileEndpoint();
          logger.log('[AUTH] confirmSignUp: Profile endpoint called successfully');
        } catch (profileError: any) {
          logger.warn('[AUTH] confirmSignUp: Error calling profile endpoint:', profileError);
          // Continue with confirmation even if profile endpoint call fails
        }
        
        // Fetch user profile from backend using the new endpoint
        try {
          const profileResponse = await apiClient.getUserProfile();
          
          if (profileResponse.success && profileResponse.profile && profileResponse.userInfo) {
            logger.log('[AUTH] confirmSignUp: User profile fetched from backend successfully');
            console.log('📋 [AUTH] confirmSignUp: Profile data:', JSON.stringify(profileResponse.profile, null, 2));
            console.log('📋 [AUTH] confirmSignUp: User info:', JSON.stringify(profileResponse.userInfo, null, 2));
          } else {
            logger.warn('[AUTH] confirmSignUp: Could not fetch profile from backend:', profileResponse.error);
          }
        } catch (profileError: any) {
          logger.warn('[AUTH] confirmSignUp: Error fetching profile from backend:', profileError);
          // Continue with confirmation even if profile fetch fails
        }
        
        logger.log('[AUTH] confirmSignUp: Loading user data...');
        await loadUser();
        logger.log('[AUTH] confirmSignUp: Verification and login completed successfully');
      } else {
        logger.warn('[AUTH] confirmSignUp: Sign up not complete');
        throw new Error('Verification completed but sign up is not complete');
      }
    } catch (error: any) {
      // If verification succeeded, don't throw an error - just log it
      if (verificationSucceeded) {
        logger.log('[AUTH] confirmSignUp: Verification succeeded, but encountered error during sign-in process');
        logger.log('[AUTH] confirmSignUp: Account is verified - user can sign in manually');
        // Don't throw - verification was successful
        return;
      }
      
      // Only throw errors if verification itself failed
      logger.error('[AUTH] confirmSignUp: Error during verification:', error?.message || error);
      logger.error('[AUTH] confirmSignUp: Error name:', error?.name);
      logger.error('[AUTH] confirmSignUp: Full error object:', JSON.stringify(error, null, 2));
      
      // Provide better error messages
      let errorMessage = 'Failed to verify account';
      const errorMsg = error?.message || error?.toString() || '';
      const errorName = error?.name || '';
      
      // Check for user deletion (by cleanup Lambda) - UserNotFoundException
      if (errorName === 'UserNotFoundException' || 
          errorMsg.includes('UserNotFoundException') ||
          errorMsg.includes('User does not exist') ||
          errorMsg.includes('not found') ||
          errorMsg.includes('does not exist')) {
        logger.log('[AUTH] confirmSignUp: User not found - likely deleted by cleanup Lambda');
        throw new Error('USER_NOT_FOUND');
      }
      
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
    logger.log('[AUTH] logout: Starting logout process...');
    
    // Capture user email before clearing state
    const userEmail = user?.email;
    
    try {
      logger.log('[AUTH] logout: Calling signOut()...');
      await signOut();
      logger.log('[AUTH] logout: signOut() completed');
      
      // Clear user state immediately
      setUser(null);
      setSavedItems([]);
      setSavedArticleIds(new Set());
      
      // SECURITY: Clear SecureStore data for the current user if email exists
      if (userEmail) {
        try {
          await clearSecureUserData(userEmail);
          logger.log('[AUTH] logout: Cleared secure storage data');
        } catch (storageError) {
          logger.warn('[AUTH] logout: Error clearing secure storage');
          // Don't throw - logout should still succeed even if storage clear fails
        }
      }
      
      logger.log('[AUTH] logout: User state cleared, logout successful');
    } catch (error: any) {
      logger.error('[AUTH] logout: Error during logout:', error?.message || error);
      // Even if signOut fails, clear local state
      setUser(null);
      setSavedItems([]);
      setSavedArticleIds(new Set());
      
      // Still try to clear secure storage
      if (userEmail) {
        try {
          await clearSecureUserData(userEmail);
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

  // Refresh saved articles from the API
  const refreshSavedArticles = async () => {
    if (!user) {
      setSavedArticleIds(new Set());
      return;
    }

    try {
      const result = await apiClient.getSavedArticles();
      if (result.success && result.articles) {
        const articleIds = new Set(result.articles.map(article => article.id));
        setSavedArticleIds(articleIds);
      } else {
        setSavedArticleIds(new Set());
      }
    } catch (error) {
      logger.error('[AUTH] refreshSavedArticles error:', error);
      setSavedArticleIds(new Set());
    }
  };

  // Bookmark an article
  const bookmarkArticle = async (articleId: number) => {
    if (!user) return;

    try {
      const result = await apiClient.bookmarkArticle(articleId);
      if (result.success) {
        // Optimistically update the state
        setSavedArticleIds(prev => new Set([...prev, articleId]));
        // Refresh from API to ensure consistency
        await refreshSavedArticles();
      } else {
        throw new Error(result.error || 'Failed to bookmark article');
      }
    } catch (error: any) {
      logger.error('[AUTH] bookmarkArticle error:', error);
      // Revert optimistic update on error
      await refreshSavedArticles();
      throw error;
    }
  };

  // Unbookmark an article
  const unbookmarkArticle = async (articleId: number) => {
    if (!user) return;

    try {
      const result = await apiClient.unbookmarkArticle(articleId);
      if (result.success) {
        // Optimistically update the state
        setSavedArticleIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(articleId);
          return newSet;
        });
        // Refresh from API to ensure consistency
        await refreshSavedArticles();
      } else {
        throw new Error(result.error || 'Failed to unbookmark article');
      }
    } catch (error: any) {
      logger.error('[AUTH] unbookmarkArticle error:', error);
      // Revert optimistic update on error
      await refreshSavedArticles();
      throw error;
    }
  };

  const refreshProfile = async (userOverride?: User) => {
    // Use provided user or state user
    const userToUse = userOverride || user;
    if (!userToUse) {
      logger.warn('[AUTH] refreshProfile: No user, skipping profile fetch');
      return;
    }
    
    try {
      logger.log('[AUTH] refreshProfile: Fetching profile from backend...');
      logger.log('[AUTH] refreshProfile: Calling apiClient.getUserProfile()...');
      const profileResponse = await apiClient.getUserProfile();
      logger.log('[AUTH] refreshProfile: getUserProfile response received:', {
        success: profileResponse.success,
        hasProfile: !!profileResponse.profile,
        hasError: !!profileResponse.error,
      });
      
      if (profileResponse.success && profileResponse.profile) {
        logger.log('[AUTH] refreshProfile: Profile fetched successfully');
        
        // Log the full profile response to see what data we're getting
        console.log('[AUTH] refreshProfile: Full profile response:', JSON.stringify(profileResponse, null, 2));
        
        const profile = profileResponse.profile;
        const userInfo = profileResponse.userInfo;
        
        // Handle nested profile structure (API sometimes returns profile.profile)
        const actualProfile = (profile as any)?.profile || profile;
        
        // Extract member number from various possible field names and locations
        // Check actual profile object first, then nested profile, then userInfo, then root response
        const userInfoAny = userInfo as any;
        const userNumber = 
          actualProfile.userNumber ?? 
          actualProfile.memberNumber ?? 
          actualProfile.user_number ??
          actualProfile.member_number ??
          (profile as any)?.userNumber ??
          (profile as any)?.memberNumber ??
          (profile as any)?.user_number ??
          (profile as any)?.member_number ??
          userInfoAny?.userNumber ??
          userInfoAny?.memberNumber ??
          userInfoAny?.user_number ??
          userInfoAny?.member_number ??
          (profileResponse as any).userNumber ??
          (profileResponse as any).memberNumber ??
          (profileResponse as any).user_number ??
          (profileResponse as any).member_number;
        
        const memberNumberStr = userNumber !== null && userNumber !== undefined ? String(userNumber) : undefined;
        
        console.log('[AUTH] refreshProfile: Full profile object:', JSON.stringify(profile, null, 2));
        console.log('[AUTH] refreshProfile: Actual profile (after unwrapping):', JSON.stringify(actualProfile, null, 2));
        console.log('[AUTH] refreshProfile: userInfo object:', JSON.stringify(userInfo, null, 2));
        console.log('[AUTH] refreshProfile: Extracted userNumber/memberNumber:', userNumber);
        console.log('[AUTH] refreshProfile: Member number string:', memberNumberStr);
        console.log('[AUTH] refreshProfile: Profile keys:', Object.keys(profile));
        console.log('[AUTH] refreshProfile: Actual profile keys:', Object.keys(actualProfile));
        console.log('[AUTH] refreshProfile: userInfo keys:', userInfo ? Object.keys(userInfo) : 'null');
        
        // Get avatar URL - convert S3 key to URL if needed (safety check)
        let avatarUrl = actualProfile.profilePicUrl || actualProfile.profilePicture || actualProfile.avatar || 
                       profile.profilePicUrl || profile.profilePicture || profile.avatar || undefined;
        
        // Safety check: if avatar is an S3 key (doesn't start with http), convert it
        // This should rarely happen if getUserProfile works correctly, but add as fallback
        if (avatarUrl && typeof avatarUrl === 'string' && !avatarUrl.startsWith('http')) {
          logger.warn('[AUTH] refreshProfile: Avatar is S3 key, converting to URL (fallback)');
          try {
            const urlResult = await apiClient.getProfilePictureUrl(avatarUrl);
            if (urlResult.success && urlResult.url) {
              avatarUrl = urlResult.url;
              logger.log('[AUTH] refreshProfile: Successfully converted S3 key to URL in fallback');
            } else {
              logger.warn('[AUTH] refreshProfile: Failed to convert S3 key in fallback, setting to null');
              avatarUrl = null;
            }
          } catch (error: any) {
            logger.error('[AUTH] refreshProfile: Error converting S3 key in fallback:', error);
            avatarUrl = null;
          }
        }
        
        // Get current user state (may have been updated since we started)
        setUser((currentUser) => {
          if (!currentUser) return currentUser;
          
          // Merge backend profile data with current user data
          // Use actualProfile for all field access since API may return nested structure
          // API returns: activity, createdAt, email, plan, profilePicUrl, savedArticles, 
          // savedComments, statistics, updatedAt, username, userNumber
          const updatedUser: User = {
            ...currentUser,
            // Bio/description - check if API returns description field (may not be in your list)
            bio: actualProfile.description || actualProfile.bio || profile.description || profile.bio || undefined,
            // Avatar - should already be converted to URL above
            avatar: avatarUrl,
            hideProfile: actualProfile.hideProfile || profile.hideProfile || false,
            // Username - API returns username (without @)
            username: (actualProfile.username || profile.username)
              ? ((actualProfile.username || profile.username).startsWith('@') 
                  ? (actualProfile.username || profile.username) 
                  : `@${actualProfile.username || profile.username}`)
              : currentUser.username,
            // Plan - API returns plan ('AF', 'AF+', 'AFPlus', etc.)
            plan: userInfo?.plan || actualProfile.plan || profile.plan || 'AF',
            // Premium status - API returns plan ('AF' = free, anything else = premium)
            isPremium: (userInfo?.plan && userInfo.plan !== 'AF') || 
                      (actualProfile.plan && actualProfile.plan !== 'AF') ||
                      (profile.plan && profile.plan !== 'AF') ||
                      actualProfile.isPremium || profile.isPremium || false,
            // Member number - API returns userNumber
            memberNumber: memberNumberStr,
          };
          
          logger.log('[AUTH] refreshProfile: User data updated successfully');
          console.log('[AUTH] refreshProfile: Updated user object:', {
            id: updatedUser.id,
            username: updatedUser.username,
            bio: updatedUser.bio,
            avatar: updatedUser.avatar,
            memberNumber: updatedUser.memberNumber,
            isPremium: updatedUser.isPremium,
          });
          return updatedUser;
        });
      } else {
        logger.warn('[AUTH] refreshProfile: Could not fetch profile:', profileResponse.error);
      }
    } catch (error: any) {
      logger.error('[AUTH] refreshProfile: Error fetching profile:', error);
      throw error; // Re-throw so caller knows it failed
    }
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
      
      // Update local state immediately for all fields (avatar, bio, etc.)
      // This ensures UI updates instantly before any backend sync
      setUser((currentUser) => {
        if (!currentUser) return currentUser;
        return { ...currentUser, ...updates };
      });
      
      // Only reload from Cognito if we updated name (which is in Cognito)
      // Don't reload for avatar/bio as they're not in Cognito and loadUser() would overwrite them
      if (updates.name) {
        await loadUser();
        // After loadUser, restore the avatar/bio updates since loadUser doesn't have them
        if (updates.avatar !== undefined || updates.bio !== undefined) {
          setUser((currentUser) => {
            if (!currentUser) return currentUser;
            return { ...currentUser, ...updates };
          });
        }
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update profile');
    }
  };

  const contextValue: AuthContextType = {
    user,
    loading,
    profileLoading,
    login,
    signup,
    confirmSignUp: confirmSignUpVerification,
    logout,
    upgradeToPremium,
    savedItems,
    saveItem,
    unsaveItem,
    savedArticleIds,
    bookmarkArticle,
    unbookmarkArticle,
    refreshSavedArticles,
    updateProfile,
    refreshProfile,
  };

  logger.log('[AUTH] AuthProvider: Rendering');

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    logger.error('[AUTH] useAuth: Called outside of AuthProvider');
    throw new Error('useAuth must be used within an AuthProvider. Make sure AuthProvider wraps your component tree.');
  }
  return context;
}

