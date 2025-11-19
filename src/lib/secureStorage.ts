/**
 * Secure Storage Utility
 * 
 * Provides encrypted storage for sensitive data using expo-secure-store
 * Falls back to AsyncStorage with encryption for non-sensitive data
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

/**
 * Sanitize key for SecureStore
 * SecureStore only allows: alphanumeric, ".", "-", and "_"
 * Replace @ and other invalid characters with underscore
 */
const sanitizeKey = (key: string): string => {
  if (!key) return key;
  // Replace @ and any other invalid characters with underscore
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
};

/**
 * Store sensitive data securely (encrypted)
 * Uses expo-secure-store which leverages:
 * - iOS: Keychain Services
 * - Android: EncryptedSharedPreferences backed by Android Keystore
 */
export const storeSecure = async (key: string, value: string): Promise<void> => {
  const sanitizedKey = sanitizeKey(key);
  try {
    await SecureStore.setItemAsync(sanitizedKey, value);
    logger.log(`[SecureStorage] Stored secure item`);
  } catch (error) {
    logger.error('[SecureStorage] Error storing secure item:', error);
    throw new Error('Failed to store sensitive data securely');
  }
};

/**
 * Retrieve sensitive data from secure storage
 */
export const getSecure = async (key: string): Promise<string | null> => {
  const sanitizedKey = sanitizeKey(key);
  try {
    const value = await SecureStore.getItemAsync(sanitizedKey);
    logger.log(`[SecureStorage] Retrieved secure item`);
    return value;
  } catch (error) {
    logger.error('[SecureStorage] Error retrieving secure item:', error);
    return null;
  }
};

/**
 * Delete sensitive data from secure storage
 */
export const deleteSecure = async (key: string): Promise<void> => {
  const sanitizedKey = sanitizeKey(key);
  if (!sanitizedKey) {
    logger.warn('[SecureStorage] Attempted to delete with empty key');
    return;
  }
  try {
    await SecureStore.deleteItemAsync(sanitizedKey);
    logger.log(`[SecureStorage] Deleted secure item`);
  } catch (error) {
    logger.error('[SecureStorage] Error deleting secure item:', error);
    // Don't throw - deletion failure shouldn't break the app
  }
};

/**
 * Store non-sensitive data (unencrypted, but still isolated)
 * Use this for UI preferences, non-sensitive settings, etc.
 */
export const store = async (key: string, value: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, value);
    logger.log(`[Storage] Stored item with key: ${key}`);
  } catch (error) {
    logger.error('[Storage] Error storing item:', error);
    throw new Error('Failed to store data');
  }
};

/**
 * Retrieve non-sensitive data
 */
export const get = async (key: string): Promise<string | null> => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value;
  } catch (error) {
    logger.error('[Storage] Error retrieving item:', error);
    return null;
  }
};

/**
 * Delete non-sensitive data
 */
export const remove = async (key: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(key);
    logger.log(`[Storage] Removed item with key: ${key}`);
  } catch (error) {
    logger.error('[Storage] Error removing item:', error);
    // Don't throw - deletion failure shouldn't break the app
  }
};

/**
 * Clear all non-sensitive storage (AsyncStorage only)
 * SECURITY: Secure storage is not cleared to prevent accidental data loss
 */
export const clearAll = async (): Promise<void> => {
  try {
    await AsyncStorage.clear();
    logger.log('[Storage] Cleared all non-sensitive storage');
  } catch (error) {
    logger.error('[Storage] Error clearing storage:', error);
  }
};

/**
 * Clear all secure storage for a specific user
 * Call this on logout to ensure sensitive data is removed
 */
export const clearSecureUserData = async (userEmail: string): Promise<void> => {
  if (!userEmail) {
    logger.warn('[SecureStorage] clearSecureUserData called with empty email');
    return;
  }
  
  try {
    // Clear user-specific secure data
    // Keys will be sanitized inside deleteSecure (@ becomes _)
    await deleteSecure(`username_${userEmail}`);
    await deleteSecure(`cognito_username_${userEmail}`);
    logger.log('[SecureStorage] Cleared user secure data');
  } catch (error) {
    logger.error('[SecureStorage] Error clearing user secure data:', error);
  }
};

// Export a default object for convenience
export default {
  storeSecure,
  getSecure,
  deleteSecure,
  store,
  get,
  remove,
  clearAll,
  clearSecureUserData,
};

