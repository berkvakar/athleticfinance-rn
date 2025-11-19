import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../contexts/AuthContext';
import afLogo from '../../assets/af-logo.png';

interface VerificationScreenParams {
  email: string;
  username: string;
  password: string;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function VerificationScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { email, username, password } = (route.params || {}) as VerificationScreenParams;
  const { confirmSignUp } = useAuth();
  
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    // Focus first input on mount
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
  }, []);

  const handleCodeChange = (index: number, value: string) => {
    // Handle paste - if multiple characters are entered
    if (value.length > 1) {
      // Extract only digits from pasted content
      const digits = value.replace(/\D/g, '').slice(0, 6);
      
      if (digits.length > 0) {
        const newCode = [...code];
        
        // Fill in the digits starting from current index
        for (let i = 0; i < digits.length && (index + i) < 6; i++) {
          newCode[index + i] = digits[i];
        }
        
        setCode(newCode);
        
        // Focus on the next empty field or the last field
        const nextIndex = Math.min(index + digits.length, 5);
        inputRefs.current[nextIndex]?.focus();
      }
      return;
    }

    // Only allow numbers for single character input
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, e: any) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    console.log('[VERIFICATION_SCREEN] handleSubmit: Starting verification');
    
    const verificationCode = code.join('');
    console.log('[VERIFICATION_SCREEN] handleSubmit: Verification code:', verificationCode);
    console.log('[VERIFICATION_SCREEN] handleSubmit: Username:', username);
    console.log('[VERIFICATION_SCREEN] handleSubmit: Email:', email);
    
    if (verificationCode.length !== 6) {
      console.log('[VERIFICATION_SCREEN] handleSubmit: Code length invalid:', verificationCode.length);
      return;
    }

    console.log('[VERIFICATION_SCREEN] handleSubmit: Code is valid, starting verification...');
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[VERIFICATION_SCREEN] handleSubmit: Calling confirmSignUp...');
      await confirmSignUp(username, verificationCode, password, email);
      console.log('[VERIFICATION_SCREEN] handleSubmit: confirmSignUp completed successfully');
      console.log('[VERIFICATION_SCREEN] handleSubmit: Navigation will happen automatically via AppNavigator when user state updates');
    } catch (error: any) {
      console.error('[VERIFICATION_SCREEN] handleSubmit: Error during verification:', error);
      console.error('[VERIFICATION_SCREEN] handleSubmit: Error message:', error?.message);
      console.error('[VERIFICATION_SCREEN] handleSubmit: Error name:', error?.name);
      // Clear code on error
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      const errorMessage = error.message || 'Invalid verification code. Please try again.';
      console.log('[VERIFICATION_SCREEN] handleSubmit: Setting error message:', errorMessage);
      setError(errorMessage);
    } finally {
      console.log('[VERIFICATION_SCREEN] handleSubmit: Verification process completed, setting isLoading to false');
      setIsLoading(false);
    }
  };

  const isCodeComplete = code.every(digit => digit !== '');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Fixed Logo Header */}
      <View style={styles.logoContainer}>
        <Image source={afLogo} style={styles.logo} resizeMode="contain" />
      </View>

      {/* Content Area */}
      <View style={styles.contentContainer}>
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle} />
        </View>

        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.description}>
          We sent a verification code to
        </Text>
        <Text style={styles.email}>{email}</Text>

        {/* Verification Code Input */}
        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              style={[styles.codeInput, error && styles.codeInputError]}
              value={digit}
              onChangeText={(value) => {
                handleCodeChange(index, value);
                // Clear error when user starts typing
                if (error) setError(null);
              }}
              onKeyPress={(e) => handleKeyPress(index, e)}
              keyboardType="numeric"
              maxLength={6}
              selectTextOnFocus
            />
          ))}
        </View>

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.submitButton, (!isCodeComplete || isLoading) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!isCodeComplete || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Verify Email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendButton}
          onPress={() => {
            // TODO: Implement resend code functionality
            setError(null);
            setCode(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
          }}
        >
          <Text style={styles.resendText}>
            Didn't receive the code? <Text style={styles.resendLink}>Resend code</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
  },
  logo: {
    height: 40,
    width: 40,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  iconContainer: {
    marginBottom: 30,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 40,
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
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  submitButton: {
    width: '100%',
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 8,
    marginBottom: 20,
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
  resendButton: {
    marginTop: 10,
  },
  resendText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  resendLink: {
    color: '#000',
    fontWeight: '500',
  },
});

