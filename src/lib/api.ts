import { fetchAuthSession } from 'aws-amplify/auth';
import Constants from 'expo-constants';
import { logger } from './logger';

// Get API Gateway URL from environment (preferred) or app.config extra
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_GATEWAY_URL ||
  Constants.expoConfig?.extra?.apiGatewayUrl ||
  '';

if (!API_BASE_URL) {
  logger.warn('[API] Missing EXPO_PUBLIC_API_GATEWAY_URL; API requests will fail until it is set.');
} else {
  logger.log('[API] Using API base URL:', logger.sanitize(API_BASE_URL));
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
  private unauthorizedHandler?: () => Promise<void> | void;

  setUnauthorizedHandler(handler: () => Promise<void> | void) {
    this.unauthorizedHandler = handler;
  }

  private async handleUnauthorized() {
    logger.warn('[API] Received 401 Unauthorized from backend');
    if (this.unauthorizedHandler) {
      try {
        await this.unauthorizedHandler();
      } catch (handlerError) {
        logger.error('[API] Unauthorized handler threw an error', handlerError);
      }
    }
  }

  /**
   * SECURITY: Sanitize error messages to prevent information disclosure
   * Remove technical details, file paths, stack traces, etc.
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove file paths
    message = message.replace(/\/[^\s]+/g, '[path]');
    message = message.replace(/C:\\[^\s]+/g, '[path]');
    
    // Remove stack traces
    message = message.replace(/at\s+[^\n]+/g, '');
    
    // Remove technical error codes/IDs
    message = message.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[error-id]');
    
    // Map technical errors to user-friendly messages
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return 'Unable to connect to server. Please check your internet connection.';
    }
    
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return 'Request timed out. Please try again.';
    }
    
    if (message.includes('500') || message.includes('Internal Server Error')) {
      return 'Server error. Please try again later.';
    }
    
    if (message.includes('503') || message.includes('Service Unavailable')) {
      return 'Service temporarily unavailable. Please try again later.';
    }
    
    // Return sanitized message (first sentence only, max 100 chars)
    const firstSentence = message.split('.')[0].trim();
    return firstSentence.substring(0, 100);
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      // Only fetch auth session if user is signed in
      // This prevents unnecessary token fetching before authentication
      const session = await fetchAuthSession({ forceRefresh: false });
      
      const idToken = session.tokens?.idToken;
      const accessToken = session.tokens?.accessToken;
      
      // If no tokens available, return basic headers (user not signed in)
      if (!idToken && !accessToken) {
        logger.log('[API] No auth tokens available - user not signed in');
        return {
          'Content-Type': 'application/json',
        };
      }
      
      console.log('========================================');
      console.log('🔍 [API] Using auth tokens for API request');
      
      // Log ID Token
      if (idToken) {
        const idTokenString = idToken.toString();
        console.log('🔐 [API] ID TOKEN (for Authorization header):');
        console.log(idTokenString);
        
        const idTokenPayload = idToken.payload as any;
        console.log('📋 [API] ID TOKEN PAYLOAD:');
        console.log(JSON.stringify(idTokenPayload, null, 2));
        console.log('   User ID:', idTokenPayload.sub);
        console.log('   Email:', idTokenPayload.email);
        console.log('   Username:', idTokenPayload['cognito:username']);
      }
      
      // Log Access Token
      if (accessToken) {
        const accessTokenString = accessToken.toString();
        console.log('🔑 [API] ACCESS TOKEN:');
        console.log(accessTokenString);
        
        const accessTokenPayload = accessToken.payload as any;
        console.log('📋 [API] ACCESS TOKEN PAYLOAD:');
        console.log(JSON.stringify(accessTokenPayload, null, 2));
        console.log('   Client ID:', accessTokenPayload.client_id);
        console.log('   Username:', accessTokenPayload.username);
      }
      
      // Note: Refresh token is not directly accessible in Amplify v6 AuthTokens
      // It's managed internally by Amplify
      console.log('🔄 [API] Token refresh is handled automatically by Amplify');
      
      console.log('========================================');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (idToken) {
        const idTokenString = idToken.toString();
        headers['Authorization'] = `Bearer ${idTokenString}`;
        console.log('✅ [API] Added ID Token to Authorization header');
      }
      
      // Also add Access Token as separate header for backend use
      if (accessToken) {
        const accessTokenString = accessToken.toString();
        headers['X-Access-Token'] = accessTokenString;
        console.log('✅ [API] Added Access Token to X-Access-Token header');
      }
      
      return headers;
    } catch (error) {
      console.error('❌ [API] Error fetching auth session:', error);
      return {
        'Content-Type': 'application/json',
      };
    }
  }

  private async requestWithoutAuth<T>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<T> {
    const { method = 'GET', body, headers: customHeaders = {} } = options;
    
    if (!API_BASE_URL) {
      throw new Error('API base URL is not configured. Set EXPO_PUBLIC_API_GATEWAY_URL.');
    }
    
    // No auth headers for unauthenticated requests
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const config: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const sanitizedMessage = this.sanitizeErrorMessage(errorData.message || response.statusText);
        throw new Error(sanitizedMessage);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return {} as T;
    } catch (error: any) {
      throw error;
    }
  }

  private async request<T>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<T> {
    const { method = 'GET', body, headers: customHeaders = {} } = options;
    
    if (!API_BASE_URL) {
      throw new Error('API base URL is not configured. Set EXPO_PUBLIC_API_GATEWAY_URL.');
    }
    
    const authHeaders = await this.getAuthHeaders();
    const headers = {
      ...authHeaders,
      ...customHeaders,
    };

    const config: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

      if (!response.ok) {
        // Handle 401 Unauthorized
        if (response.status === 401) {
          await this.handleUnauthorized();
          throw new Error('Unauthorized');
        }

        // SECURITY: Sanitize error messages before exposing to client
        const errorData = await response.json().catch(() => ({}));
        const sanitizedMessage = this.sanitizeErrorMessage(errorData.message || response.statusText);
        throw new Error(sanitizedMessage);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return {} as T;
    } catch (error: any) {
      // SECURITY: Improved retry logic with exponential backoff to prevent abuse
      // Only retry GET requests with network errors
      if (error.message === 'Failed to fetch' && method === 'GET') {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.log(`[API] Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
              method,
              headers,
            });
            
            if (!response.ok) {
              if (response.status === 401) {
                await this.handleUnauthorized();
                throw new Error('Unauthorized');
              }
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.message || `API Error: ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              return await response.json();
            }
            
            return {} as T;
          } catch (retryError: any) {
            // If this was the last attempt, throw the error
            if (attempt === maxRetries) {
              logger.error(`[API] All ${maxRetries} retry attempts failed`);
              throw retryError;
            }
            // Otherwise, continue to next retry
            logger.warn(`[API] Retry attempt ${attempt} failed, will retry`);
          }
        }
      }
      
      throw error;
    }
  }

  async getUserProfile(username: string): Promise<any> {
    // SECURITY FIX: Remove @ symbol and AF suffix to match backend username format
    // Frontend adds these for display, but backend stores without them
    let cleanUsername = username.replace(/^@/, ''); // Remove @ prefix
    cleanUsername = cleanUsername.replace(/AF$/i, ''); // Remove AF suffix (case-insensitive)
    
    // Remove any trailing numbers that might have been added (e.g., "berkvakar1" -> "berkvakar")
    // This handles cases where default usernames were generated with numbers
    cleanUsername = cleanUsername.replace(/\d+$/, ''); // Remove trailing digits
    
    console.log('========================================');
    console.log('🔍 [API] getUserProfile: Username processing');
    console.log('   Original username:', username);
    console.log('   After removing @:', username.replace(/^@/, ''));
    console.log('   After removing AF:', username.replace(/^@/, '').replace(/AF$/i, ''));
    console.log('   Final cleaned username:', cleanUsername);
    console.log('========================================');
    
    logger.log('[API] getUserProfile: Fetching profile');
    logger.debug('[API] getUserProfile: Cleaned username:', logger.sanitize(cleanUsername));
    
    try {
      const profile = await this.request<any>(`/users/getUserDetails?username=${encodeURIComponent(cleanUsername)}`);
      logger.log('[API] getUserProfile: Profile fetched successfully');
      return profile;
    } catch (error: any) {
      logger.error('[API] getUserProfile: Error fetching profile');
      throw error;
    }
  }

  async getUserComments(userId: string): Promise<any[]> {
    return this.request<any[]>(`/users/${userId}/comments`);
  }

  async getCurrentUser(): Promise<{
    sub: string;
    email?: string;
    username?: string;
    plan?: string;
  }> {
    logger.log('[API] getCurrentUser: Fetching /api/me');
    return this.request('/api/me');
  }

  async checkEmailExists(email: string): Promise<{ exists?: boolean; available?: boolean; success?: boolean; message?: string }> {
    logger.log('[API] checkEmailExists: Checking email availability');
    try {
      return await this.requestWithoutAuth<{ exists?: boolean; available?: boolean; success?: boolean; message?: string }>(`/api/users?email=${encodeURIComponent(email)}`);
    } catch (error) {
      logger.error('[API] checkEmailExists: Error while checking email', error);
      throw error;
    }
  }

  async registerUserForVerification(userData: {
    userId: string;
    username: string;
  }): Promise<{ success: boolean; message?: string }> {
    logger.log('[API] registerUserForVerification: Sending user info to backend for verification timer');
    try {
      // This call doesn't require authentication since user isn't signed in yet
      // The backend will forward to AWS Lambda to start the 5-minute timer
      return await this.requestWithoutAuth<{ success: boolean; message?: string }>(
        '/api/users/verify',
        {
          method: 'POST',
          body: {
            userId: userData.userId,
            username: userData.username,
          },
        }
      );
    } catch (error) {
      logger.error('[API] registerUserForVerification: Error sending user info', error);
      throw error;
    }
  }

  async getRecentPosts(): Promise<any[]> {
    logger.log('[API] getRecentPosts: Fetching recent posts');
    
    try {
      // Ensure we have valid tokens before making the request
      const session = await fetchAuthSession({ forceRefresh: false });
      const hasValidToken = !!session.tokens?.idToken;
      
      if (!hasValidToken) {
        logger.warn('[API] getRecentPosts: No valid auth token available yet');
        // Return empty array instead of throwing - UI will handle gracefully
        return [];
      }
      
      const data = await this.request<any>(`/api/posts?depth=1`);
      logger.log('[API] getRecentPosts: Response received and parsed');
      
      if (Array.isArray(data)) {
        logger.log('[API] getRecentPosts: Received array of posts, count:', data.length);
        return data;
      }
        
      if (data?.success) {
        if (Array.isArray(data.posts)) {
          logger.log('[API] getRecentPosts: Received posts array, count:', data.posts.length);
          return data.posts;
        }
        if (data.post) {
          logger.log('[API] getRecentPosts: Received single post');
          return [data.post];
        }
      }
      
      logger.warn('[API] getRecentPosts: Unexpected response format');
      return [];
    } catch (error: any) {
      logger.error('[API] getRecentPosts: Error fetching posts', error);
      console.error('[API] getRecentPosts: Full error details:', JSON.stringify(error, null, 2));
      console.error('[API] getRecentPosts: Error message:', error?.message);
      console.error('[API] getRecentPosts: Error stack:', error?.stack);
      // Return empty array instead of throwing - let UI handle gracefully
      return [];
    }
  }

  /**
   * Fetch current user's profile from backend /api/users/profile endpoint
   * Uses JWT token from Authorization header to identify the user
   * Returns profile data from DynamoDB along with verified user info from JWT
   */
  async getUserProfileFromBackend(): Promise<{
    success: boolean;
    profile?: any;
    userInfo?: {
      userId: string;
      email?: string;
      username?: string;
      plan?: string;
    };
    error?: string;
    details?: any;
  }> {
    logger.log('[API] getUserProfileFromBackend: Fetching profile from /api/users/profile');
    
    try {
      // Ensure we have valid tokens before making the request
      const session = await fetchAuthSession({ forceRefresh: false });
      const hasValidToken = !!session.tokens?.idToken;
      
      if (!hasValidToken) {
        logger.warn('[API] getUserProfileFromBackend: No valid auth token available');
        return {
          success: false,
          error: 'No authentication token available',
        };
      }
      
      // Make request to /api/users/profile with Authorization header
      // The backend will extract userId from JWT and fetch profile from DynamoDB
      const response = await this.request<any>('/api/users/profile');
      
      logger.log('[API] getUserProfileFromBackend: Profile fetched successfully');
      logger.debug('[API] getUserProfileFromBackend: Response:', logger.sanitize(response));
      
      return response;
    } catch (error: any) {
      logger.error('[API] getUserProfileFromBackend: Error fetching profile', error);
      return {
        success: false,
        error: error?.message || 'Failed to fetch user profile',
      };
    }
  }
}

export const apiClient = new ApiClient();

