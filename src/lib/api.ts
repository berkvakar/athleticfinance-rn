import { fetchAuthSession } from 'aws-amplify/auth';
import Constants from 'expo-constants';

// Get API Gateway URL from app.config.js extra field or process.env
const API_BASE_URL = Constants.expoConfig?.extra?.apiGatewayUrl || process.env.EXPO_PUBLIC_API_GATEWAY_URL || '';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
      
      return headers;
    } catch (error) {
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

        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API Error: ${response.statusText}`);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return {} as T;
    } catch (error: any) {
      // Retry logic for network errors
      if (error.message === 'Failed to fetch' && method === 'GET') {
        // Retry once after 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.request<T>(endpoint, options);
      }
      
      throw error;
    }
  }

  // Username/Email Validation (no auth required)
  
  // User Profile from DynamoDB
  async getUserProfile(username: string): Promise<any> {
    // Strip @ symbol if present (DynamoDB stores without @)
    const cleanUsername = username.replace(/^@/, '');
    
    console.log('[API] getUserProfile: Fetching profile for username:', cleanUsername);
    console.log('[API] getUserProfile: Full URL:', `${API_BASE_URL}/users/getUserDetails?username=${cleanUsername}`);
    
    try {
      const profile = await this.request<any>(`/users/getUserDetails?username=${encodeURIComponent(cleanUsername)}`);
      console.log('[API] getUserProfile: ✅ Profile fetched successfully');
      return profile;
    } catch (error: any) {
      console.error('[API] getUserProfile: ❌ Error fetching profile:', error.message);
      throw error;
    }
  }

  // User Comments/Posts
  async getUserComments(userId: string): Promise<any[]> {
    return this.request<any[]>(`/users/${userId}/comments`);
  }

  async checkEmailExists(email: string): Promise<{ exists: boolean }> {
    // Don't require auth headers for this endpoint
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    console.log('========================================');
    console.log('[API] checkEmailExists: 🚀 INVOKING LAMBDA FUNCTION VIA API GATEWAY');
    console.log('[API] checkEmailExists: Email to check:', email);
    console.log('[API] checkEmailExists: API_BASE_URL:', API_BASE_URL);
    console.log('[API] checkEmailExists: Full API URL:', `${API_BASE_URL}/users/check-email?email=${encodeURIComponent(email)}`);
    
    if (!API_BASE_URL) {
      console.error('[API] checkEmailExists: ❌ API_BASE_URL is empty! Check EXPO_PUBLIC_API_GATEWAY_URL environment variable');
      throw new Error('API Gateway URL is not configured. Please set EXPO_PUBLIC_API_GATEWAY_URL environment variable.');
    }
    
    const response = await fetch(`${API_BASE_URL}/users/check-email?email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers,
    });

    console.log('[API] checkEmailExists: ✅ Lambda function called!');
    console.log('[API] checkEmailExists: Response status:', response.status);

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
      console.warn('[API] checkEmailExists: Non-JSON response:', text);
      
      try {
        return JSON.parse(text);
      } catch (e) {
        // If not JSON, assume email doesn't exist (for development/testing)
        console.warn('[API] checkEmailExists: Could not parse response as JSON, assuming email does not exist');
        return { exists: false };
      }
    }
  }
}

export const apiClient = new ApiClient();

