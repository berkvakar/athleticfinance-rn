import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import AuthScreen from '../screens/AuthScreen';
import SignInScreen from '../screens/SignInScreen';
import VerificationScreen from '../screens/VerificationScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import AFPlusScreen from '../screens/AFPlusScreen';
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import LoadingScreen from '../components/LoadingScreen';

export type RootStackParamList = {
  Auth: undefined;
  SignIn: undefined;
  Verification: {
    email: string;
    username: string;
    password: string;
  };
  Welcome: undefined;
  MainTabs: undefined;
  Settings: undefined;
};

export type MainTabParamList = {
  AFPlus: undefined;
  Home: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#999',
        tabBarShowLabel: false, // Remove labels from icons
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E5E5E5',
          backgroundColor: '#fff',
          paddingTop: 12,
          paddingBottom: 12,
          height: 80,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tab.Screen
        name="AFPlus"
        component={AFPlusScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Text style={[styles.afPlusText, { color }]}>
              AF+
            </Text>
          ),
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="home" size={36} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="person" size={36} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  // Log navigation state changes
  useEffect(() => {
    console.log('[APP_NAVIGATOR] User state changed - user:', user ? 'authenticated' : 'not authenticated', 'loading:', loading);
    if (user) {
      console.log('[APP_NAVIGATOR] User authenticated, navigating to MainTabs');
      console.log('[APP_NAVIGATOR] User details - email:', user.email, 'username:', user.username);
    } else {
      console.log('[APP_NAVIGATOR] User not authenticated, showing auth screens');
    }
  }, [user, loading]);

  // Show loading while checking auth status
  if (loading) {
    console.log('[APP_NAVIGATOR] Still loading auth status...');
    return <LoadingScreen />;
  }

  console.log('[APP_NAVIGATOR] Rendering navigator - user authenticated:', !!user);
  
  if (user) {
    console.log('[APP_NAVIGATOR] Rendering MainTabs for authenticated user');
  } else {
    console.log('[APP_NAVIGATOR] Rendering auth screens for unauthenticated user');
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {user ? (
          // User is authenticated - show welcome screen first, then main tabs
          <>
            <Stack.Screen 
              name="Welcome" 
              component={WelcomeScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen 
              name="MainTabs" 
              component={MainTabNavigator}
              options={{
                headerShown: false,
                animation: 'none', // Instant transition, no animation delay
                animationDuration: 0, // Ensure no animation delay
              }}
            />
            <Stack.Screen 
              name="Settings" 
              component={SettingsScreen}
              options={{
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
          </>
        ) : (
          // User is not authenticated
          <>
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen 
              name="SignIn" 
              component={SignInScreen}
              options={{
                animation: 'slide_from_right',
                gestureDirection: 'horizontal',
                animationDuration: 350,
              }}
            />
            <Stack.Screen 
              name="Verification" 
              component={VerificationScreen}
              options={{
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen 
              name="Welcome" 
              component={WelcomeScreen}
              options={{
                animation: 'slide_from_bottom',
                headerShown: false,
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  afPlusIcon: {
    width: 36,
    height: 36,
  },
  afPlusText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

