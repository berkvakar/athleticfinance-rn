import { Amplify } from 'aws-amplify';
import Constants from 'expo-constants';

// Get environment variables from app.config.js extra field or process.env
const cognitoUserPoolId = Constants.expoConfig?.extra?.cognitoUserPoolId || process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID;
const cognitoClientId = Constants.expoConfig?.extra?.cognitoClientId || process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;
const cognitoRegion = Constants.expoConfig?.extra?.cognitoRegion || process.env.EXPO_PUBLIC_COGNITO_REGION || 'us-east-1';

// Validate required environment variables
if (!cognitoUserPoolId || !cognitoClientId) {
  console.error('[AMPLIFY] ❌ Missing required environment variables!');
  console.error('[AMPLIFY] Please set EXPO_PUBLIC_COGNITO_USER_POOL_ID and EXPO_PUBLIC_COGNITO_CLIENT_ID in your .env file');
  throw new Error('Missing required AWS Cognito configuration. Please check your .env file.');
}

// Log the configuration to verify correct User Pool is being used
console.log('[AMPLIFY] Configuring Amplify with:');
console.log('[AMPLIFY] User Pool ID:', cognitoUserPoolId);
console.log('[AMPLIFY] Client ID:', cognitoClientId);
console.log('[AMPLIFY] Region:', cognitoRegion);

const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: cognitoUserPoolId,
      userPoolClientId: cognitoClientId,
      region: cognitoRegion,
    },
  },
};

Amplify.configure(amplifyConfig);

export default amplifyConfig;

