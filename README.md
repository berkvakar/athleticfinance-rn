# Athletic Finance React Native App

A React Native mobile application built with Expo, featuring AWS Cognito authentication and Amplify integration.

## Features

- ✅ AWS Cognito Authentication (Sign Up & Sign In)
- ✅ Email Verification
- ✅ React Navigation
- ✅ TypeScript Support
- ✅ Local Emulator Support

## Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Android Studio (for Android emulator) or Xcode (for iOS simulator)
- Android emulator or iOS simulator set up and running

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:

Create a `.env` file in the root directory with the following variables:

```env
EXPO_PUBLIC_COGNITO_USER_POOL_ID=your-user-pool-id
EXPO_PUBLIC_COGNITO_CLIENT_ID=your-client-id
EXPO_PUBLIC_COGNITO_REGION=us-east-1
EXPO_PUBLIC_API_GATEWAY_URL=https://your-api-gateway-url.execute-api.region.amazonaws.com
```

**Note:** You can copy the `.env` file from the `athleticfinance-vite` project if it exists, but make sure to rename the variables:
- `VITE_COGNITO_USER_POOL_ID` → `EXPO_PUBLIC_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID` → `EXPO_PUBLIC_COGNITO_CLIENT_ID`
- `VITE_COGNITO_REGION` → `EXPO_PUBLIC_COGNITO_REGION`
- `VITE_API_GATEWAY_URL` → `EXPO_PUBLIC_API_GATEWAY_URL`

### Running the App

1. Make sure your emulator/simulator is running:
   - **Android**: Start an Android emulator from Android Studio
   - **iOS**: Start an iOS simulator from Xcode (macOS only)

2. Build and run on a specific platform:
```bash
npm run android # Build and run on Android emulator
npm run ios     # Build and run on iOS simulator (macOS only)
npm run web     # Run in web browser
```

3. For development with hot reload, you can also start the development server:
```bash
npm start
```
Then press `a` for Android or `i` for iOS to launch on the connected emulator/simulator.

## Project Structure

```
athleticfinance-rn/
├── src/
│   ├── components/     # Reusable components
│   ├── contexts/        # React contexts (AuthContext)
│   ├── lib/            # Utilities and configs
│   │   ├── amplifyConfig.ts
│   │   ├── api.ts
│   │   └── planUtils.ts
│   ├── navigation/     # Navigation setup
│   │   └── AppNavigator.tsx
│   └── screens/        # Screen components
│       ├── AuthScreen.tsx
│       ├── SignInScreen.tsx
│       ├── VerificationScreen.tsx
│       └── HomeScreen.tsx
├── assets/            # Images and static assets
├── App.tsx            # Root component
└── app.json           # Expo configuration
```

## Authentication Flow

1. **Sign Up**: Multi-step form with email validation
2. **Email Verification**: 6-digit code verification
3. **Sign In**: Email/password authentication
4. **Protected Routes**: Home screen accessible only when authenticated

## Environment Variables

The app uses Expo's environment variable system. Variables prefixed with `EXPO_PUBLIC_` are exposed to the client-side code.

Required variables:
- `EXPO_PUBLIC_COGNITO_USER_POOL_ID`: AWS Cognito User Pool ID
- `EXPO_PUBLIC_COGNITO_CLIENT_ID`: AWS Cognito App Client ID
- `EXPO_PUBLIC_COGNITO_REGION`: AWS Region (e.g., `us-east-1`)
- `EXPO_PUBLIC_API_GATEWAY_URL`: API Gateway endpoint URL

## Development

The app is set up with:
- TypeScript for type safety
- React Navigation for navigation
- AWS Amplify for authentication
- AsyncStorage for local data persistence

## Notes

- The app uses AsyncStorage instead of localStorage (web-specific)
- Navigation is handled by React Navigation instead of React Router
- All UI components are built with React Native components
- The app uses Expo Development Client for local emulator testing
- Make sure to build the app first using `npm run android` or `npm run ios` before running `npm start`

