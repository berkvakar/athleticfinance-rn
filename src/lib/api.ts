import { fetchAuthSession } from 'aws-amplify/auth';
import Constants from 'expo-constants';
import { logger } from './logger';

// Get API Gateway URL from app.config.js extra field or process.env
const API_BASE_URL = Constants.expoConfig?.extra?.apiGatewayUrl || process.env.EXPO_PUBLIC_API_GATEWAY_URL || '';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
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
      console.log('========================================');
      console.log('🔍 [API] Fetching auth session for API request...');
      const session = await fetchAuthSession();
      
      const idToken = session.tokens?.idToken;
      const accessToken = session.tokens?.accessToken;
      
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
      } else {
        console.warn('⚠️ [API] ID Token not available');
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
      } else {
        console.warn('⚠️ [API] Access Token not available');
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

  private async request<T>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<T> {
    const { method = 'GET', body, headers: customHeaders = {} } = options;
    
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

  async checkEmailExists(email: string): Promise<{ exists: boolean }> {
    // Don't require auth headers for this endpoint
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    logger.log('[API] checkEmailExists: Checking email availability');
    
    if (!API_BASE_URL) {
      logger.error('[API] checkEmailExists: API_BASE_URL is not configured');
      throw new Error('API Gateway URL is not configured. Please set EXPO_PUBLIC_API_GATEWAY_URL environment variable.');
    }
    
    const response = await fetch(`${API_BASE_URL}/users/check-email?email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers,
    });

    logger.log('[API] checkEmailExists: Response received, status:', response.status);

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorData: any = {};
      
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json().catch(() => ({}));
      } else {
        const text = await response.text();
        errorData = { message: text || `API Error: ${response.statusText}` };
      }
      
      throw new Error(errorData.message || `API Error: ${response.statusText}`);
    }

    // Check content type before parsing
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      // Handle non-JSON response
      const text = await response.text();
      logger.warn('[API] checkEmailExists: Non-JSON response received');
      
      try {
        return JSON.parse(text);
      } catch (e) {
        // If not JSON, assume email doesn't exist (for development/testing)
        logger.warn('[API] checkEmailExists: Could not parse response as JSON');
        return { exists: false };
      }
    }
  }

  async getRecentPosts(): Promise<any[]> {
    logger.log('[API] getRecentPosts: Fetching recent posts');
    
    try {
      // Try with auth headers first (endpoint may require authentication)
      const authHeaders = await this.getAuthHeaders();
      
      if (!API_BASE_URL) {
        logger.error('[API] getRecentPosts: API_BASE_URL is not configured');
        throw new Error('API Gateway URL is not configured. Please set EXPO_PUBLIC_API_GATEWAY_URL environment variable.');
      }
      
      const response = await fetch(`${API_BASE_URL}/api/posts`, {
        method: 'GET',
        headers: authHeaders,
      });

      logger.log('[API] getRecentPosts: Response received, status:', response.status);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorData: any = {};
        
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json().catch(() => ({}));
        } else {
          const text = await response.text();
          errorData = { message: text || `API Error: ${response.statusText}` };
        }
        
        throw new Error(errorData.message || `API Error: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        
        // Handle different response formats:
        // Format 1: { success: true, posts: [...] }
        // Format 2: { success: true, post: {...} } (single post)
        // Format 3: [...] (direct array)
        if (Array.isArray(data)) {
          logger.log('[API] getRecentPosts: Received array of posts, count:', data.length);
          return data;
        } else if (data.success) {
          if (data.posts && Array.isArray(data.posts)) {
            logger.log('[API] getRecentPosts: Received posts array, count:', data.posts.length);
            return data.posts;
          } else if (data.post) {
            logger.log('[API] getRecentPosts: Received single post');
            return [data.post];
          }
        }
        
        logger.warn('[API] getRecentPosts: Unexpected response format');
        return [];
      } else {
        logger.warn('[API] getRecentPosts: Non-JSON response received');
        return [];
      }
    } catch (error: any) {
      logger.error('[API] getRecentPosts: Error fetching posts', error);
      throw error;
    }
  }
}

export const apiClient = new ApiClient();

