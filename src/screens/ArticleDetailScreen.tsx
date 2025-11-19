import React, { useState, useRef } from 'react';
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
import { parseToParagraphBlocks, ParagraphBlock as ParagraphBlockType } from '../lib/paragraphParser';

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
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Parse content into paragraph blocks
  const paragraphBlocks = parseToParagraphBlocks(article.content);
  const totalPages = paragraphBlocks.length + 1; // +1 for title page

  const handleBack = () => {
    navigation.goBack();
  };

  const handleShare = () => {
    console.log('Share article:', article.id);
  };

  const handleBookmark = () => {
    console.log('Bookmark article:', article.id);
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
    const page = Math.round(offsetY / pageHeight);
    
    // Snap to nearest page
    scrollViewRef.current?.scrollTo({
      y: page * pageHeight,
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
          >
            <MaterialIcons name="bookmark-border" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.container}>
        {/* Back Button */}
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>

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
          decelerationRate="fast"
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
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    height: SCREEN_HEIGHT -100,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
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
