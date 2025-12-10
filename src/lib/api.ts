import { fetchAuthSession } from 'aws-amplify/auth';
import { logger } from './logger';

// API Gateway base URL from environment variables
const API_BASE_URL = process.env.EXPO_PUBLIC_API_GATEWAY_URL;

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
      let session = await fetchAuthSession({ forceRefresh: false });
      let idToken = session.tokens?.idToken;
      
      // Check if token is expired and refresh if needed
      if (idToken) {
        const payload = idToken.payload as any;
        if (payload.exp) {
          const expirationTime = payload.exp * 1000;
          const now = Date.now();
          if (expirationTime <= now) {
            // Token expired, force refresh
            session = await fetchAuthSession({ forceRefresh: true });
            idToken = session.tokens?.idToken;
          }
        }
      }
      
      return (idToken?.payload as any)?.sub || null;
    } catch (error) {
      // Try to force refresh as fallback
      try {
        const session = await fetchAuthSession({ forceRefresh: true });
        const idToken = session.tokens?.idToken;
        return (idToken?.payload as any)?.sub || null;
      } catch {
        return null;
      }
    }
  }

  // Get authentication headers with JWT tokens
  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      // First try to get session without forcing refresh
      let session = await fetchAuthSession({ forceRefresh: false });
      const idToken = session.tokens?.idToken;
      const accessToken = session.tokens?.accessToken;
      
      // Check if tokens are expired or about to expire (within 1 minute)
      let needsRefresh = false;
      if (idToken) {
        const payload = idToken.payload as any;
        if (payload.exp) {
          const expirationTime = payload.exp * 1000; // Convert to milliseconds
          const now = Date.now();
          const oneMinute = 60 * 1000;
          // Refresh if expired or expiring within 1 minute
          if (expirationTime <= now + oneMinute) {
            needsRefresh = true;
            logger.log('[API] ID token expired or expiring soon, forcing refresh');
          }
        }
      }
      
      // If token is expired, force refresh
      if (needsRefresh) {
        session = await fetchAuthSession({ forceRefresh: true });
      }
      
      const refreshedIdToken = session.tokens?.idToken;
      const refreshedAccessToken = session.tokens?.accessToken;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (refreshedIdToken) {
        headers['Authorization'] = `Bearer ${refreshedIdToken.toString()}`;
      }
      
      if (refreshedAccessToken) {
        headers['X-Access-Token'] = refreshedAccessToken.toString();
      }
      
      return headers;
    } catch (error) {
      logger.error('[API] Error fetching auth session:', error);
      // Try to force refresh as a last resort
      try {
        const session = await fetchAuthSession({ forceRefresh: true });
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
      } catch (refreshError) {
        logger.error('[API] Error forcing token refresh:', refreshError);
        return {
          'Content-Type': 'application/json',
        };
      }
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
    
    const fullUrl = `${API_BASE_URL}${endpoint}`;
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

    let response: Response;
    try {
      response = await fetch(fullUrl, config);
    } catch (networkError: any) {
      logger.error('[API] Network error:', networkError);
      throw networkError;
    }

    if (!response.ok) {
      let errorData: any = {};
      try {
        const responseText = await response.text();
        errorData = responseText ? JSON.parse(responseText) : {};
        logger.error('[API] Error response:', { status: response.status, errorData });
      } catch (parseError) {
        logger.error('[API] Failed to parse error response:', parseError);
      }
      const sanitizedMessage = this.sanitizeErrorMessage(errorData.message || response.statusText);
      const error: any = new Error(sanitizedMessage);
      error.status = response.status;
      throw error;
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
    
    const fullUrl = `${API_BASE_URL}${endpoint}`;
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
      const response = await fetch(fullUrl, config);

      if (!response.ok) {
        if (response.status === 401) {
          logger.warn('[API] 401 Unauthorized');
          await this.handleUnauthorized();
          const error = new Error('Unauthorized') as any;
          error.status = response.status;
          throw error;
        }

        let errorData: any = {};
        try {
          const responseText = await response.text();
          errorData = responseText ? JSON.parse(responseText) : {};
          logger.error('[API] Error response:', { status: response.status, errorData });
        } catch (parseError) {
          logger.error('[API] Failed to parse error response:', parseError);
        }
        const sanitizedMessage = this.sanitizeErrorMessage(errorData.message || response.statusText);
        const error = new Error(sanitizedMessage) as any;
        error.status = response.status;
        error.url = fullUrl;
        throw error;
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      
      return {} as T;
    } catch (error: any) {
      logger.error('[API] Request failed:', error);
      
      // Retry GET requests with network errors (exponential backoff)
      if (error.message === 'Failed to fetch' && method === 'GET') {
        logger.log('[API] Retrying failed fetch request...');
        for (let attempt = 1; attempt <= 3; attempt++) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          logger.log(`[API] Retry ${attempt}/3 after ${delay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          try {
            logger.log(`[API] Retry attempt ${attempt}: ${method} ${endpoint}`);
            const response = await fetch(fullUrl, { method, headers });
            logger.log(`[API] Retry ${attempt} response status: ${response.status}`);
            
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
            logger.error(`[API] Retry ${attempt} failed:`, retryError);
            if (attempt === 3) {
              logger.error('[API] All retry attempts failed');
              throw retryError;
            }
          }
        }
      }
      
      throw error;
    }
  }

  // Get the authenticated user's profile
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
      
      const endpoint = `/api/profile`;
      logger.log('[API] getUserProfile: Making request to:', endpoint);
      const response = await this.request<any>(endpoint, { method: 'GET' });
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
        success: response.success ?? true,
        profile: profile,
        userInfo: response.userInfo || {
          userId,
          email: profile.email || response.email,
          username: profile.username || response.username,
          plan: profile.plan || response.plan || 'AF',
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

  async getProfileStatsSummary(): Promise<{
    success: boolean;
    stats?: {
      // Total UNIQUE articles read; mirrors articlesReadCount from backend
      articlesRead?: number;
      articlesReadCount?: number;
      commentsPosted?: number;
      streak?: number;
      // Timestamp of the last NEW unique article that counted toward the streak
      streakLastReadAt?: string;
      // Convenience fields for UI
      lastActivityDate?: string;
      lastViewedAt?: string;
      updatedAt?: string;
      longestStreak?: number;
    };
    error?: string;
  }> {
    try {
      const endpoint = '/api/profile/stats/summary';
      const response = await this.request<any>(endpoint, { method: 'GET' });
      
      // Normalize stats so the app can rely on articlesRead being a UNIQUE count
      const rawStats = response.stats || response.data || response || {};
      const articlesReadCount =
        rawStats.articlesReadCount ??
        rawStats.uniqueArticlesRead ??
        rawStats.articlesRead ??
        0;

      const normalizedStats = {
        ...rawStats,
        articlesRead: articlesReadCount,
        articlesReadCount,
      };

      return {
        success: response.success ?? true,
        stats: normalizedStats,
      };
    } catch (error: any) {
      logger.error('[API] getProfileStatsSummary error:', {
        message: error?.message,
        status: error?.status,
        url: error?.url,
      });
      return {
        success: false,
        error: error?.message || 'Failed to load profile stats summary',
      };
    }
  }

  // Get user comments
  async getUserComments(userId: string): Promise<any[]> {
    return this.request<any[]>(`/users/${userId}/comments`);
  }

  // Get my comments (authenticated user's comments)
  async getMyComments(): Promise<{
    success: boolean;
    comments?: Array<{
      id: string;
      text: string;
      articleId: string;
      articleTitle?: string;
      timestamp: string;
      replyTo?: string;
    }>;
    count?: number;
    error?: string;
  }> {
    try {
      const endpoint = `/api/profile/comments`;
      logger.log('[API] getMyComments: Making request to:', endpoint);
      const response = await this.request<any>(endpoint, {
        method: 'GET',
      });

      logger.log('[API] getMyComments: Full raw response:', JSON.stringify(response, null, 2));
      logger.log('[API] getMyComments: Response type:', typeof response);
      logger.log('[API] getMyComments: Response keys:', Object.keys(response || {}));
      logger.log('[API] getMyComments: response.success:', response?.success);
      logger.log('[API] getMyComments: response.comments:', JSON.stringify(response?.comments, null, 2));
      logger.log('[API] getMyComments: response.comments type:', typeof response?.comments);
      logger.log('[API] getMyComments: response.comments is array?', Array.isArray(response?.comments));
      logger.log('[API] getMyComments: response.comments length:', response?.comments?.length);
      
      if (response?.comments && Array.isArray(response.comments) && response.comments.length > 0) {
        logger.log('[API] getMyComments: First comment structure:', JSON.stringify(response.comments[0], null, 2));
        logger.log('[API] getMyComments: First comment keys:', Object.keys(response.comments[0] || {}));
        if (response.comments[0]?.author) {
          logger.log('[API] getMyComments: First comment author:', JSON.stringify(response.comments[0].author, null, 2));
          logger.log('[API] getMyComments: First comment author keys:', Object.keys(response.comments[0].author || {}));
          logger.log('[API] getMyComments: First comment author.avatar:', response.comments[0].author.avatar);
          logger.log('[API] getMyComments: First comment author.avatar type:', typeof response.comments[0].author.avatar);
        } else {
          logger.log('[API] getMyComments: First comment has NO author field');
        }
      }

      const result = {
        success: response.success ?? true,
        comments: response.comments || [],
        count: response.count || 0,
      };

      logger.log('[API] getMyComments: Returning result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      logger.error('[API] getMyComments error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
      });
      return {
        success: false,
        error: error?.message || 'Failed to fetch comments',
        comments: [],
      };
    }
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

  // Get the most recent article (today's article)
  async getRecentArticle(): Promise<{
    success: boolean;
    article?: any;
    error?: string;
  }> {
    try {
      const data = await this.requestWithoutAuth<any>(`/api/articles/recent`);
      
      if (data?.success && data?.article) {
        return {
          success: true,
          article: data.article,
        };
      }
      
      return {
        success: false,
        error: data?.error || 'No articles found',
      };
    } catch (error: any) {
      // Ignore 404 errors - this is expected when there's no recent article
      if (error?.status === 404 || error?.message?.includes('404') || error?.message?.includes('Not Found')) {
        return {
          success: false,
          error: 'No recent article found',
        };
      }
      
      logger.error('[API] getRecentArticle error:', error?.message || error);
      return {
        success: false,
        error: error?.message || 'Failed to fetch recent article',
      };
    }
  }

  // Get the next 6 most recent articles (excluding the most recent one)
  async getRecentArticlesBatch(): Promise<{
    success: boolean;
    articles?: any[];
    count?: number;
    error?: string;
  }> {
    try {
      const data = await this.requestWithoutAuth<any>(`/api/articles/recent-batch`);
      
      if (data?.success) {
        return {
          success: true,
          articles: data.articles || [],
          count: data.count || 0,
        };
      }
      
      return {
        success: false,
        error: data?.error || 'No articles found',
        articles: [],
      };
    } catch (error: any) {
      logger.error('[API] getRecentArticlesBatch error:', error?.message || error);
      return {
        success: false,
        error: error?.message || 'Failed to fetch articles',
        articles: [],
      };
    }
  }

  // Sync user profile after sign in/sign up (non-critical call)
  async callProfileEndpoint(): Promise<any> {
    try {
      return await this.request<any>(`/api/profile`, { method: 'GET' });
    } catch (error: any) {
      logger.error('[API] callProfileEndpoint error:', error?.message || error);
      return null;
    }
  }

  // ========== ARTICLE STATS ==========

  async recordArticleView(articleId: string | number): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const endpoint = `/api/profile/stats/article-view`;
      logger.log('[API] recordArticleView: Recording view for article:', articleId);
      const response = await this.request<any>(endpoint, {
        method: 'POST',
        body: { articleId: String(articleId) },
      });

      return {
        success: response.success ?? true,
        error: response.error,
      };
    } catch (error: any) {
      logger.error('[API] recordArticleView error:', {
        message: error?.message,
        status: error?.status,
        url: error?.url,
      });
      return {
        success: false,
        error: error?.message || 'Failed to record article view',
      };
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
    // When the user has reached their daily comment limit
    limitReached?: boolean;
    nextCommentAvailable?: string;
    message?: string;
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
        // Respect backend "success" flag if present, otherwise infer from presence of comment
        success: response.success !== undefined ? response.success : !!response.comment,
        comment: response.comment,
        limitReached: response.limitReached,
        nextCommentAvailable: response.nextCommentAvailable,
        message: response.message,
        error: response.error,
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
      
      const response = await this.request<any>(endpoint, {
        method: 'DELETE',
      });

      // Check if response indicates failure
      if (response && response.success === false) {
        return {
          success: false,
          error: response.error || response.message || 'Failed to delete comment',
        };
      }

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

  // ========== BOOKMARKS API ==========

  // Bookmark an article
  async bookmarkArticle(articleId: string | number): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const articleIdStr = String(articleId);
      const endpoint = `/api/articles/${encodeURIComponent(articleIdStr)}/bookmark`;
      
      const response = await this.request<any>(endpoint, {
        method: 'POST',
        body: { articleId: articleIdStr },
      });

      return {
        success: response.success ?? true,
      };
    } catch (error: any) {
      logger.error('[API] bookmarkArticle error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
      });
      return {
        success: false,
        error: error?.message || 'Failed to bookmark article',
      };
    }
  }

  // Unbookmark an article
  async unbookmarkArticle(articleId: string | number): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const articleIdStr = String(articleId);
      const endpoint = `/api/articles/${encodeURIComponent(articleIdStr)}/bookmark`;
      
      const response = await this.request<any>(endpoint, {
        method: 'DELETE',
      });

      return {
        success: response.success ?? true,
      };
    } catch (error: any) {
      logger.error('[API] unbookmarkArticle error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
      });
      return {
        success: false,
        error: error?.message || 'Failed to unbookmark article',
      };
    }
  }

  // Get saved articles for the authenticated user
  async getSavedArticles(): Promise<{
    success: boolean;
    articles?: Array<{
      id: number;
      title: string;
      hero_image_id: number | null;
      content: {
        root: {
          children: any[];
        };
      };
      published_at: string;
      slug: string;
      imageUrl?: string;
    }>;
    count?: number;
    error?: string;
  }> {
    try {
      const endpoint = `/api/profile/saved-articles`;
      const response = await this.request<any>(endpoint, {
        method: 'GET',
      });

      return {
        success: response.success ?? true,
        articles: response.articles || [],
        count: response.count || 0,
      };
    } catch (error: any) {
      logger.error('[API] getSavedArticles error:', {
        message: error?.message,
        stack: error?.stack,
        status: error?.status,
        url: error?.url,
      });
      return {
        success: false,
        error: error?.message || 'Failed to fetch saved articles',
        articles: [],
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

