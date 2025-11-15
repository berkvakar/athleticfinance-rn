import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ArticleCardProps {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  date: Date;
  readTime: string;
  isPremium: boolean;
  image?: string;
  commentCount?: number;
  topComment?: {
    author: string;
    isPremium: boolean;
    text: string;
  };
  onPress?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ArticleCard({
  id,
  title,
  excerpt,
  author,
  date,
  readTime,
  isPremium,
  image,
  commentCount = 0,
  topComment,
  onPress,
}: ArticleCardProps) {
  const handleShare = () => {
    // Share functionality will be implemented later
  };

  const handleBookmark = () => {
    // Bookmark functionality will be implemented later
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        {image && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: image }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>
        )}

        <View style={styles.excerptContainer}>
          <Text style={styles.excerpt} numberOfLines={8}>
            {excerpt}
          </Text>
          <View style={styles.gradientOverlay} />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="share" size={24} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleBookmark}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="bookmark-border" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {topComment && (
          <View style={styles.commentSection}>
            <Text style={styles.commentHeader}>
              Comments ({commentCount})
            </Text>
            <View style={styles.commentContainer}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {topComment.author
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </Text>
              </View>
              <View style={styles.commentContent}>
                <View style={styles.commentAuthorRow}>
                  <Text style={styles.commentAuthor}>
                    @{topComment.author.toLowerCase().replace(/\s+/g, '')}AF
                  </Text>
                  {topComment.isPremium && (
                    <>
                      <Text style={styles.premiumBadge}>AF+</Text>
                    </>
                  )}
                </View>
                <Text style={styles.commentText} numberOfLines={2}>
                  {topComment.text}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
    paddingHorizontal: 8,
  },
  content: {
    gap: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
    paddingHorizontal: 8,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  excerptContainer: {
    position: 'relative',
    paddingHorizontal: 8,
    maxHeight: 200,
  },
  excerpt: {
    fontSize: 12,
    color: '#000',
    lineHeight: 18,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 8,
    paddingTop: 16,
  },
  actionButton: {
    padding: 4,
  },
  commentSection: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 12,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  commentHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  commentContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  commentAvatarText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000',
  },
  commentContent: {
    flex: 1,
    minWidth: 0,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000',
  },
  premiumBadge: {
    fontSize: 9,
    color: '#666',
  },
  commentText: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
});

