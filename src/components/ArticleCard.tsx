import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ArticleCardProps {
  id: number;
  title: string;
  hero_image_id?: number | null;
  imageUrl?: string;
  onPress?: () => void;
}

export default function ArticleCard({
  id,
  title,
  hero_image_id,
  imageUrl,
  onPress,
}: ArticleCardProps) {
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

  const handleBookmark = (e: any) => {
    e?.stopPropagation?.();
    console.log('Bookmark article:', id);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        {/* Image with gradient overlay at bottom */}
        {(hero_image_id || imageUrl) ? (
          <View style={styles.imageContainer}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <MaterialIcons name="image" size={32} color="#999" />
              </View>
            )}
            {/* Gradient overlay at bottom of image */}
            <View style={styles.imageGradient}>
              <View style={styles.gradientLayer1} />
              <View style={styles.gradientLayer2} />
              <View style={styles.gradientLayer3} />
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
          >
            <MaterialIcons name="bookmark-border" size={24} color="#000" />
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
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#F5F5F5',
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    overflow: 'hidden',
  },
  gradientLayer1: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: '#fff',
    opacity: 0.95,
  },
  gradientLayer2: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: '#fff',
    opacity: 0.6,
  },
  gradientLayer3: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: '#fff',
    opacity: 0.2,
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
