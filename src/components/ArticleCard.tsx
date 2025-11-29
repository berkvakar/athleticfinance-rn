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

interface ArticleCardProps {
  id: number;
  title: string;
  hero_image_id?: number | null;
  imageUrl?: string;
  onPress?: () => void;
  isSaved?: boolean;
}

export default function ArticleCard({
  id,
  title,
  hero_image_id,
  imageUrl,
  onPress,
  isSaved: isSavedProp,
}: ArticleCardProps) {
  const { savedArticleIds, bookmarkArticle, unbookmarkArticle, user } = useAuth();
  const backgroundAnimation = useRef(new Animated.Value(0)).current;
  
  // Check if article is saved (use prop if provided, otherwise check context)
  const isSaved = isSavedProp !== undefined 
    ? isSavedProp 
    : savedArticleIds.has(id);

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

  const gradientInterpolation = backgroundAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
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

        {/* Image with gradient overlay at bottom */}
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
                  <MaterialIcons name="image" size={32} color="#999" />
                </View>
              )}
            </View>
          </View>
        ) : null}

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>

        {/* Share and Bookmark buttons */}
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
            <MaterialIcons 
              name={isSaved ? "bookmark" : "bookmark-border"} 
              size={24} 
              color="#000" 
            />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    marginTop: 8,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
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
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    top: -SCREEN_WIDTH * 0.25,
    right: -SCREEN_WIDTH * 0.25,
    borderRadius: SCREEN_WIDTH * 0.6,
    backgroundColor: 'rgba(0, 150, 136, 0.08)', // Teal tint
  },
  gradientBackground2: {
    position: 'absolute',
    width: SCREEN_WIDTH * 1.0,
    height: SCREEN_WIDTH * 1.0,
    bottom: -SCREEN_WIDTH * 0.3,
    left: -SCREEN_WIDTH * 0.15,
    borderRadius: SCREEN_WIDTH * 0.5,
    backgroundColor: 'rgba(3, 169, 244, 0.06)', // Cyan tint
  },
  gradientBackground3: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    top: SCREEN_WIDTH * 0.15,
    left: SCREEN_WIDTH * 0.15,
    borderRadius: SCREEN_WIDTH * 0.35,
    backgroundColor: 'rgba(129, 212, 250, 0.05)', // Light blue tint
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
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
  },
  titleContainer: {
    padding: 20,
    paddingTop: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
  },
  actionButton: {
    padding: 4,
  },
});
