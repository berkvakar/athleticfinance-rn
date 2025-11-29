import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Share,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

interface TodayArticleCardProps {
  id: number;
  title: string;
  hero_image_id?: number | null;
  imageUrl?: string;
  onPress?: () => void;
  isSaved?: boolean;
}

export default function TodayArticleCard({
  id,
  title,
  hero_image_id,
  imageUrl,
  onPress,
  isSaved: isSavedProp,
}: TodayArticleCardProps) {
  const { savedArticleIds, bookmarkArticle, unbookmarkArticle, user } = useAuth();
  const bookmarkScale = useRef(new Animated.Value(1)).current;
  const bookmarkOpacity = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const backgroundAnimation = useRef(new Animated.Value(0)).current;
  const userInteractedRef = useRef(false);
  const mountTimeRef = useRef(Date.now());
  
  // Check if article is saved (use prop if provided, otherwise check context)
  const isSaved = isSavedProp !== undefined 
    ? isSavedProp 
    : savedArticleIds.has(id);

  // Animate bookmark when state changes (only if user interacted or enough time has passed)
  useEffect(() => {
    const timeSinceMount = Date.now() - mountTimeRef.current;
    const hasBeenMountedLongEnough = timeSinceMount > 2000; // 2 seconds after mount

    // Only animate if user has interacted OR component has been mounted for a while
    // This prevents animation during initial data loading
    if (!userInteractedRef.current && !hasBeenMountedLongEnough) {
      return;
    }

    Animated.sequence([
      Animated.parallel([
        Animated.spring(bookmarkScale, {
          toValue: 1.3,
          useNativeDriver: true,
          tension: 300,
          friction: 7,
        }),
        Animated.timing(bookmarkOpacity, {
          toValue: 0.7,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(bookmarkScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 300,
          friction: 7,
        }),
        Animated.timing(bookmarkOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [isSaved]);

  // Animate background gradient
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(backgroundAnimation, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: false,
        }),
        Animated.timing(backgroundAnimation, {
          toValue: 0,
          duration: 8000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const handleShare = async (e: any) => {
    e?.stopPropagation?.();
    try {
      if (Platform.OS !== 'web' && Share.share) {
        await Share.share({
          message: title,
          title: title,
        });
      } else {
        console.log('Share functionality - link would be copied');
      }
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        console.error('Failed to share:', err);
      }
    }
  };

  const handleBookmark = async (e: any) => {
    e?.stopPropagation?.();
    if (!user) return;
    
    // Mark that user has interacted - this allows animations
    userInteractedRef.current = true;
    
    // Immediate visual feedback
    Animated.sequence([
      Animated.timing(bookmarkScale, {
        toValue: 0.85,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(bookmarkScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 7,
      }),
    ]).start();
    
    try {
      if (isSaved) {
        await unbookmarkArticle(id);
      } else {
        await bookmarkArticle(id);
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  };

  const handlePressIn = () => {
    Animated.spring(cardScale, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(cardScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  };

  const gradientInterpolation = backgroundAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ scale: cardScale }],
          },
        ]}
      >
        {/* Animated Background Gradients */}
        <View style={styles.backgroundContainer}>
          <Animated.View
            style={[
              styles.gradientBackground1,
              {
                transform: [
                  {
                    rotate: gradientInterpolation,
                  },
                ],
              },
            ]}
          />
          <View style={styles.gradientBackground2} />
          <View style={styles.gradientBackground3} />
        </View>

        {/* Hero Image */}
        {(hero_image_id || imageUrl) ? (
          <View style={styles.imageContainer}>
            <View style={styles.imageWrapper}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.image}
                  resizeMode="cover"
                  defaultSource={require('../../assets/af-logo.png')}
                  fadeDuration={200}
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <MaterialIcons name="image" size={48} color="#999" />
                </View>
              )}
              {/* Smooth gradient overlay on image */}
              <View style={styles.imageOverlay} />
            </View>
          </View>
        ) : (
          <View style={styles.noImageContainer}>
            <View style={styles.noImageGradient} />
          </View>
        )}

        {/* Content Container */}
        <View style={styles.contentContainer}>
          {/* Title */}
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={4}>
              {title}
            </Text>
          </View>
        </View>

        {/* Action Buttons - positioned at bottom left */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={handleShare}
            style={styles.actionButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="share" size={24} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBookmark}
            style={styles.actionButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
          >
            <Animated.View
              style={{
                transform: [{ scale: bookmarkScale }],
                opacity: bookmarkOpacity,
              }}
            >
              <MaterialIcons 
                name={isSaved ? "bookmark" : "bookmark-border"} 
                size={24} 
                color="#000" 
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  card: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.65,
    maxHeight: SCREEN_HEIGHT * 0.65,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  gradientBackground1: {
    position: 'absolute',
    width: SCREEN_WIDTH * 1.5,
    height: SCREEN_WIDTH * 1.5,
    top: -SCREEN_WIDTH * 0.3,
    right: -SCREEN_WIDTH * 0.3,
    borderRadius: SCREEN_WIDTH * 0.75,
    backgroundColor: 'rgba(138, 43, 226, 0.08)', // Purple tint
  },
  gradientBackground2: {
    position: 'absolute',
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    bottom: -SCREEN_WIDTH * 0.4,
    left: -SCREEN_WIDTH * 0.2,
    borderRadius: SCREEN_WIDTH * 0.6,
    backgroundColor: 'rgba(30, 144, 255, 0.06)', // Blue tint
  },
  gradientBackground3: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    top: SCREEN_HEIGHT * 0.3,
    left: SCREEN_WIDTH * 0.2,
    borderRadius: SCREEN_WIDTH * 0.4,
    backgroundColor: 'rgba(255, 20, 147, 0.05)', // Pink tint
  },
  imageContainer: {
    width: '100%',
    height: '60%',
    backgroundColor: 'transparent',
    overflow: 'visible',
    position: 'relative',
    padding: 16,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F5',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    overflow: 'hidden',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    overflow: 'hidden',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  overlayLayer1: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  overlayLayer2: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  overlayLayer3: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  noImageContainer: {
    width: '100%',
    height: '60%',
    backgroundColor: 'transparent',
    position: 'relative',
    padding: 16,
  },
  noImageGradient: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  contentContainer: {
    height: '40%',
    justifyContent: 'flex-start',
    padding: 20,
    paddingTop: 16,
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  actionButtons: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionButton: {
    padding: 4,
  },
});

