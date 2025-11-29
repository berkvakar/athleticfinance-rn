import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  Animated,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import Layout from '../components/Layout';
import ParagraphBlock from '../components/ParagraphBlock';
import CommentSection from '../components/CommentSection';
import { parseToParagraphBlocks, ParagraphBlock as ParagraphBlockType } from '../lib/paragraphParser';
import { useAuth } from '../contexts/AuthContext';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

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
}

interface ArticleDetailScreenProps {
  route: {
    params: {
      article: Article;
    };
  };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ArticleDetailScreen({ route }: ArticleDetailScreenProps) {
  const navigation = useNavigation<NavigationProp>();
  const { article } = route.params;
  const { user, savedArticleIds, bookmarkArticle, unbookmarkArticle } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const bookmarkScale = useRef(new Animated.Value(1)).current;
  const bookmarkOpacity = useRef(new Animated.Value(1)).current;

  // Check if current article is saved
  const isSaved = savedArticleIds.has(article.id);

  // Animate bookmark when state changes
  useEffect(() => {
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

  // Parse content into paragraph blocks
  const paragraphBlocks = parseToParagraphBlocks(article.content);
  const totalPages = paragraphBlocks.length + 2; // +1 for title page, +1 for comments

  const handleBack = () => {
    navigation.goBack();
  };

  const handleShare = () => {
    console.log('Share article:', article.id);
  };

  const handleBookmark = async () => {
    if (!user) return;
    
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
        await unbookmarkArticle(article.id);
      } else {
        await bookmarkArticle(article.id);
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const pageHeight = SCREEN_HEIGHT;
    const page = Math.round(offsetY / pageHeight);
    setCurrentPage(page);
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const pageHeight = SCREEN_HEIGHT;
    const rawPage = offsetY / pageHeight;

    // Require a bigger swipe before advancing the page so scrolling feels "heavier"
    let targetPage = currentPage;

    if (rawPage > currentPage + 0.8) {
      targetPage = currentPage + 1;
    } else if (rawPage < currentPage - 0.8) {
      targetPage = currentPage - 1;
    }

    // Clamp to valid bounds
    targetPage = Math.max(0, Math.min(totalPages - 1, targetPage));

    setCurrentPage(targetPage);

    // Snap to the computed page
    scrollViewRef.current?.scrollTo({
      y: targetPage * pageHeight,
      animated: true,
    });
  };

  // Title/Intro Page
  const renderTitlePage = () => (
    <View style={styles.titlePage}>
      <View style={styles.titleContent}>
        {/* Hero Image */}
        {article.hero_image_id && (
          <View style={styles.heroImageContainer}>
            <View style={styles.heroImagePlaceholder}>
              <MaterialIcons name="image" size={48} color="#999" />
              <Text style={styles.heroImagePlaceholderText}>Hero Image</Text>
            </View>
          </View>
        )}

        {/* Title */}
        <Text style={styles.title}>{article.title}</Text>

        {/* Date */}
        {article.published_at && (
          <Text style={styles.date}>{formatDate(article.published_at)}</Text>
        )}

        {/* Swipe hint */}
        {paragraphBlocks.length > 0 && (
          <View style={styles.swipeHint}>
            <MaterialIcons name="keyboard-arrow-up" size={32} color="#999" />
            <Text style={styles.swipeHintText}>Swipe up to read</Text>
          </View>
        )}
      </View>
    </View>
  );

  // Render paragraph block page
  const renderParagraphPage = (block: ParagraphBlockType, index: number) => (
    <ParagraphBlock
      key={block.id}
      html={block.html}
      index={index}
      isActive={currentPage === index + 1}
    />
  );

  return (
    <Layout
      leftHeaderActions={
        <TouchableOpacity
          onPress={handleBack}
          style={styles.headerButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
      }
      headerActions={
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleShare}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="share" size={24} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBookmark}
            style={styles.headerButton}
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
      }
    >
      <View style={styles.container}>

        {/* Page Indicator */}
        {totalPages > 1 && (
          <View style={styles.pageIndicator}>
            <Text style={styles.pageIndicatorText}>
              {currentPage + 1} / {totalPages}
            </Text>
          </View>
        )}

        {/* Vertical Scroll View with Snap */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
          pagingEnabled={false}
          // Lower decelerationRate so momentum dies out sooner (harder to fling)
          decelerationRate={0.7}
          snapToInterval={SCREEN_HEIGHT}
          snapToAlignment="start"
          showsVerticalScrollIndicator={false}
        >
          {/* Title Page */}
          <View key="title-page" style={styles.page}>
            {renderTitlePage()}
          </View>

          {/* Paragraph Pages */}
          {paragraphBlocks.map((block, index) => (
            <View key={block.id} style={styles.page}>
              {renderParagraphPage(block, index)}
            </View>
          ))}

          {/* Comments Page */}
          <View key="comments-page" style={styles.page}>
            <CommentSection articleId={article.id} />
          </View>
        </ScrollView>
      </View>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },
  pageIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pageIndicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    height: SCREEN_HEIGHT,
    width: SCREEN_WIDTH,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  titlePage: {
    minHeight: SCREEN_HEIGHT,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  titleContent: {
    width: '100%',
    maxWidth: 600,
    alignItems: 'center',
  },
  heroImageContainer: {
    width: '100%',
    marginBottom: 32,
  },
  heroImagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImagePlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
    textAlign: 'center',
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 24,
    flexShrink: 1,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  date: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 48,
  },
  swipeHint: {
    alignItems: 'center',
    marginTop: 32,
  },
  swipeHintText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
