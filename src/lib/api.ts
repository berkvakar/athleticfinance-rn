import { fetchAuthSession } from 'aws-amplify/auth';
import { logger } from './logger';

// API Gateway base URL from environment variables
const API_BASE_URL = process.env.EXPO_PUBLIC_API_GATEWAY_URL;

if (!API_BASE_URL) {
  logger.warn('[API] Missing EXPO_PUBLIC_API_GATEWAY_URL - API requests will fail');
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

  // Sanitize error messages to prevent exposing sensitive information
  private sanitizeErrorMessage(message: string): string {
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
    
    // Remove stack traces
    message = message.replace(/at\s+[^\n]+/g, '');
    
    // Remove UUID error codes
    message = message.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[error-id]');
    
    // Remove file paths (Windows and Unix-style absolute paths)
    message = message.replace(/[A-Z]:\\[^\s]+/gi, '[path]');
    message = message.replace(/\/[^\s]+/g, '[path]');
    
    // Return first sentence only, max 100 chars
    return message.split('.')[0].trim().substring(0, 100);
  }

  // Get userId from current auth session
  private async getUserId(): Promise<string | null> {
    try {
      const session = await fetchAuthSession({ forceRefresh: false });
      const idToken = session.tokens?.idToken;
      return (idToken?.payload as any)?.sub || null;
    } catch (error) {
      return null;
    }
  }

  // Get authentication headers with JWT tokens
  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const session = await fetchAuthSession({ forceRefresh: false });
      const idToken = session.tokens?.idToken;
      const accessToken = session.tokens?.accessToken;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken.toString()}`;
      }
      
      if (accessToken) {
        headers['X-Access-Token'] = accessToken.toString();
      }
      
      return headers;
    } catch (error) {
      logger.error('[API] Error fetching auth session:', error);
      return {
        'Content-Type': 'application/json',
      };
    }
  }

  // Make API request without authentication headers
  private async requestWithoutAuth<T>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<T> {
    const { method = 'GET', body, headers: customHeaders = {} } = options;
    
    if (!API_BASE_URL) {
      throw new Error('API base URL is not configured');
    }
    
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

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const sanitizedMessage = this.sanitizeErrorMessage(errorData.message || response.statusText);
      throw new Error(sanitizedMessage);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    }
    
    return {} as T;
  }

  // Make authenticated API request with retry logic
  private async request<T>(
    endpoint: string,
    options: ApiOptions = {}
  ): Promise<T> {
    const { method = 'GET', body, headers: customHeaders = {} } = options;
    
    if (!API_BASE_URL) {
      throw new Error('API base URL is not configured');
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
        if (response.status === 401) {
          await this.handleUnauthorized();
          const error = new Error('Unauthorized') as any;
          error.status = response.status;
          throw error;
        }

        const errorData = await response.json().catch(() => ({}));
        const sanitizedMessage = this.sanitizeErrorMessage(errorData.message || response.statusText);
        const error = new Error(sanitizedMessage) as any;
        error.status = response.status;
        error.url = `${API_BASE_URL}${endpoint}`;
        throw error;
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      
      return {} as T;
    } catch (error: any) {
      // Retry GET requests with network errors (exponential backoff)
      if (error.message === 'Failed to fetch' && method === 'GET') {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          logger.log(`[API] Retry ${attempt}/3 after ${delay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { method, headers });
            
            if (!response.ok) {
              if (response.status === 401) {
                await this.handleUnauthorized();
                throw new Error('Unauthorized');
              }
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.message || response.statusText);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
              return await response.json();
            }
            return {} as T;
          } catch (retryError: any) {
            if (attempt === 3) throw retryError;
          }
        }
      }
      
      throw error;
    }
  }

  // Get user profile by extracting userId from JWT token
  async getUserProfile(): Promise<{
    success: boolean;
    profile?: any;
    userInfo?: {
      userId: string;
      email?: string;
      username?: string;
      plan?: string;
    };
    error?: string;
  }> {
    try {
      logger.log('[API] getUserProfile: Starting...');
      const userId = await this.getUserId();
      logger.log('[API] getUserProfile: userId extracted:', userId);
      
      if (!userId) {
        logger.warn('[API] getUserProfile: No userId available');
        return {
          success: false,
          error: 'No authentication token available',
        };
      }
      
      const endpoint = `/api/profile?userId=${encodeURIComponent(userId)}`;
      logger.log('[API] getUserProfile: Making request to:', endpoint);
      const response = await this.request<any>(endpoint);
      logger.log('[API] getUserProfile: Response received');
      
      // Handle profile picture - convert S3 key to URL if needed
      // Handle both nested (response.profile) and flat (response) structures
      const profile = response.profile || response;
      
      // Helper function to convert S3 key to URL
      const convertProfilePicUrl = async (picUrl: string): Promise<string | null> => {
        if (!picUrl || picUrl.startsWith('http')) {
          return picUrl; // Already a URL or empty
        }
        
        // It's an S3 key, not a URL - fetch the presigned URL
        logger.log('[API] getUserProfile: Converting S3 key to URL:', picUrl);
        try {
          const urlResult = await this.getProfilePictureUrl(picUrl);
          if (urlResult.success && urlResult.url) {
            logger.log('[API] getUserProfile: Successfully converted S3 key to URL');
            return urlResult.url;
          } else {
            logger.warn('[API] getUserProfile: Failed to convert S3 key:', urlResult.error);
            return null;
          }
        } catch (error: any) {
          logger.error('[API] getUserProfile: Error converting S3 key to URL:', error);
          return null;
        }
      };
      
      // Convert profilePicUrl if it exists and is an S3 key
      if (profile?.profilePicUrl) {
        const convertedUrl = await convertProfilePicUrl(profile.profilePicUrl);
        if (convertedUrl) {
          profile.profilePicUrl = convertedUrl;
        } else {
          // If conversion failed, set to null to avoid showing black image
          logger.warn('[API] getUserProfile: Setting profilePicUrl to null due to conversion failure');
          profile.profilePicUrl = null;
        }
      }
      
      // Return in a consistent format
      return {
        success: true,
        profile: profile,
        userInfo: response.userInfo || {
          userId: userId,
          email: response.email,
          username: response.username,
          plan: response.plan || 'AF',
        },
      };
    } catch (error: any) {
      logger.error('[API] getUserProfile error:', error?.message || error);
      return {
        success: false,
        error: error?.message || 'Failed to fetch user profile',
      };
    }
  }

  // Get user comments
  async getUserComments(userId: string): Promise<any[]> {
    return this.request<any[]>(`/users/${userId}/comments`);
  }

  // Check if email exists in the system
  async checkEmailExists(email: string): Promise<{ exists?: boolean; available?: boolean; success?: boolean; message?: string }> {
    return await this.requestWithoutAuth(`/api/users?email=${encodeURIComponent(email)}`);
  }

  // Register user for verification (unauthenticated)
  async registerUserForVerification(userData: {
    userId: string;
    username: string;
  }): Promise<{ success: boolean; message?: string }> {
    return await this.requestWithoutAuth('/api/users/verify', {
      method: 'POST',
      body: userData,
    });
  }

  // Get recent posts (returns empty array if not authenticated)
  async getRecentPosts(): Promise<any[]> {
    try {
      const session = await fetchAuthSession({ forceRefresh: false });
      if (!session.tokens?.idToken) {
        return [];
      }
      
      const data = await this.request<any>(`/api/posts?depth=1`);
      
      if (Array.isArray(data)) return data;
      if (data?.success) {
        if (Array.isArray(data.posts)) return data.posts;
        if (data.post) return [data.post];
      }
      
      return [];
    } catch (error: any) {
      logger.error('[API] getRecentPosts error:', error?.message || error);
      return [];
    }
  }

  // Sync user profile after sign in/sign up (non-critical call)
  async callProfileEndpoint(userId: string): Promise<any> {
    try {
      return await this.request<any>(`/api/profile?userId=${encodeURIComponent(userId)}`);
    } catch (error: any) {
      logger.error('[API] callProfileEndpoint error:', error?.message || error);
      return null;
    }
  }

  // ========== COMMENTS API ==========

  // Get comments for an article
  async getArticleComments(
    articleId: string | number,
    options?: {
      limit?: number;
      lastCommentId?: string;
      sort?: 'asc' | 'desc';
    }
  ): Promise<{
    success: boolean;
    comments?: Array<{
      comment_id: string;
      article_id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
      parentCommentId?: string;
      author: {
        username: string; // Public username (e.g., "@john_doe")
        name?: string; // Display name (optional)
        avatar: string | null; // Full S3 public URL or null (ready to use)
      };
    }>;
    count?: number;
    hasMore?: boolean;
    lastCommentId?: string;
    error?: string;
  }> {
    try {
      const articleIdStr = String(articleId);
      let endpoint = `/api/articles/${encodeURIComponent(articleIdStr)}/comments`;
      
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', String(options.limit));
      if (options?.lastCommentId) params.append('lastCommentId', options.lastCommentId);
      if (options?.sort) params.append('sort', options.sort);
      
      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      // Comments can be fetched without auth (public)
      const response = await this.requestWithoutAuth<any>(endpoint);
      
      return {
        success: true,
        comments: response.comments || [],
        count: response.count || 0,
        hasMore: response.hasMore || false,
        lastCommentId: response.lastCommentId,
      };
    } catch (error: any) {
      logger.error('[API] getArticleComments error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
        fullError: error,
        stringified: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      return {
        success: false,
        error: error?.message || 'Failed to fetch comments',
        comments: [],
      };
    }
  }

  // Create a new comment
  async createComment(
    articleId: string | number,
    content: string
  ): Promise<{
    success: boolean;
    comment?: {
      comment_id: string;
      article_id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
      parentCommentId?: string;
      author: {
        username: string; // Public username (e.g., "@john_doe")
        name?: string; // Display name (optional)
        avatar: string | null; // Full S3 public URL or null (ready to use)
      };
    };
    error?: string;
  }> {
    try {
      const articleIdStr = String(articleId);
      const endpoint = `/api/articles/${encodeURIComponent(articleIdStr)}/comments`;
      
      const response = await this.request<any>(endpoint, {
        method: 'POST',
        body: { content: content.trim() },
      });

      return {
        success: true,
        comment: response.comment,
      };
    } catch (error: any) {
      logger.error('[API] createComment error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
        fullError: error,
        stringified: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      return {
        success: false,
        error: error?.message || 'Failed to post comment',
      };
    }
  }

  // Update a comment
  async updateComment(
    commentId: string,
    content: string
  ): Promise<{
    success: boolean;
    comment?: {
      comment_id: string;
      article_id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
      parentCommentId?: string;
      author: {
        username: string; // Public username (e.g., "@john_doe")
        name?: string; // Display name (optional)
        avatar: string | null; // Full S3 public URL or null (ready to use)
      };
    };
    error?: string;
  }> {
    try {
      const endpoint = `/api/comments/${encodeURIComponent(commentId)}`;
      
      const response = await this.request<any>(endpoint, {
        method: 'PUT',
        body: { content: content.trim() },
      });

      return {
        success: true,
        comment: response.comment,
      };
    } catch (error: any) {
      logger.error('[API] updateComment error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
        fullError: error,
        stringified: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      return {
        success: false,
        error: error?.message || 'Failed to update comment',
      };
    }
  }

  // Delete a comment
  async deleteComment(commentId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const endpoint = `/api/comments/${encodeURIComponent(commentId)}`;
      
      await this.request<any>(endpoint, {
        method: 'DELETE',
      });

      return {
        success: true,
      };
    } catch (error: any) {
      logger.error('[API] deleteComment error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
        fullError: error,
        stringified: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      return {
        success: false,
        error: error?.message || 'Failed to delete comment',
      };
    }
  }

  // ========== BATCH USERS API ==========

  // Batch fetch user profiles (efficient for fetching multiple users)
  async batchFetchUsers(userIds: string[]): Promise<{
    success: boolean;
    users?: Array<{
      userId: string;
      username: string;
      name?: string;
      avatar?: string | null;
      description?: string;
      createdAt?: string;
      updatedAt?: string;
    }>;
    count?: number;
    error?: string;
  }> {
    try {
      if (!userIds || userIds.length === 0) {
        return {
          success: false,
          error: 'User IDs are required',
        };
      }

      if (userIds.length > 100) {
        return {
          success: false,
          error: 'Maximum 100 user IDs allowed per request',
        };
      }

      const endpoint = `/api/users/batch`;
      const response = await this.request<any>(endpoint, {
        method: 'POST',
        body: { userIds },
      });

      return {
        success: true,
        users: response.users || [],
        count: response.count || 0,
      };
    } catch (error: any) {
      logger.error('[API] batchFetchUsers error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
      });
      return {
        success: false,
        error: error?.message || 'Failed to fetch users',
      };
    }
  }

  // ========== PROFILE UPDATE API ==========

  // Get profile picture URL from S3 key
  // Backend returns S3 key (e.g., "profile-pictures/user123/123.jpg")
  // This method converts it to a presigned URL via /api/profile/picture?key=...
  async getProfilePictureUrl(s3Key: string): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    try {
      if (!s3Key) {
        return {
          success: false,
          error: 'S3 key is required',
        };
      }

      const endpoint = `/api/profile/picture?key=${encodeURIComponent(s3Key)}`;
      const response = await this.request<any>(endpoint);

      return {
        success: true,
        url: response.url || response.profilePicUrl || response,
      };
    } catch (error: any) {
      logger.error('[API] getProfilePictureUrl error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
      });
      return {
        success: false,
        error: error?.message || 'Failed to get profile picture URL',
      };
    }
  }

  // Update user profile fields (description and/or profile picture)
  async updateUserProfile(updates: {
    description?: string;
    profilePic?: {
      uri: string;
      type: string;
      name: string;
    };
  }): Promise<{
    success: boolean;
    profile?: {
      description?: string;
      profilePicUrl?: string;
      profilePicKey?: string; // S3 key returned from backend
    };
    error?: string;
  }> {
    try {
      const endpoint = `/api/profile/update`;
      
      // Prepare the request body
      const body: any = {};
      
      // Add description if provided
      if (updates.description !== undefined) {
        body.description = updates.description;
      }
      
      // Handle profile picture upload
      if (updates.profilePic) {
        // Convert image to base64 for sending (React Native compatible)
        try {
          // For React Native, fetch the local file URI and convert to base64
          const response = await fetch(updates.profilePic.uri);
          const blob = await response.blob();
          
          // Convert blob to base64 (works in both web and React Native)
          const base64 = await new Promise<string>((resolve, reject) => {
            // Try FileReader first (web)
            if (typeof FileReader !== 'undefined') {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64String = reader.result as string;
                // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
                const base64Data = base64String.split(',')[1] || base64String;
                resolve(base64Data);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            } else {
              // React Native fallback: convert blob to base64 using arrayBuffer
              blob.arrayBuffer()
                .then((buffer) => {
                  // Convert ArrayBuffer to base64
                  const bytes = new Uint8Array(buffer);
                  let binary = '';
                  const len = bytes.byteLength;
                  for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                  }
                  // Use btoa if available, otherwise use Buffer (Node.js) or manual encoding
                  let base64String: string;
                  if (typeof btoa !== 'undefined') {
                    base64String = btoa(binary);
                  } else {
                    // Fallback for environments without btoa
                    // This is a simple base64 encoder
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                    let result = '';
                    let i = 0;
                    while (i < binary.length) {
                      const a = binary.charCodeAt(i++);
                      const b = i < binary.length ? binary.charCodeAt(i++) : 0;
                      const c = i < binary.length ? binary.charCodeAt(i++) : 0;
                      const bitmap = (a << 16) | (b << 8) | c;
                      result += chars.charAt((bitmap >> 18) & 63);
                      result += chars.charAt((bitmap >> 12) & 63);
                      result += i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=';
                      result += i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=';
                    }
                    base64String = result;
                  }
                  resolve(base64String);
                })
                .catch(reject);
            }
          });
          
          body.profilePic = {
            data: base64,
            type: updates.profilePic.type,
            name: updates.profilePic.name,
          };
        } catch (imageError: any) {
          logger.error('[API] updateUserProfile: Error converting image to base64:', imageError);
          throw new Error('Failed to process profile picture');
        }
      }
      
      // this.request() automatically includes JWT tokens via getAuthHeaders()
      const response = await this.request<any>(endpoint, {
        method: 'PUT',
        body,
      });

      // Backend now returns S3 key instead of full URL
      // Format: "profile-pictures/user123/123.jpg"
      const profilePicKey = response.profilePicUrl || response.profile?.profilePicUrl || response.profilePicKey;
      
      // If we got an S3 key, fetch the actual URL
      let profilePicUrl: string | undefined;
      if (profilePicKey && !profilePicKey.startsWith('http')) {
        // It's an S3 key, not a URL - fetch the presigned URL
        const urlResult = await this.getProfilePictureUrl(profilePicKey);
        if (urlResult.success && urlResult.url) {
          profilePicUrl = urlResult.url;
        } else {
          logger.warn('[API] updateUserProfile: Failed to get URL for S3 key:', profilePicKey);
        }
      } else if (profilePicKey) {
        // It's already a URL (backward compatibility)
        profilePicUrl = profilePicKey;
      }

      return {
        success: true,
        profile: {
          description: response.description || response.profile?.description,
          profilePicUrl: profilePicUrl,
          profilePicKey: profilePicKey,
        },
      };
    } catch (error: any) {
      logger.error('[API] updateUserProfile error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
        fullError: error,
        stringified: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      return {
        success: false,
        error: error?.message || 'Failed to update profile',
      };
    }
  }
}

export const apiClient = new ApiClient();

