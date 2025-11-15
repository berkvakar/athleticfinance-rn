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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import type { SavedItem } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { apiClient } from '../lib/api';
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
  const { user, savedItems } = useAuth();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [bio, setBio] = useState(user?.bio || '');
  const [memberNumber, setMemberNumber] = useState<string>('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('comments');
  const [tabPositions, setTabPositions] = useState<{ [key: string]: number }>({
    comments: 0,
    saved: 0,
    statistics: 0,
  });
  
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const tabWidth = screenWidth / 3;

  useEffect(() => {
    loadProfileData();
  }, [user]);

  // Sync bio with user context when it changes
  useEffect(() => {
    if (user?.bio) {
      setBio(user.bio);
    }
  }, [user?.bio]);

  const loadProfileData = async () => {
    if (!user?.username) return;
    
    try {
      setLoading(true);
      
      // Fetch profile from DynamoDB
      try {
        console.log('[PROFILE] Loading profile data for username:', user.username);
        const profileData = await apiClient.getUserProfile(user.username);
        console.log('[PROFILE] ✅ Profile data loaded:', profileData);
        
        // Update state with DynamoDB data
        setBio(profileData.description || '');
        setMemberNumber(profileData.userNumber?.toString() || '');
        setProfileImage(profileData.profilePicture || null);
        
        console.log('[PROFILE] Profile state updated');
      } catch (error: any) {
        console.warn('[PROFILE] ⚠️ Could not load profile from DynamoDB:', error.message);
        // Use data from AuthContext if available
        setBio(user.bio || '');
        setProfileImage(user.avatar || null);
      }
      
      // Load user comments (TODO: implement when comments endpoint is ready)
      try {
        // const userComments = await apiClient.getUserComments(user.id);
        // setComments(userComments);
        setComments([]); // Empty for now
      } catch (error) {
        console.error('[PROFILE] Error loading comments:', error);
        setComments([]);
      }
    } catch (error) {
      console.error('[PROFILE] Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImagePicker = async () => {
    // TODO: Install expo-image-picker: npx expo install expo-image-picker
    // Then uncomment and implement image picker functionality
    Alert.alert(
      'Coming Soon',
      'Profile picture editing will be available soon. Install expo-image-picker to enable this feature.',
      [{ text: 'OK' }]
    );
    
    // Example implementation (requires expo-image-picker):
    // try {
    //   const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    //   if (status !== 'granted') {
    //     Alert.alert('Permission needed', 'Please grant camera roll permissions to change your profile picture.');
    //     return;
    //   }
    //   const result = await ImagePicker.launchImageLibraryAsync({
    //     mediaTypes: ImagePicker.MediaTypeOptions.Images,
    //     allowsEditing: true,
    //     aspect: [1, 1],
    //     quality: 0.8,
    //   });
    //   if (!result.canceled && result.assets[0]) {
    //     setProfileImage(result.assets[0].uri);
    //     // TODO: Upload image to backend/S3
    //   }
    // } catch (error) {
    //   console.error('Error picking image:', error);
    //   Alert.alert('Error', 'Failed to pick image');
    // }
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

  if (loading) {
    return (
      <Layout>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </Layout>
    );
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
      >
        {/* Profile Header - Instagram Style */}
        <View style={styles.profileHeader}>
          {/* Profile Picture */}
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handleImagePicker}
            activeOpacity={0.8}
          >
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('') || user?.email?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.username}>{user?.username || user?.email}</Text>
              {user?.isPremium && (
                <View style={styles.premiumBadge}>
                  <MaterialIcons name="workspace-premium" size={14} color="#FFD700" />
                  <Text style={styles.premiumText}>AF+</Text>
                </View>
              )}
            </View>
            {memberNumber && (
              <Text style={styles.memberNumber}>Member #{memberNumber}</Text>
            )}
            
            {/* Bio Section - Moved here */}
            <View style={styles.bioSectionInline}>
              {isEditingBio ? (
                <View style={styles.bioEditContainer}>
                  <TextInput
                    style={styles.bioInput}
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Add a bio..."
                    multiline
                    maxLength={150}
                    autoFocus
                  />
                  <View style={styles.bioActions}>
                    <TouchableOpacity
                      style={styles.bioButton}
                      onPress={() => setIsEditingBio(false)}
                    >
                      <Text style={styles.bioButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.bioButton, styles.bioButtonPrimary]}
                      onPress={handleSaveBio}
                    >
                      <Text style={[styles.bioButtonText, styles.bioButtonTextPrimary]}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.bioContainer}
                  onPress={() => setIsEditingBio(true)}
                  activeOpacity={0.7}
                >
                  {bio ? (
                    <Text style={styles.bioText}>{bio}</Text>
                  ) : (
                    <Text style={styles.bioPlaceholder}>Add a bio...</Text>
                  )}
                  <MaterialIcons name="edit" size={16} color="#999" style={styles.bioEditIcon} />
                </TouchableOpacity>
              )}
            </View>
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
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    paddingBottom: 40,
    flexGrow: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E5E5E5',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#000',
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
    marginBottom: 24,
    width: '100%',
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
});
