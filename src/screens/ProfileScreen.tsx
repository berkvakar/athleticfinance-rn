import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  FlatList,
  ActivityIndicator,
  TextInput,
  Alert,
  Animated,
  Dimensions,
  Modal,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import type { SavedItem } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Comment {
  id: string;
  text: string;
  articleId: string;
  articleTitle?: string;
  timestamp: string;
  replyTo?: string;
}

type TabType = 'comments' | 'saved' | 'statistics';

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, savedItems, loading: authLoading, profileLoading, refreshProfile } = useAuth();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [bio, setBio] = useState(user?.bio || '');
  const [memberNumber, setMemberNumber] = useState<string>('');
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('comments');
  const [refreshing, setRefreshing] = useState(false);
  const [tabPositions, setTabPositions] = useState<{ [key: string]: number }>({
    comments: 0,
    saved: 0,
    statistics: 0,
  });
  
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const tabWidth = screenWidth / 3;
  const hasLoadedProfile = useRef(false);
  
  // Profile picture zoom modal
  const [isZoomed, setIsZoomed] = useState(false);
  const zoomScale = useRef(new Animated.Value(0)).current;
  const zoomOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Wait for auth and profile to finish loading before trying to load profile
    // Only load once when component mounts
    if (!authLoading && !profileLoading && user && !hasLoadedProfile.current) {
      hasLoadedProfile.current = true;
      loadProfileData();
    } else if (!authLoading && !profileLoading && !user) {
      // User not authenticated, stop loading
      setLoading(false);
    }
  }, [authLoading, profileLoading, user?.id]); // Wait for profile to load too

  // Sync bio with user context when it changes
  useEffect(() => {
    if (user?.bio !== undefined) {
      setBio(user.bio || '');
    }
  }, [user?.bio]);

  // Sync member number with user context when it changes
  useEffect(() => {
    if (user?.memberNumber !== undefined) {
      console.log('[PROFILE SCREEN] Member number changed:', user.memberNumber);
      setMemberNumber(user.memberNumber || '');
    }
  }, [user?.memberNumber]);

  // Sync profile image with user avatar from context
  // Handle S3 keys by converting them to URLs
  useEffect(() => {
    console.log('[PROFILE SCREEN] user.avatar changed:', user?.avatar);
    if (user?.avatar) {
      // Check if it's an S3 key (doesn't start with http) or already a URL
      if (!user.avatar.startsWith('http')) {
        // It's an S3 key - convert to URL
        console.log('[PROFILE SCREEN] Avatar is S3 key, fetching URL:', user.avatar);
        const { apiClient } = require('../lib/api');
        apiClient.getProfilePictureUrl(user.avatar)
          .then((result: { success: boolean; url?: string; error?: string }) => {
            if (result.success && result.url) {
              console.log('[PROFILE SCREEN] Got URL from S3 key:', result.url);
              setProfileImage(result.url);
            } else {
              console.warn('[PROFILE SCREEN] Failed to get URL for S3 key:', user.avatar);
              setProfileImage(null);
            }
          })
          .catch((error: any) => {
            console.error('[PROFILE SCREEN] Error fetching URL for S3 key:', error);
            setProfileImage(null);
          });
      } else {
        // It's already a URL
        console.log('[PROFILE SCREEN] Setting profileImage to URL:', user.avatar);
        setProfileImage(user.avatar);
      }
    } else {
      // Clear profile image if user.avatar is null/undefined
      console.log('[PROFILE SCREEN] Clearing profileImage');
      setProfileImage(null);
    }
  }, [user?.avatar]);

  // Handle pull-to-refresh
  const onRefresh = async () => {
    if (!user) return;
    
    try {
      setRefreshing(true);
      console.log('[PROFILE SCREEN] Refreshing profile data from DynamoDB...');
      
      // Call refreshProfile to fetch latest data from backend/DynamoDB
      await refreshProfile();
      
      console.log('[PROFILE SCREEN] Profile refresh completed');
    } catch (error: any) {
      console.error('[PROFILE SCREEN] Error refreshing profile:', error);
      Alert.alert('Error', 'Failed to refresh profile. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const loadProfileData = async () => {
    // Double check user exists and is authenticated
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // Use data directly from user context (fetched in background by AuthContext)
      // No API calls here - just use what's already in context
      console.log('[PROFILE] Loading profile data from user context (no API call)');
      
      // Update state with data from user context
      if (user.bio !== undefined) {
        setBio(user.bio || '');
      }
      
      if (user.avatar) {
        setProfileImage(user.avatar);
      }
      
      if (user.username) {
        setProfileUsername(user.username);
      }
      
      if (user.memberNumber !== undefined) {
        setMemberNumber(user.memberNumber || '');
        console.log('[PROFILE] Member number set from context:', user.memberNumber);
      }
      
      console.log('[PROFILE] Profile state updated from context:', {
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
        memberNumber: user.memberNumber,
      });
      
      // Load user comments (if needed in future)
      setComments([]); // Empty for now
    } catch (error) {
      console.error('[PROFILE] Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImagePicker = () => {
    // Always show zoom modal when clicking profile picture
    // Only "Edit Profile" button should navigate to edit screen
    openZoomModal();
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

  const handleSaveBio = async () => {
    setIsEditingBio(false);
    // TODO: Save bio to backend
    // await apiClient.updateUserProfile(user.id, { bio });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleSettingsPress = () => {
    navigation.navigate('Settings');
  };

  const handleTabLayout = (tab: TabType, event: any) => {
    const { x } = event.nativeEvent.layout;
    setTabPositions((prev) => {
      const newPositions = {
        ...prev,
        [tab]: x,
      };
      
      // If this is the comments tab and it's the active tab, animate to it
      if (tab === 'comments' && activeTab === 'comments' && x !== 0) {
        Animated.spring(indicatorPosition, {
          toValue: x,
          useNativeDriver: true,
          tension: 40,
          friction: 10,
        }).start();
      }
      
      return newPositions;
    });
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    
    const targetPosition = tabPositions[tab] || 0;
    
    Animated.spring(indicatorPosition, {
      toValue: targetPosition,
      useNativeDriver: true,
      tension: 40,
      friction: 10,
    }).start();
  };

  useEffect(() => {
    // Initialize indicator position for 'comments' tab once layout is measured
    if (tabPositions.comments !== 0 && activeTab === 'comments') {
      indicatorPosition.setValue(tabPositions.comments);
    }
  }, [tabPositions.comments, activeTab]);

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentCard}>
      {item.articleTitle && (
        <Text style={styles.commentArticleTitle}>Replied to: {item.articleTitle}</Text>
      )}
      <Text style={styles.commentText}>{item.text}</Text>
      <Text style={styles.commentDate}>{formatDate(item.timestamp)}</Text>
    </View>
  );

  const renderSavedItem = ({ item }: { item: SavedItem }) => (
    <View style={styles.savedItemCard}>
      <View style={styles.savedItemHeader}>
        <MaterialIcons 
          name={item.type === 'article' ? 'article' : 'comment'} 
          size={16} 
          color="#999" 
        />
        <Text style={styles.savedItemType}>
          {item.type === 'article' ? 'Article' : 'Comment'}
        </Text>
      </View>
      {item.title && (
        <Text style={styles.savedItemTitle}>{item.title}</Text>
      )}
      <Text style={styles.savedItemContent} numberOfLines={2}>
        {item.content}
      </Text>
      <Text style={styles.savedItemDate}>{formatDate(item.timestamp)}</Text>
    </View>
  );

  // Show loading if auth is still loading, profile is loading, or local profile is loading
  if (authLoading || profileLoading || loading) {
    return (
      <Layout>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </Layout>
    );
  }

  // If no user, don't render profile screen (should be handled by navigation)
  if (!user) {
    return null;
  }

  return (
    <Layout
      headerActions={
        <TouchableOpacity
          onPress={handleSettingsPress}
          style={styles.settingsButton}
        >
          <MaterialIcons name="settings" size={24} color="#000" />
        </TouchableOpacity>
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        bounces={true}
        overScrollMode="auto"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#000"
            colors={['#000']}
            progressViewOffset={0}
          />
        }
      >
        {/* Profile Header - Instagram Style */}
        <View style={styles.profileHeader}>
          {/* Profile Picture */}
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handleImagePicker}
            activeOpacity={0.8}
          >
            {(profileImage || user?.avatar) ? (
              <Image 
                source={{ uri: profileImage || user?.avatar || '' }} 
                style={styles.avatar}
                resizeMode="cover"
                fadeDuration={200}
                onLoad={() => console.log('[PROFILE SCREEN] Image loaded successfully')}
                onError={(error) => console.error('[PROFILE SCREEN] Image load error:', error)}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <MaterialIcons name="person" size={45} color="#9CA3AF" />
              </View>
            )}
          </TouchableOpacity>

          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.username}>
                {profileUsername || user?.username || user?.email}
              </Text>
              {user?.isPremium && (
                <View style={styles.premiumBadge}>
                  <MaterialIcons name="workspace-premium" size={14} color="#FFD700" />
                  <Text style={styles.premiumText}>AF+</Text>
                </View>
              )}
            </View>
            <Text style={styles.memberNumber}>
              {memberNumber ? `Member #${memberNumber}` : 'Member #--'}
            </Text>
            
            {/* Bio Section */}
            {bio ? (
              <View style={styles.bioSectionInline}>
                <Text style={styles.bioText}>{bio}</Text>
              </View>
            ) : null}

            {/* Edit Profile Button */}
            <TouchableOpacity 
              style={styles.editProfileButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('ProfileEdit')}
            >
              <MaterialIcons name="edit" size={16} color="#6366F1" />
              <Text style={styles.editProfileButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          {/* Tab Bar */}
          <View style={styles.tabBar}>
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  width: tabWidth,
                  transform: [{ translateX: indicatorPosition }],
                },
              ]}
            />
            <TouchableOpacity
              style={[styles.tab, { width: tabWidth }]}
              onPress={() => handleTabChange('comments')}
              onLayout={(event) => handleTabLayout('comments', event)}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name="comment" 
                size={24} 
                color={activeTab === 'comments' ? '#000' : '#999'} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, { width: tabWidth }]}
              onPress={() => handleTabChange('saved')}
              onLayout={(event) => handleTabLayout('saved', event)}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name="bookmark" 
                size={24} 
                color={activeTab === 'saved' ? '#000' : '#999'} 
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, { width: tabWidth }]}
              onPress={() => handleTabChange('statistics')}
              onLayout={(event) => handleTabLayout('statistics', event)}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name="bar-chart" 
                size={24} 
                color={activeTab === 'statistics' ? '#000' : '#999'} 
              />
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          <View style={styles.tabContent}>
            {activeTab === 'comments' && (
              <>
                {comments.length > 0 ? (
                  <FlatList
                    data={comments}
                    renderItem={renderComment}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    contentContainerStyle={styles.commentsList}
                  />
                ) : (
                  <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyState}>
                      <MaterialIcons name="comment" size={48} color="#999" />
                      <Text style={styles.emptyStateText}>No comments yet</Text>
                      <Text style={styles.emptyStateSubtext}>
                        Your comments will appear here
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}

            {activeTab === 'saved' && (
              <>
                {savedItems.length > 0 ? (
                  <FlatList
                    data={savedItems}
                    renderItem={renderSavedItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    contentContainerStyle={styles.savedItemsList}
                  />
                ) : (
                  <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyState}>
                      <MaterialIcons name="bookmark" size={48} color="#999" />
                      <Text style={styles.emptyStateText}>No saved items yet</Text>
                      <Text style={styles.emptyStateSubtext}>
                        Items you save will appear here
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}

            {activeTab === 'statistics' && (
              <View style={styles.emptyStateContainer}>
                <View style={styles.emptyState}>
                  <MaterialIcons name="bar-chart" size={48} color="#999" />
                  <Text style={styles.emptyStateText}>Statistics</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Your statistics will appear here
                  </Text>
                </View>
              </View>
            )}
          </View>
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
              {(profileImage || user?.avatar) ? (
                <Image
                  source={{ uri: profileImage || user?.avatar || '' }}
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
    backgroundColor: '#fff',
  },
  contentContainer: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 16,
    position: 'relative',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E5E5E5',
    overflow: 'hidden',
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E5E5E5',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  premiumText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
  },
  username: {
    fontSize: 20,
    color: '#000',
    fontWeight: '600',
  },
  memberNumber: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  bioSectionInline: {
    marginTop: 12,
    width: '100%',
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 24,
  },
  editProfileButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
    letterSpacing: 0.2,
  },
  bioSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  bioContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bioText: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    lineHeight: 20,
  },
  bioPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  bioEditIcon: {
    marginTop: 2,
  },
  settingsButton: {
    padding: 4,
  },
  bioEditContainer: {
    gap: 8,
  },
  bioInput: {
    fontSize: 14,
    color: '#000',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  bioActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  bioButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bioButtonPrimary: {
    backgroundColor: '#000',
    borderRadius: 6,
  },
  bioButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  bioButtonTextPrimary: {
    color: '#fff',
  },
  tabContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: '#fff',
  },
  tab: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    zIndex: 0,
  },
  tabContent: {
    flex: 1,
  },
  commentsList: {
    paddingTop: 16,
  },
  commentCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  commentArticleTitle: {
    fontSize: 11,
    color: '#999',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  commentText: {
    fontSize: 14,
    color: '#000',
    lineHeight: 20,
    marginBottom: 6,
  },
  commentDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  savedItemsList: {
    paddingTop: 16,
  },
  savedItemCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  savedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  savedItemType: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  savedItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  savedItemContent: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  savedItemDate: {
    fontSize: 12,
    color: '#999',
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
