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
    
    // Remove file paths
    message = message.replace(/\/[^\s]+/g, '[path]');
    message = message.replace(/C:\\[^\s]+/g, '[path]');
    
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
      const userId = await this.getUserId();
      
      if (!userId) {
        return {
          success: false,
          error: 'No authentication token available',
        };
      }
      
      const endpoint = `/api/profile?userId=${encodeURIComponent(userId)}`;
      const response = await this.request<any>(endpoint);
      
      // Return in a consistent format
      return {
        success: true,
        profile: response.profile || response,
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
      user_id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
      author: {
        username: string;
        name?: string;
        avatar?: string;
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
      user_id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
      author: {
        username: string;
        name?: string;
        avatar?: string;
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
      user_id: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
      author: {
        username: string;
        name?: string;
        avatar?: string;
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
}

export const apiClient = new ApiClient();

