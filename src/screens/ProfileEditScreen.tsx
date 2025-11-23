import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileEditScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  // Local state for editing (no functionality yet)
  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');

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
          <Text style={styles.title}>Edit Profile</Text>

          {/* Profile Picture Section */}
          <View style={styles.profilePictureSection}>
            <View style={styles.profilePictureContainer}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.profilePicture} />
              ) : (
                <View style={styles.profilePicturePlaceholder}>
                  <Text style={styles.profilePicturePlaceholderText}>
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.editPhotoButton} activeOpacity={0.8}>
                <MaterialIcons name="camera-alt" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity activeOpacity={0.7} style={styles.changePhotoButton}>
              <Text style={styles.changePhotoText}>Change Profile Photo</Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields */}
          <View style={styles.formSection}>
            {/* Name Field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Name</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
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
                  onChangeText={setBio}
                  placeholder="Tell us about yourself..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
              <Text style={styles.characterCount}>{bio.length}/150</Text>
            </View>
          </View>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <MaterialIcons name="info-outline" size={20} color="#6366F1" />
            <Text style={styles.infoText}>
              Your profile information is visible to all Athletic Finance users.
            </Text>
          </View>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>

          {/* Bottom spacing */}
          <View style={styles.bottomSpacing} />
        </View>
      </ScrollView>
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
    backgroundColor: '#6366F1',
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
  profilePicturePlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  editPhotoButton: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#6366F1',
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
    color: '#6366F1',
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
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
  bottomSpacing: {
    height: 40,
  },
});

