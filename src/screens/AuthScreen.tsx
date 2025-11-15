import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
// @ts-ignore - Image import
import afLogo from '../../assets/af-logo.png';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AuthScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { signup, user, loading, confirmSignUp } = useAuth();
  const touchStartY = useRef(0);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const slideTranslateY = useRef(new Animated.Value(0)).current;
  
  const [isLoading, setIsLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [formData, setFormData] = useState({
    firstName: '',
    surname: '',
    email: '',
    password: '',
    username: '',
  });
  const [emailError, setEmailError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isValidatingEmail, setIsValidatingEmail] = useState(false);
  const [verificationData, setVerificationData] = useState<{ email: string; username: string; password: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const verificationInputRefs = useRef<(TextInput | null)[]>([]);
  
  // Redirect will happen automatically via AppNavigator when user state updates

  // Animate slide transitions with faster, smoother animation
  // Adjust these values to control speed:
  // - tension: Higher = faster/snappier (40-100, default: 40, recommended: 65-80 for fast)
  // - friction: Lower = less damping/more bouncy (3-10, default: 7, recommended: 6-7 for smooth)
  useEffect(() => {
    Animated.spring(slideTranslateY, {
      toValue: -currentSlide * SCREEN_HEIGHT,
      useNativeDriver: true,
      tension: 40, // Increased from 50 for faster animation
      friction: 10, // Decreased from 8 for smoother, less damping
    }).start();
  }, [currentSlide]);

  // Animate logo fade-in/out based on currentSlide
  useEffect(() => {
    if (currentSlide !== 0) {
      // Fade in when not on first slide
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Fade out when on first slide
      Animated.timing(logoOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [currentSlide, logoOpacity]);

  // Show loading while checking auth status
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }
  
  // Don't render auth form if user is already signed in
  if (user) {
    return null;
  }

  const passwordRequirements = {
    minLength: formData.password.length >= 8,
    hasNumber: /\d/.test(formData.password),
  };

  const isPasswordValid = passwordRequirements.minLength && passwordRequirements.hasNumber;

  // Email validation: comprehensive check matching Cognito's requirements (RFC 5322 compliant)
  const isValidEmailFormat = (email: string): boolean => {
    if (!email || typeof email !== 'string') return false;
    
    // Trim whitespace
    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0) return false;
    
    // Cognito email length limit (typically 256 characters)
    if (trimmedEmail.length > 256) return false;
    
    // Must contain exactly one @ symbol
    const atIndex = trimmedEmail.indexOf('@');
    if (atIndex === -1 || atIndex !== trimmedEmail.lastIndexOf('@')) return false;
    
    // Split into local and domain parts
    const localPart = trimmedEmail.substring(0, atIndex);
    const domainPart = trimmedEmail.substring(atIndex + 1);
    
    // Local part validation (before @)
    if (localPart.length === 0 || localPart.length > 64) return false; // RFC 5321 limit
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false; // Cannot start/end with dot
    if (localPart.includes('..')) return false; // Cannot have consecutive dots
    // Local part can contain: letters, numbers, dots, hyphens, underscores, plus signs
    if (!/^[a-zA-Z0-9._+-]+$/.test(localPart)) return false;
    
    // Domain part validation (after @)
    if (domainPart.length === 0 || domainPart.length > 253) return false; // RFC 5321 limit
    if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false; // Cannot start/end with dot
    if (domainPart.includes('..')) return false; // Cannot have consecutive dots
    if (!domainPart.includes('.')) return false; // Must have at least one dot (for TLD)
    
    // Domain must have valid structure: subdomain.domain.tld
    const domainParts = domainPart.split('.');
    if (domainParts.length < 2) return false; // Must have at least domain.tld
    
    // TLD (last part) must be at least 2 characters and only letters
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;
    
    // Each domain part must be valid (letters, numbers, hyphens, but not starting/ending with hyphen)
    for (const part of domainParts) {
      if (part.length === 0 || part.length > 63) return false; // RFC 1035 limit
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part)) return false; // Valid domain part pattern
    }
    
    return true;
  };

  const isEmailValid = isValidEmailFormat(formData.email);

  const canProceedToNext = (slideIndex: number): boolean => {
    switch (slideIndex) {
      case 0:
      case 1:
      case 2:
      case 3:
        return true; // Welcome and demo slides - can always proceed
      case 4:
        // Email & Password slide - must have valid email format, valid password, AND email must be validated
        return !!(formData.email && isEmailValid && formData.password && isPasswordValid && !isCheckingEmail && !emailError && !isValidatingEmail);
      case 5:
        // Name slide
        return !!(formData.firstName && formData.surname);
      case 6:
        // Username slide - can't swipe, must submit
        return false;
      case 7:
        // Verification slide - can't swipe, must submit
        return false;
      default:
        return false;
    }
  };

  const validateEmailAndProceed = async () => {
    if (!formData.email) return;
    
    // First check email format
    if (!isValidEmailFormat(formData.email)) {
      setEmailError('Please enter a valid email address (e.g., name@example.com).');
      return;
    }
    
    setIsCheckingEmail(true);
    setIsValidatingEmail(true);
    setEmailError(null);
    
    try {
      console.log('[AUTH] validateEmailAndProceed: Checking email:', formData.email);
      const emailCheck = await apiClient.checkEmailExists(formData.email);
      console.log('[AUTH] validateEmailAndProceed: Email check result:', emailCheck);
      
      if (emailCheck.exists) {
        console.log('[AUTH] validateEmailAndProceed: Email exists, blocking progression');
        setEmailError('This email is already registered. Please use a different email or sign in.');
        setIsCheckingEmail(false);
        setIsValidatingEmail(false);
        return; // Don't proceed to next slide
      }
      
      // Email is available, proceed to next slide
      console.log('[AUTH] validateEmailAndProceed: Email available, proceeding to next slide');
      setCurrentSlide(5);
      setIsCheckingEmail(false);
      setIsValidatingEmail(false);
    } catch (error: any) {
      console.error('[AUTH] validateEmailAndProceed: Error:', error.message);
      setIsCheckingEmail(false);
      setIsValidatingEmail(false);
      
      // Check if error message indicates email exists
      if (error.message.includes('already exists') || error.message.includes('already registered')) {
        console.log('[AUTH] validateEmailAndProceed: Email exists error detected');
        setEmailError('This email is already registered. Please use a different email or sign in.');
        return; // Don't proceed to next slide
      }
      
      // If API is not available, show error and don't proceed
      if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        console.warn('[AUTH] validateEmailAndProceed: Email check API not available');
        setEmailError('Unable to verify email. Please check your connection and try again.');
        return; // Don't proceed without email validation
      } else {
        setEmailError(error.message || 'Unable to verify email. Please try again.');
        return; // Don't proceed on error
      }
    }
  };

  const handleSwipe = async (touchEndY: number) => {
    const swipeDistance = touchStartY.current - touchEndY;
    const minSwipeDistance = 60;

    if (swipeDistance > minSwipeDistance) {
      // Swiped up - try to go to next slide
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        // Haptic feedback if available
        // Note: React Native doesn't have navigator.vibrate, but we can use Haptics API if needed
      }
      
      if (currentSlide < 7) {
        if (currentSlide < 4) {
          // Welcome and demo slides - can always proceed
          setCurrentSlide(currentSlide + 1);
        } else if (currentSlide === 4 && formData.email && isEmailValid && formData.password && isPasswordValid) {
          // Email & Password slide - check email availability before proceeding
          await validateEmailAndProceed();
        } else if (currentSlide === 5 && formData.firstName && formData.surname) {
          // Name slide - can proceed if fields are filled
          setCurrentSlide(currentSlide + 1);
        }
        // Slide 6 (username) and 7 (verification) - can't swipe, must use submit button
      }
    } else if (swipeDistance < -minSwipeDistance) {
      // Swiped down - go to previous slide
      // Prevent going back from verification screen (slide 7)
      if (currentSlide === 7) {
        return; // Cannot scroll up from verification screen
      }
      
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        // Haptic feedback if available
      }
      if (currentSlide > 0) {
        setCurrentSlide(currentSlide - 1);
        // Clear errors when going back
        setEmailError(null);
        setUsernameError(null);
        setIsValidatingEmail(false);
      }
    }
  };

  // Handle touch events for swipe detection
  const handleTouchStart = (event: any) => {
    touchStartY.current = event.nativeEvent.pageY;
  };

  const handleTouchEnd = (event: any) => {
    handleSwipe(event.nativeEvent.pageY);
  };

  const handleSubmit = async () => {
    console.log('🚀🚀🚀 [AUTH] handleSubmit: FUNCTION CALLED 🚀🚀🚀');
    console.log('[AUTH] handleSubmit: formData.email:', formData.email);
    
    // Validate username length before proceeding
    if (!formData.username || !isUsernameValidLength(formData.username)) {
      const usernameLength = getUsernameWithoutAt(formData.username || '').length;
      if (!formData.username || usernameLength < 3) {
        setUsernameError('Username must be between 3-25 characters.');
      } else if (usernameLength > 25) {
        setUsernameError('Username must be between 3-25 characters.');
      }
      setIsLoading(false);
      return;
    }
    
    // Use username as-is (no AF suffix)
    const finalUsername = formData.username.toLowerCase().trim();

    setIsLoading(true);
    setEmailError(null);
    setUsernameError(null);
    
    try {
      // STEP 1: Check email FIRST (Lambda function call only - NO Cognito calls yet)
      console.log('========================================');
      console.log('[AUTH] handleSubmit: STEP 1 - Checking email via Lambda function...');
      setIsCheckingEmail(true);
      
      try {
        const emailCheck = await apiClient.checkEmailExists(formData.email);
        console.log('[AUTH] handleSubmit: ✅ Email check completed!');
        
        if (emailCheck.exists) {
          console.error('[AUTH] handleSubmit: Email exists - BLOCKING signup');
          setCurrentSlide(4);
          setEmailError('This email is already registered. Please use a different email or sign in.');
          setIsCheckingEmail(false);
          setIsLoading(false);
          return;
        }
        console.log('[AUTH] handleSubmit: Email check passed - email is available');
      } catch (error: any) {
        console.error('[AUTH] handleSubmit: Email check error:', error.message);
        setIsCheckingEmail(false);
        
        if (error.message.includes('already exists') || error.message.includes('already registered')) {
          setCurrentSlide(4);
          setEmailError('This email is already registered. Please use a different email or sign in.');
          setIsLoading(false);
          return;
        }
        if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
          setIsLoading(false);
          return;
        }
        setIsLoading(false);
        return;
      }
      
      setIsCheckingEmail(false);
      
      // STEP 2: Email check passed - proceed directly to Cognito signup
      console.log('[AUTH] handleSubmit: Email check passed, calling Cognito signup...');
      const result = await signup(
        formData.email,
        formData.password,
        `${formData.firstName} ${formData.surname}`,
        finalUsername
      );
      
      // Check if verification is required
      if (result && 'requiresVerification' in result && result.requiresVerification) {
        // Use the cleaned username from the signup result (already has @ and AF removed)
        const cognitoUsername = result.username || finalUsername.replace(/^@+/, '').replace(/af$/i, '').toLowerCase().trim();
        setVerificationData({
          email: formData.email,
          username: cognitoUsername,
          password: formData.password,
        });
        setIsLoading(false);
        // Scroll to verification slide
        setCurrentSlide(7);
        // Focus first verification input after animation
        setTimeout(() => {
          verificationInputRefs.current[0]?.focus();
        }, 500);
      } else {
        // Navigation will happen automatically via AppNavigator when user state updates
      }
    } catch (error: any) {
      console.error('[AUTH] handleSubmit: Error during signup process:', error.message);
      setIsCheckingEmail(false);
      
      if (error.message.includes('already exists') || 
          error.message.includes('already taken') || 
          error.message.includes('UsernameExistsException') ||
          error.message.includes('username')) {
        setUsernameError('This username is already taken. Please choose another.');
      }
      setIsLoading(false);
    }
  };

  // Username validation: 3-25 characters (excluding @)
  const getUsernameWithoutAt = (username: string): string => {
    return username.replace(/^@+/, '');
  };

  const isUsernameValidLength = (username: string): boolean => {
    const usernameWithoutAt = getUsernameWithoutAt(username);
    return usernameWithoutAt.length >= 3 && usernameWithoutAt.length <= 25;
  };

  const handleUsernameChange = (value: string) => {
    let username = value;
    if (username && !username.startsWith('@')) {
      username = '@' + username;
    }
    
    setFormData({ ...formData, username });
  };

  const handleVerificationCodeChange = (index: number, value: string) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...verificationCode];
    newCode[index] = value;
    setVerificationCode(newCode);
    
    // Clear error when user starts typing
    if (verificationError) setVerificationError(null);

    // Auto-focus next input
    if (value && index < 5) {
      verificationInputRefs.current[index + 1]?.focus();
    }
  };

  const handleVerificationKeyPress = (index: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && !verificationCode[index] && index > 0) {
      verificationInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerificationSubmit = async () => {
    console.log('[AUTH_SCREEN] handleVerificationSubmit: Starting verification');
    
    if (!verificationData) {
      console.log('[AUTH_SCREEN] handleVerificationSubmit: No verification data available');
      return;
    }
    
    const code = verificationCode.join('');
    console.log('[AUTH_SCREEN] handleVerificationSubmit: Verification code:', code);
    console.log('[AUTH_SCREEN] handleVerificationSubmit: Username:', verificationData.username);
    console.log('[AUTH_SCREEN] handleVerificationSubmit: Email:', verificationData.email);
    
    if (code.length !== 6) {
      console.log('[AUTH_SCREEN] handleVerificationSubmit: Code length invalid:', code.length);
      return;
    }

    console.log('[AUTH_SCREEN] handleVerificationSubmit: Code is valid, starting verification...');
    setIsVerifying(true);
    setVerificationError(null);
    
    try {
      console.log('[AUTH_SCREEN] handleVerificationSubmit: Calling confirmSignUp...');
      await confirmSignUp(verificationData.username, code, verificationData.password, verificationData.email);
      console.log('[AUTH_SCREEN] handleVerificationSubmit: confirmSignUp completed successfully');
      console.log('[AUTH_SCREEN] handleVerificationSubmit: Navigation will happen automatically via AppNavigator when user state updates');
    } catch (error: any) {
      console.error('[AUTH_SCREEN] handleVerificationSubmit: Error during verification:', error);
      console.error('[AUTH_SCREEN] handleVerificationSubmit: Error message:', error?.message);
      // Clear code on error
      setVerificationCode(['', '', '', '', '', '']);
      verificationInputRefs.current[0]?.focus();
      const errorMessage = error.message || 'Invalid verification code. Please try again.';
      console.log('[AUTH_SCREEN] handleVerificationSubmit: Setting error message:', errorMessage);
      setVerificationError(errorMessage);
    } finally {
      console.log('[AUTH_SCREEN] handleVerificationSubmit: Verification process completed, setting isVerifying to false');
      setIsVerifying(false);
    }
  };

  const demoSlides = [
    {
      icon: 'notifications',
      title: '1 Notification',
      description: 'No noise.',
    },
    {
      icon: 'article',
      title: '1 Article',
      description: 'Written with love.',
    },
    {
      icon: 'people',
      title: '1 Community',
      description: 'Eat dinner at the table, not in your room.',
    },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Fixed Logo Header - Fades in/out smoothly */}
      <Animated.View 
        style={[
          styles.logoHeaderBar,
          { opacity: logoOpacity, pointerEvents: currentSlide === 0 ? 'none' : 'auto' }
        ]}
      >
        <View style={styles.logoContainer}>
          <Image source={afLogo} style={styles.logo} resizeMode="contain" />
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.slidesContainer,
          {
            transform: [{ translateY: slideTranslateY }],
          },
        ]}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Welcome Slide (0) */}
        <View style={styles.page}>
          <View style={styles.slideContainer}>
            <Image source={afLogo} style={styles.welcomeLogo} resizeMode="contain" />
            <Text style={styles.welcomeTitle}>Sports Finance Simplified.</Text>
            <View style={styles.swipeHintContainer}>
              <Text style={styles.swipeHintText}>Swipe up to continue</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.signInButtonBottom}
            onPress={() => navigation.navigate('SignIn')}
          >
            <Text style={styles.switchText}>
              Already have an account? <Text style={styles.switchLink}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Demo Slides (1-3) - Removed "1 Dollar" slide */}
        {[1, 2, 3].map((slideNum) => (
          <View key={slideNum.toString()} style={styles.page}>
            <View style={styles.slideContainer}>
              <View style={styles.iconContainer}>
                <View style={styles.iconCircle}>
                  <MaterialIcons 
                    name={demoSlides[slideNum - 1].icon as any} 
                    size={40} 
                    color="#333" 
                  />
                </View>
              </View>
              <Text style={styles.slideTitle}>{demoSlides[slideNum - 1].title}</Text>
              <Text style={styles.slideDescription}>{demoSlides[slideNum - 1].description}</Text>
              <View style={styles.swipeHintContainer}>
                <Text style={styles.swipeHintText}>Swipe up to continue</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Form Slide 1: Email & Password (4) */}
        <View style={styles.page}>
          <View style={styles.slideContainer}>
            <Text style={styles.formTitle}>Create your AF account</Text>
            <Text style={styles.formSubtitle}>Your data is yours. We will never share it.</Text>

             <View style={styles.inputContainer}>
               <Text style={styles.label}>Email</Text>
               <TextInput
                 style={[styles.input, emailError && styles.inputError]}
                 value={formData.email}
                 onChangeText={(text) => {
                   setFormData({ ...formData, email: text });
                   setEmailError(null);
                 }}
                 keyboardType="email-address"
                 autoCapitalize="none"
                 autoComplete="email"
               />
               {emailError && <Text style={styles.errorText}>{emailError}</Text>}
               {isCheckingEmail && <Text style={styles.checkingText}>Checking email availability...</Text>}
             </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={formData.password}
                onChangeText={(text) => setFormData({ ...formData, password: text })}
                secureTextEntry
                autoCapitalize="none"
              />
              {formData.password && (
                <View style={styles.passwordRequirements}>
                  <Text style={[styles.requirement, passwordRequirements.minLength && styles.requirementMet]}>
                    {passwordRequirements.minLength ? '✓' : '○'} At least 8 characters
                  </Text>
                  <Text style={[styles.requirement, passwordRequirements.hasNumber && styles.requirementMet]}>
                    {passwordRequirements.hasNumber ? '✓' : '○'} At least 1 number
                  </Text>
                </View>
              )}
            </View>

            {formData.email && isEmailValid && formData.password && isPasswordValid && !isCheckingEmail && !emailError && (
              <View style={styles.swipeHintContainer}>
                <Text style={styles.swipeHintText}>Swipe up when ready</Text>
              </View>
            )}
          </View>
        </View>

        {/* Form Slide 2: Name (5) */}
        <View style={styles.page}>
          <View style={styles.slideContainer}>
            <Text style={styles.formTitle}>What's your name?</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                value={formData.firstName}
                onChangeText={(text) => setFormData({ ...formData, firstName: text })}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={formData.surname}
                onChangeText={(text) => setFormData({ ...formData, surname: text })}
                autoCapitalize="words"
              />
            </View>

            {formData.firstName && formData.surname && (
              <View style={styles.swipeHintContainer}>
                <Text style={styles.swipeHintText}>Swipe up to continue</Text>
              </View>
            )}
          </View>
        </View>

        {/* Form Slide 3: Username (6) */}
        <View style={styles.page}>
          <View style={styles.slideContainer}>
            <Text style={styles.formTitle}>Create your username</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={[styles.input, usernameError && styles.inputError]}
                value={formData.username}
                onChangeText={(text) => {
                  handleUsernameChange(text);
                  setUsernameError(null);
                }}
                autoCapitalize="none"
                maxLength={26} // 25 chars + @ symbol
              />
              {usernameError && <Text style={styles.errorText}>{usernameError}</Text>}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => navigation.navigate('SignIn')}
            >
              <Text style={styles.switchText}>
                Already have an account? <Text style={styles.switchLink}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form Slide 4: Verification (7) */}
        {verificationData && (
          <View style={styles.page}>
            <View style={styles.slideContainer}>
              <View style={styles.iconContainer}>
                <View style={styles.iconCircle}>
                  <MaterialIcons 
                    name="email" 
                    size={40} 
                    color="#333" 
                  />
                </View>
              </View>
              
              <Text style={styles.formTitle}>Verify your email</Text>
              <Text style={styles.formSubtitle}>
                We sent a verification code to
              </Text>
              <Text style={styles.emailText}>{verificationData.email}</Text>

              {/* Verification Code Input */}
              <View style={styles.codeContainer}>
                {verificationCode.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => { verificationInputRefs.current[index] = ref; }}
                    style={[styles.codeInput, verificationError && styles.codeInputError]}
                    value={digit}
                    onChangeText={(value) => handleVerificationCodeChange(index, value)}
                    onKeyPress={(e) => handleVerificationKeyPress(index, e)}
                    keyboardType="numeric"
                    maxLength={1}
                    selectTextOnFocus
                  />
                ))}
              </View>

              {verificationError && (
                <Text style={styles.errorText}>{verificationError}</Text>
              )}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!verificationCode.every(digit => digit !== '') || isVerifying) && styles.submitButtonDisabled
                ]}
                onPress={handleVerificationSubmit}
                disabled={!verificationCode.every(digit => digit !== '') || isVerifying}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Verify Email</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => {
                  // TODO: Implement resend code functionality
                  setVerificationError(null);
                  setVerificationCode(['', '', '', '', '', '']);
                  verificationInputRefs.current[0]?.focus();
                }}
              >
                <Text style={styles.switchText}>
                  Didn't receive the code? <Text style={styles.switchLink}>Resend code</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  slidesContainer: {
    width: '100%',
    height: SCREEN_HEIGHT * 8, // Total height for all 8 slides
  },
  page: {
    width: '100%',
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  logoHeaderBar: {
    width: '100%',
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    zIndex: 10,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: 0,
  },
  logoContainer: {
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    height: 60,
    width: 60,
  },
  welcomeLogo: {
    height: 160,
    width: 160,
    alignSelf: 'center',
    marginBottom: 40,
  },
  slideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    width: '100%',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'normal',
    color: '#666',
    textAlign: 'center',
    marginBottom: 60,
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  slideDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    marginBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#000',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 0,
    color: '#000',
  },
  inputError: {
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  usernameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 50,
  },
  usernameInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    color: '#000',
  },
  usernameSuffix: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 4,
  },
  checkingText: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  passwordRequirements: {
    marginTop: 8,
  },
  requirement: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  requirementMet: {
    color: '#10B981',
  },
  submitButton: {
    width: '100%',
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#999',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  switchButton: {
    marginTop: 20,
  },
  signInButtonBottom: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  switchLink: {
    color: '#000',
    fontWeight: '500',
  },
  swipeHintContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  swipeHintText: {
    fontSize: 14,
    color: '#999',
  },
  emailText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 40,
    color: '#000',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 30,
    width: '100%',
  },
  codeInput: {
    width: 50,
    height: 50,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    borderWidth: 0,
  },
  codeInputError: {
    borderWidth: 2,
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
});
