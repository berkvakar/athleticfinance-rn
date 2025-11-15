require('dotenv').config();

// Simple config export - works for local development with emulators
// If you need EAS Build, change this to a function export
module.exports = {
  expo: {
    name: 'athleticfinance-rn',
    slug: 'athleticfinance-rn',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/af-logo.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      bundleIdentifier: 'com.athleticfinance.rn',
      supportsTablet: true,
    },
    android: {
      package: 'com.athleticfinance.rn',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      // Expose environment variables to the app
      // Support both EXPO_PUBLIC_ and EXPO_ prefixes for flexibility
      cognitoUserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID || process.env.EXPO_COGNITO_USER_POOL_ID,
      cognitoClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || process.env.EXPO_COGNITO_CLIENT_ID,
      cognitoRegion: process.env.EXPO_PUBLIC_COGNITO_REGION || process.env.EXPO_COGNITO_REGION || 'us-east-1',
      apiGatewayUrl: process.env.EXPO_PUBLIC_API_GATEWAY_URL || process.env.EXPO_API_GATEWAY_URL,
      eas: {
        projectId: 'acfca775-b4bd-429d-baa1-0887577382b5',
      },
    },
  },
};

