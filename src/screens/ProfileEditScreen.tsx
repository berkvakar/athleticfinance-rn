import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SelectedImage {
  uri: string;
  type: string;
  name: string;
}

// Global variable to store the selected profile picture so it can be accessed elsewhere in the app
export let globalSelectedProfileImage: SelectedImage | null = null;

export const setGlobalSelectedProfileImage = (image: SelectedImage | null) => {
  globalSelectedProfileImage = image;
};

export const getGlobalSelectedProfileImage = (): SelectedImage | null => {
  return globalSelectedProfileImage;
};

export default function ProfileEditScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, updateProfile } = useAuth();

  // Local state for editing
  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(user?.avatar || null);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Profile picture zoom modal
  const [isZoomed, setIsZoomed] = useState(false);
  const zoomScale = useRef(new Animated.Value(0)).current;
  const zoomOpacity = useRef(new Animated.Value(0)).current;

  // Sync preview with user avatar when user data updates (after refresh)
  // Handle S3 keys by converting them to URLs
  // Only sync if we don't have a selected image (to preserve local selection)
  useEffect(() => {
    if (!selectedImage) {
      if (user?.avatar) {
        // Check if it's an S3 key (doesn't start with http) or already a URL
        if (!user.avatar.startsWith('http')) {
          // It's an S3 key - convert to URL
          console.log('[PROFILE EDIT] Avatar is S3 key, fetching URL:', user.avatar);
          const { apiClient } = require('../lib/api');
          apiClient.getProfilePictureUrl(user.avatar)
            .then((result: { success: boolean; url?: string; error?: string }) => {
              if (result.success && result.url) {
                console.log('[PROFILE EDIT] Got URL from S3 key:', result.url);
                setPreviewImageUri(result.url);
              } else {
                console.warn('[PROFILE EDIT] Failed to get URL for S3 key:', user.avatar);
                setPreviewImageUri(null);
              }
            })
            .catch((error: any) => {
              console.error('[PROFILE EDIT] Error fetching URL for S3 key:', error);
              setPreviewImageUri(null);
            });
        } else {
          // It's already a URL
          console.log('[PROFILE EDIT] Setting previewImageUri to URL:', user.avatar);
          setPreviewImageUri(user.avatar);
        }
      } else {
        setPreviewImageUri(null);
      }
    }
  }, [user?.avatar, selectedImage]);

  // Sync bio with user data when it changes
  useEffect(() => {
    if (user?.bio !== undefined) {
      setBio(user.bio || '');
    }
  }, [user?.bio]);

  // Track if there are changes
  useEffect(() => {
    const bioChanged = bio !== (user?.bio || '');
    const imageChanged = selectedImage !== null;
    setHasChanges(bioChanged || imageChanged);
  }, [bio, selectedImage, user?.bio]);

  const handleImagePicker = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Please grant camera roll permissions to change your profile picture.'
        );
        return;
      }

      // Launch image picker - optimized for mobile (Android & iOS)
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio for profile pictures
        quality: 0.8, // Good balance between quality and file size
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileExtension = asset.uri.split('.').pop() || 'jpg';
        const fileName = `profile_${Date.now()}.${fileExtension}`;
        
        const imageData = {
          uri: asset.uri,
          type: asset.mimeType || `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`,
          name: fileName,
        };
        
        setSelectedImage(imageData);
        setPreviewImageUri(asset.uri);
        
        // Save to global variable so it can be accessed elsewhere in the app
        setGlobalSelectedProfileImage(imageData);
        
        // Save the image URI to user context so it can be used elsewhere in the app
        if (user) {
          updateProfile({ avatar: asset.uri });
        }
      }
    } catch (error) {
      console.error('[PROFILE EDIT] Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleProfilePicturePress = () => {
    // If there's a profile image, show zoom modal
    // Otherwise open image picker
    if (previewImageUri) {
      openZoomModal();
    } else {
      handleImagePicker();
    }
  };

  const openZoomModal = () => {
    setIsZoomed(true);
    Animated.parallel([
      Animated.spring(zoomScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(zoomOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeZoomModal = () => {
    Animated.parallel([
      Animated.spring(zoomScale, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(zoomOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsZoomed(false);
    });
  };

  const handleSave = async () => {
    if (!hasChanges) {
      navigation.goBack();
      return;
    }

    setSaving(true);

    try {
      // Get current values for comparison
      const currentDescription = user?.bio || '';
      const descriptionChanged = bio !== currentDescription;

      // Prepare updates for API call
      const apiUpdates: {
        description?: string;
        profilePic?: {
          uri: string;
          type: string;
          name: string;
        };
      } = {};

      // Add description if changed
      if (descriptionChanged) {
        apiUpdates.description = bio;
      }

      // Add profile picture if changed
      if (selectedImage) {
        apiUpdates.profilePic = selectedImage;
      }

      // Call API to update profile
      if (Object.keys(apiUpdates).length > 0) {
        const { apiClient } = await import('../lib/api');
        const result = await apiClient.updateUserProfile(apiUpdates);

        if (!result.success) {
          throw new Error(result.error || 'Failed to update profile');
        }

        // Update user context with the response from API
        const updates: Partial<typeof user> = {};

        // Update description if it was changed
        if (descriptionChanged && result.profile?.description !== undefined) {
          updates.bio = result.profile.description;
        }

        // Update profile picture URL if it was changed
        if (selectedImage && result.profile?.profilePicUrl) {
          // Ensure it's saved to global variable
          setGlobalSelectedProfileImage(selectedImage);
          
          // Update avatar with the S3 URL returned from backend
          updates.avatar = result.profile.profilePicUrl;
        } else if (selectedImage) {
          // Fallback: use local URI if backend didn't return URL
          setGlobalSelectedProfileImage(selectedImage);
          updates.avatar = selectedImage.uri;
        }

        // Update user context with all changes
        if (Object.keys(updates).length > 0) {
          updateProfile(updates);
        }

        // Navigate back to profile screen
        navigation.goBack();
      }
    } catch (error: any) {
      console.error('[PROFILE EDIT] Error saving profile:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to update profile. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout
      headerActions={
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerButton}
          >
            <MaterialIcons name="close" size={28} color="#000" />
          </TouchableOpacity>
        </View>
      }
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
        

          {/* Profile Picture Section */}
          <View style={styles.profilePictureSection}>
            <View style={styles.profilePictureContainer}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleProfilePicturePress}
                disabled={saving}
              >
                {previewImageUri ? (
                  <Image source={{ uri: previewImageUri }} style={styles.profilePicture} />
                ) : (
                  <View style={styles.profilePicturePlaceholder}>
                    <MaterialIcons name="person" size={60} color="#9CA3AF" />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editPhotoButton}
                activeOpacity={0.8}
                onPress={handleImagePicker}
                disabled={saving}
              >
                <MaterialIcons name="edit" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.formSection}>
            {/* Name Field - Read Only */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Name</Text>
              <View style={[styles.inputWrapper, styles.inputWrapperDisabled]}>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={name}
                  placeholder="Your name"
                  placeholderTextColor="#9CA3AF"
                  editable={false}
                />
              </View>
              <Text style={styles.fieldNote}>Name cannot be changed</Text>
            </View>

            {/* Username Field - Read Only */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Username</Text>
              <View style={[styles.inputWrapper, styles.inputWrapperDisabled]}>
                <Text style={styles.usernamePrefix}>@</Text>
                <TextInput
                  style={[styles.input, styles.usernameInput, styles.inputDisabled]}
                  value={username.replace('@', '')}
                  placeholder="username"
                  placeholderTextColor="#9CA3AF"
                  editable={false}
                />
                <MaterialIcons name="lock" size={18} color="#9CA3AF" />
              </View>
              <Text style={styles.fieldNote}>Username cannot be changed</Text>
            </View>

            {/* Bio Field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, styles.bioInput]}
                  value={bio}
                  onChangeText={(text) => {
                    if (text.length <= 100) {
                      setBio(text);
                    }
                  }}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  maxLength={100}
                  editable={!saving}
                />
              </View>
              <Text style={styles.characterCount}>{bio.length}/100</Text>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!hasChanges || saving) && styles.saveButtonDisabled,
            ]}
            activeOpacity={0.8}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          {/* Bottom spacing */}
          <View style={styles.bottomSpacing} />
        </View>
      </ScrollView>

      {/* Profile Picture Zoom Modal */}
      <Modal
        visible={isZoomed}
        transparent={true}
        animationType="none"
        onRequestClose={closeZoomModal}
      >
        <TouchableOpacity
          style={styles.zoomModalOverlay}
          activeOpacity={1}
          onPress={closeZoomModal}
        >
          <Animated.View
            style={[
              styles.zoomModalContent,
              {
                opacity: zoomOpacity,
                transform: [
                  {
                    scale: zoomScale.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              {previewImageUri ? (
                <Image
                  source={{ uri: previewImageUri }}
                  style={styles.zoomedImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.zoomedPlaceholder}>
                  <MaterialIcons name="person" size={120} color="#9CA3AF" />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomCloseButton}
              onPress={closeZoomModal}
            >
              <MaterialIcons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 32,
    letterSpacing: -0.5,
  },
  profilePictureSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  profilePictureContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profilePicture: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  profilePicturePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  editPhotoButton: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  changePhotoButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changePhotoText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  formSection: {
    marginBottom: 24,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  inputWrapperDisabled: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  inputDisabled: {
    color: '#6B7280',
  },
  fieldNote: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    marginLeft: 4,
    fontStyle: 'italic',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 14,
  },
  usernamePrefix: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginRight: 4,
  },
  usernameInput: {
    paddingLeft: 0,
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 14,
    paddingBottom: 14,
  },
  characterCount: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    marginLeft: 4,
    textAlign: 'right',
  },
  saveButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.3,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  bottomSpacing: {
    height: 40,
  },
  zoomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomModalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomedImage: {
    width: Dimensions.get('window').width * 0.9,
    height: Dimensions.get('window').width * 0.9,
    borderRadius: 8,
  },
  zoomedPlaceholder: {
    width: Dimensions.get('window').width * 0.9,
    height: Dimensions.get('window').width * 0.9,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});

