import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { apiClient } from '../lib/api';
import { useArticleList } from '../hooks/useArticleList';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Comment {
  comment_id: string;
  article_id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  articleTitle?: string; // Will be fetched separately if needed
  author: {
    username: string;
    name?: string;
    avatar: string | null;
  };
}

interface Article {
  id: number;
  title: string;
  hero_image_id: number | null;
  content: {
    root: {
      children: any[];
    };
  };
  published_at: string;
  slug: string;
  imageUrl?: string;
}

interface ProfileStatsSummary {
  // Total UNIQUE articles read (size of the server-side articlesReadSet)
  articlesRead: number;
  // Optional explicit count field if backend returns both articlesRead and articlesReadCount
  articlesReadCount?: number;
  commentsPosted: number;
  streak: number;
  // Timestamp of the last NEW unique article that counted toward the streak
  streakLastReadAt?: string | null;
  // Convenience timestamps for UI
  lastActivityDate?: string | null;
  lastViewedAt?: string | null;
  updatedAt?: string | null;
  longestStreak?: number | null;
}

const PROFILE_STATS_DEFAULT: ProfileStatsSummary = {
  articlesRead: 0,
  commentsPosted: 0,
  streak: 0,
  lastActivityDate: null,
  updatedAt: null,
};

type TabType = 'comments' | 'saved' | 'statistics';

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, savedItems, loading: authLoading, profileLoading, refreshProfile, savedArticleIds, refreshSavedArticles } = useAuth();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [bio, setBio] = useState(user?.bio || '');
  const [memberNumber, setMemberNumber] = useState<string>('');
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [statistics, setStatistics] = useState<ProfileStatsSummary | null>(null);
  const [loadingStatistics, setLoadingStatistics] = useState(false);
  
  const { renderArticle } = useArticleList(savedArticleIds);
  const [loadingSavedArticles, setLoadingSavedArticles] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('comments');
  const [refreshingComments, setRefreshingComments] = useState(false);
  const [refreshingSaved, setRefreshingSaved] = useState(false);
  const [refreshingStatistics, setRefreshingStatistics] = useState(false);
  const previousAvatarRef = useRef<string | null | undefined>(null);
  const lastKnownAvatarRef = useRef<string | null>(null); // Store last known good avatar URL
  const [tabPositions, setTabPositions] = useState<{ [key: string]: number }>({
    comments: 0,
    saved: 0,
    statistics: 0,
  });
  
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const tabWidth = screenWidth / 3;
  const hasLoadedProfile = useRef(false);
  const hasLoadedComments = useRef(false);
  const hasLoadedSavedArticles = useRef(false);
  const hasLoadedStatistics = useRef(false);
  
  // Profile picture zoom modal
  const [isZoomed, setIsZoomed] = useState(false);
  const zoomScale = useRef(new Animated.Value(0)).current;
  const zoomOpacity = useRef(new Animated.Value(0)).current;
  
  // Animated values for statistics
  const articlesReadAnim = useRef(new Animated.Value(0)).current;
  const streakAnim = useRef(new Animated.Value(0)).current;
  const commentsPostedAnim = useRef(new Animated.Value(0)).current;

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

  // Initialize previousAvatarRef with current avatar value
  useEffect(() => {
    if (user?.avatar && previousAvatarRef.current === null) {
      previousAvatarRef.current = user.avatar;
    }
  }, [user?.avatar]);

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
  // Avatar is already a full URL or null (no S3 key conversion needed)
  // Preserve current image during refresh to prevent flickering
  useEffect(() => {
    const currentAvatar = user?.avatar;
    
    // Only update profileImage when we have a valid avatar URL
    // This prevents clearing the image during refresh when avatar might be temporarily undefined
    if (currentAvatar && typeof currentAvatar === 'string' && currentAvatar.trim().length > 0 && currentAvatar.startsWith('http')) {
      // Update if the avatar changed to a new valid URL, or initialize if this is the first time
      if (currentAvatar !== previousAvatarRef.current || lastKnownAvatarRef.current === null) {
        previousAvatarRef.current = currentAvatar;
        lastKnownAvatarRef.current = currentAvatar; // Store as last known good avatar
        setProfileImage(currentAvatar);
      }
    } else if (currentAvatar === null && previousAvatarRef.current !== null && previousAvatarRef.current !== undefined) {
      // Only clear if avatar was explicitly set to null (user removed it)
      // Check that we had a previous avatar to avoid clearing on initial load
      previousAvatarRef.current = null;
      lastKnownAvatarRef.current = null; // Clear last known avatar only when explicitly removed
      setProfileImage(null);
    }
    // If currentAvatar is undefined, preserve current profileImage (don't clear during refresh)
    // This prevents the image from disappearing during refresh operations
  }, [user?.avatar]);


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
        lastKnownAvatarRef.current = user.avatar; // Initialize last known avatar
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
      
      // Comments will be loaded when comments tab is active
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

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      return 'Unknown date';
    }
  };

  // Get author display name
  const getAuthorName = (comment: Comment) => {
    if (!comment.author) {
      return 'Anonymous';
    }
    return comment.author.name || comment.author.username || 'Anonymous';
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

    // Load comments when switching to comments tab (only if not already loaded)
    if (tab === 'comments' && !hasLoadedComments.current && !loadingComments) {
      loadComments();
    }
    
    // Load saved articles when switching to saved tab (only if not already loaded)
    if (tab === 'saved' && !hasLoadedSavedArticles.current && !loadingSavedArticles) {
      loadSavedArticles();
    }
    
    // Load statistics when switching to statistics tab (only if not already loaded)
    if (tab === 'statistics' && !hasLoadedStatistics.current && !loadingStatistics) {
      loadStatistics();
    }
  };

  const loadComments = useCallback(async () => {
    if (!user || loadingComments) return;
    
    try {
      setLoadingComments(true);
      const result = await apiClient.getMyComments();
      if (result.success && result.comments) {
        // Transform API response to match Comment interface
        // API returns: comment_id, article_id, content, createdAt, author, etc.
        // We need to normalize and potentially fetch article titles
        const transformedComments: Comment[] = result.comments.map((comment: any) => ({
          comment_id: comment.comment_id,
          article_id: comment.article_id,
          content: comment.content,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          isDeleted: comment.isDeleted || false,
          articleTitle: comment.articleTitle, // May be undefined
          author: {
            username: comment.author?.username || 'Anonymous',
            name: comment.author?.name,
            avatar: comment.author?.avatar ?? null,
          },
        }));
        setComments(transformedComments);
        hasLoadedComments.current = true;
      } else {
        setComments([]);
        hasLoadedComments.current = true;
      }
    } catch (error) {
      console.error('Error loading comments:', error);
      setComments([]);
      hasLoadedComments.current = true;
    } finally {
      setLoadingComments(false);
    }
  }, [user, loadingComments]);

  const loadSavedArticles = useCallback(async () => {
    if (!user || loadingSavedArticles) return;
    
    try {
      setLoadingSavedArticles(true);
      const result = await apiClient.getSavedArticles();
      if (result.success && result.articles) {
        setSavedArticles(result.articles);
        hasLoadedSavedArticles.current = true;
      } else {
        setSavedArticles([]);
        hasLoadedSavedArticles.current = true;
      }
    } catch (error) {
      console.error('Error loading saved articles:', error);
      setSavedArticles([]);
      hasLoadedSavedArticles.current = true;
    } finally {
      setLoadingSavedArticles(false);
    }
  }, [user, loadingSavedArticles]);

  useEffect(() => {
    // Initialize indicator position for 'comments' tab once layout is measured
    if (tabPositions.comments !== 0 && activeTab === 'comments') {
      indicatorPosition.setValue(tabPositions.comments);
    }
  }, [tabPositions.comments, activeTab]);

  // Load comments when comments tab becomes active (only once)
  useEffect(() => {
    if (activeTab === 'comments' && user && !hasLoadedComments.current && !loadingComments) {
      loadComments();
    }
  }, [activeTab, user, loadComments]);

  // Load saved articles when saved tab becomes active (only once)
  useEffect(() => {
    if (activeTab === 'saved' && user && !hasLoadedSavedArticles.current && !loadingSavedArticles) {
      loadSavedArticles();
    }
  }, [activeTab, user, loadSavedArticles]);
  
  // Load statistics when statistics tab becomes active (only once)
  useEffect(() => {
    if (activeTab === 'statistics' && user && !hasLoadedStatistics.current && !loadingStatistics) {
      loadStatistics();
    }
  }, [activeTab, user]);
  
  const loadStatistics = useCallback(async () => {
    if (!user || loadingStatistics) return;
    
    try {
      setLoadingStatistics(true);
      
      const summaryResponse = await apiClient.getProfileStatsSummary();

      if (summaryResponse.success && summaryResponse.stats) {
        const stats = summaryResponse.stats;
        const normalizedStats: ProfileStatsSummary = {
          articlesRead: stats.articlesRead ?? 0,
          articlesReadCount: stats.articlesReadCount ?? stats.articlesRead ?? 0,
          commentsPosted: stats.commentsPosted ?? 0,
          streak: stats.streak ?? 0,
          streakLastReadAt: stats.streakLastReadAt ?? null,
          lastActivityDate: stats.lastActivityDate ?? stats.lastViewedAt ?? null,
          lastViewedAt: stats.lastViewedAt ?? null,
          updatedAt: stats.updatedAt ?? null,
          longestStreak: stats.longestStreak ?? null,
        };
        
        setStatistics(normalizedStats);

        articlesReadAnim.setValue(0);
        streakAnim.setValue(0);
        commentsPostedAnim.setValue(0);
        
        Animated.parallel([
          Animated.timing(articlesReadAnim, {
            toValue: normalizedStats.articlesRead,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(streakAnim, {
            toValue: normalizedStats.streak,
            duration: 1500,
            delay: 100,
            useNativeDriver: false,
          }),
          Animated.timing(commentsPostedAnim, {
            toValue: normalizedStats.commentsPosted,
            duration: 1500,
            delay: 200,
            useNativeDriver: false,
          }),
        ]).start();
      } else {
        setStatistics(PROFILE_STATS_DEFAULT);
        articlesReadAnim.setValue(0);
        streakAnim.setValue(0);
        commentsPostedAnim.setValue(0);
      }

      hasLoadedStatistics.current = true;
    } catch (error) {
      console.error('Error loading statistics:', error);
      setStatistics(PROFILE_STATS_DEFAULT);
      articlesReadAnim.setValue(0);
      streakAnim.setValue(0);
      commentsPostedAnim.setValue(0);
      hasLoadedStatistics.current = true;
    } finally {
      setLoadingStatistics(false);
    }
  }, [user, loadingStatistics, articlesReadAnim, streakAnim, commentsPostedAnim]);

  // Handle pull-to-refresh for comments tab
  const onRefreshComments = useCallback(async () => {
    if (!user) return;
    
    try {
      setRefreshingComments(true);
      await refreshProfile();
      hasLoadedComments.current = false;
      await loadComments();
    } catch (error: any) {
      console.error('[PROFILE SCREEN] Error refreshing comments:', error);
    } finally {
      setRefreshingComments(false);
    }
  }, [user, refreshProfile, loadComments]);

  // Handle pull-to-refresh for saved tab
  const onRefreshSaved = useCallback(async () => {
    if (!user) return;
    
    try {
      setRefreshingSaved(true);
      await refreshProfile();
      hasLoadedSavedArticles.current = false;
      await refreshSavedArticles();
      await loadSavedArticles();
    } catch (error: any) {
      console.error('[PROFILE SCREEN] Error refreshing saved articles:', error);
    } finally {
      setRefreshingSaved(false);
    }
  }, [user, refreshProfile, refreshSavedArticles, loadSavedArticles]);

  // Handle pull-to-refresh for statistics tab
  const onRefreshStatistics = useCallback(async () => {
    if (!user) return;
    
    try {
      setRefreshingStatistics(true);
      await refreshProfile();
      hasLoadedStatistics.current = false;
      await loadStatistics();
    } catch (error: any) {
      console.error('[PROFILE SCREEN] Error refreshing statistics:', error);
    } finally {
      setRefreshingStatistics(false);
    }
  }, [user, refreshProfile, loadStatistics]);

  const renderComment = ({ item }: { item: Comment }) => {
    const avatarUri = item.author?.avatar;
    
    return (
      <View style={styles.commentCard}>
        <View style={styles.commentHeader}>
          <View style={styles.commentAvatar}>
            {avatarUri && typeof avatarUri === 'string' && avatarUri.trim().length > 0 && avatarUri.startsWith('http') ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.commentAvatarImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.commentAvatarPlaceholder}>
                <MaterialIcons name="person" size={24} color="#9CA3AF" />
              </View>
            )}
          </View>
          <View style={styles.commentMeta}>
            <Text style={styles.commentAuthor}>
              {getAuthorName(item)}
            </Text>
            <Text style={styles.commentDate}>
              {formatDate(item.createdAt)}
            </Text>
          </View>
        </View>
        {item.articleTitle && (
          <Text style={styles.commentArticleTitle}>Replied to: {item.articleTitle}</Text>
        )}
        <Text style={styles.commentContent}>{item.content}</Text>
      </View>
    );
  };

  // Animated number component
  const AnimatedNumber = ({ value, style }: { value: Animated.Value; style?: any }) => {
    const [displayValue, setDisplayValue] = useState(0);
    
    useEffect(() => {
      const id = value.addListener(({ value: v }) => {
        setDisplayValue(Math.floor(v));
      });
      return () => {
        value.removeListener(id);
      };
    }, [value]);
    
    return <Text style={style}>{displayValue.toLocaleString()}</Text>;
  };

  // Decide what to show in the UI:
  // - Before first successful load: show a loading state instead of fake zeros
  // - After we have real stats: keep showing the last known values while loading/refetching
  const statsForUi = statistics ?? PROFILE_STATS_DEFAULT;
  const hasStatisticsLoadedOnce = hasLoadedStatistics.current;
  const isInitialStatsLoading = !hasStatisticsLoadedOnce && (loadingStatistics || !statistics);

  // No derived progress metrics – we show raw all-time counts only.

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
      <View style={styles.container}>
        {/* Profile Header - Instagram Style */}
        <View style={styles.profileHeader}>
          {/* Profile Picture */}
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handleImagePicker}
            activeOpacity={0.8}
          >
            {(() => {
              // Use last known good avatar as fallback to prevent flickering during refresh
              const avatarUri = profileImage || user?.avatar || lastKnownAvatarRef.current;
              // Only render Image if we have a valid non-empty URL
              if (avatarUri && typeof avatarUri === 'string' && avatarUri.trim().length > 0 && avatarUri.startsWith('http')) {
                return (
                  <Image 
                    source={{ uri: avatarUri }} 
                    style={styles.avatar}
                    resizeMode="cover"
                    fadeDuration={200}
                    onLoad={() => console.log('[PROFILE SCREEN] Image loaded successfully')}
                    onError={(error) => {
                      console.error('[PROFILE SCREEN] Image load error:', error);
                      // If image fails to load, only clear if it's not the last known avatar
                      if (avatarUri !== lastKnownAvatarRef.current) {
                        setProfileImage(null);
                      }
                    }}
                  />
                );
              }
              // Show placeholder if no valid avatar URL
              return (
                <View style={styles.avatarPlaceholder}>
                  <MaterialIcons name="person" size={45} color="#9CA3AF" />
                </View>
              );
            })()}
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
              key="tab-comments"
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
              key="tab-saved"
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
              key="tab-statistics"
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

          {/* Tab Content - Each tab has its own ScrollView with RefreshControl */}
          <View style={styles.tabContent}>
            {activeTab === 'comments' && (
              loadingComments ? (
                <View style={styles.emptyStateContainer}>
                  <ActivityIndicator size="large" color="#000" />
                </View>
              ) : comments.length > 0 ? (
                <FlatList
                  data={comments}
                  renderItem={renderComment}
                  keyExtractor={(item) => item.comment_id}
                  contentContainerStyle={styles.commentsList}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshingComments}
                      onRefresh={onRefreshComments}
                    />
                  }
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
              )
            )}

            {activeTab === 'saved' && (
              <ScrollView
                style={styles.tabScrollView}
                contentContainerStyle={styles.tabScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
                alwaysBounceVertical={true}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshingSaved}
                    onRefresh={onRefreshSaved}
                  />
                }
              >
                {loadingSavedArticles ? (
                  <View style={styles.emptyStateContainer}>
                    <ActivityIndicator size="large" color="#000" />
                  </View>
                ) : savedArticles.length > 0 ? (
                  <View style={styles.savedArticlesList}>
                    {savedArticles.map((item) => (
                      <React.Fragment key={item.id}>
                        {renderArticle({ item })}
                      </React.Fragment>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyState}>
                      <MaterialIcons name="bookmark" size={48} color="#999" />
                      <Text style={styles.emptyStateText}>No saved articles yet</Text>
                      <Text style={styles.emptyStateSubtext}>
                        Articles you bookmark will appear here
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}

            {activeTab === 'statistics' && (
              <ScrollView
                style={styles.tabScrollView}
                contentContainerStyle={styles.tabScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
                alwaysBounceVertical={true}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshingStatistics}
                    onRefresh={onRefreshStatistics}
                  />
                }
              >
                {isInitialStatsLoading ? (
                  <View style={styles.emptyStateContainer}>
                    <ActivityIndicator size="large" color="#000" />
                  </View>
                ) : (
                  <View style={styles.statisticsContainer}>

                    {/* Streak Card */}
                    <Animated.View key="streak" style={[styles.statCard, styles.statCardStreak]}>
                      <View style={styles.statIconContainer}>
                        <MaterialIcons name="local-fire-department" size={22} color="#F59E0B" />
                      </View>
                      <View style={styles.statTextContainer}>
                        <AnimatedNumber value={streakAnim} style={styles.statNumber} />
                        <Text style={styles.statLabel}>Day Streak</Text>
                      </View>
                    </Animated.View>

                    {/* Articles Read Card */}
                    <Animated.View key="articles-read" style={[styles.statCard, styles.statCardPrimary]}>
                      <View style={styles.statIconContainer}>
                        <MaterialIcons name="article" size={22} color="#6366F1" />
                      </View>
                      <View style={styles.statTextContainer}>
                        <AnimatedNumber value={articlesReadAnim} style={styles.statNumber} />
                        <Text style={styles.statLabel}>Articles Read</Text>
                      </View>
                    </Animated.View>

                    {/* Comments Posted Card */}
                    <Animated.View key="comments-posted" style={[styles.statCard, styles.statCardComments]}>
                      <View style={styles.statIconContainer}>
                        <MaterialIcons name="comment" size={22} color="#10B981" />
                      </View>
                      <View style={styles.statTextContainer}>
                        <AnimatedNumber value={commentsPostedAnim} style={styles.statNumber} />
                        <Text style={styles.statLabel}>Comments Posted</Text>
                      </View>
                    </Animated.View>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </View>

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
              {(() => {
                // Use last known good avatar as fallback to prevent flickering during refresh
                const avatarUri = profileImage || user?.avatar || lastKnownAvatarRef.current;
                // Only render Image if we have a valid non-empty URL
                if (avatarUri && typeof avatarUri === 'string' && avatarUri.trim().length > 0 && avatarUri.startsWith('http')) {
                  return (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.zoomedImage}
                      resizeMode="contain"
                      onError={(error) => {
                        console.error('[PROFILE SCREEN] Zoomed image load error:', error);
                      }}
                    />
                  );
                }
                // Show placeholder if no valid avatar URL
                return (
                  <View style={styles.zoomedPlaceholder}>
                    <MaterialIcons name="person" size={120} color="#9CA3AF" />
                  </View>
                );
              })()}
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
  tabScrollView: {
    flex: 1,
  },
  tabScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
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
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  commentCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  commentAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  commentMeta: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  commentDate: {
    fontSize: 12,
    color: '#999',
  },
  commentArticleTitle: {
    fontSize: 11,
    color: '#999',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  commentContent: {
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 22,
  },
  emptyStateContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    minHeight: Dimensions.get('window').height - 300,
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
  savedArticlesList: {
    paddingTop: 8,
    paddingBottom: 20,
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
  statisticsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statCardPrimary: {
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
  },
  statCardStreak: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  statCardComments: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statSubLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 6,
  },
});
