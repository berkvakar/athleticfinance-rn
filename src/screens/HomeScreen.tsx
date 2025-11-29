import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { apiClient } from '../lib/api';
import { useArticleList } from '../hooks/useArticleList';
import type { RootStackParamList } from '../navigation/AppNavigator';
import TodayArticleCard from '../components/TodayArticleCard';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  imageUrl?: string;
}

export default function HomeScreen() {
  const { user, loading: authLoading, savedArticleIds } = useAuth();
  const { renderArticle } = useArticleList(savedArticleIds);
  const navigation = useNavigation<NavigationProp>();
  const [articles, setArticles] = useState<Article[]>([]);
  const [todayArticle, setTodayArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingToday, setLoadingToday] = useState(false);
  const [articlesLoaded, setArticlesLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartY = useRef(0);
  const slideTranslateY = useRef(new Animated.Value(0)).current;
  const isSwipingRef = useRef(false);
  const swipeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only load today's article on initial load
    if (!authLoading && user) {
      loadTodayArticle();
    }
  }, [authLoading, user]);

  // Load articles batch when scrolling to page 2
  useEffect(() => {
    if (currentSlide === 1 && !articlesLoaded && !loading) {
      loadArticlesBatch();
    }
  }, [currentSlide, articlesLoaded, loading]);

  // Animate slide transitions
  useEffect(() => {
    Animated.spring(slideTranslateY, {
      toValue: -currentSlide * SCREEN_HEIGHT,
      useNativeDriver: true,
      tension: 40,
      friction: 10,
    }).start();
  }, [currentSlide]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (swipeTimeoutRef.current) {
        clearTimeout(swipeTimeoutRef.current);
      }
    };
  }, []);

  const loadTodayArticle = async () => {
    try {
      setLoadingToday(true);
      const result = await apiClient.getRecentArticle();
      if (result.success && result.article) {
        setTodayArticle(result.article);
      } else {
        setTodayArticle(null);
      }
      setLoadingToday(false);
    } catch (error) {
      console.error('Error loading today article:', error);
      setLoadingToday(false);
      setTodayArticle(null);
    }
  };

  const loadArticlesBatch = async () => {
    try {
      setLoading(true);
      const result = await apiClient.getRecentArticlesBatch();
      if (result.success && result.articles) {
        setArticles(result.articles);
        setArticlesLoaded(true);
      } else {
        setArticles([]);
        setArticlesLoaded(true);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading articles batch:', error);
      setLoading(false);
      setArticles([]);
      setArticlesLoaded(true);
    }
  };

  // Filter articles based on search query - memoized for performance
  const searchFilteredArticles = useMemo(() => {
    if (!searchQuery) return articles;
    const query = searchQuery.toLowerCase();
    return articles.filter(
      (article) =>
        article.title.toLowerCase().includes(query)
    );
  }, [articles, searchQuery]);

  const displayArticles = searchFilteredArticles;

  const currentDate = todayArticle?.published_at 
    ? new Date(todayArticle.published_at) 
    : displayArticles[0]?.published_at 
    ? new Date(displayArticles[0].published_at) 
    : new Date();

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialIcons name="article" size={48} color="#999" />
      <Text style={styles.emptyStateText}>No articles available</Text>
      <Text style={styles.emptyStateSubtext}>
        Check back later for new content
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle}>Articles</Text>
    </View>
  );

  const handleSwipe = (swipeDistance: number) => {
    let swipeDetected = false;

    if (swipeDistance > 60) {
      // Swiped up - go to next slide
      if (currentSlide < 1) {
        setCurrentSlide(currentSlide + 1);
        swipeDetected = true;
      }
    } else if (swipeDistance < -60) {
      // Swiped down - go to previous slide
      if (currentSlide > 0) {
        setCurrentSlide(currentSlide - 1);
        swipeDetected = true;
      }
    }

    // If a swipe was detected, prevent card press for a short time
    if (swipeDetected) {
      isSwipingRef.current = true;
      // Clear any existing timeout
      if (swipeTimeoutRef.current) {
        clearTimeout(swipeTimeoutRef.current);
      }
      // Reset the flag after animation completes (spring animation ~500ms)
      swipeTimeoutRef.current = setTimeout(() => {
        isSwipingRef.current = false;
        swipeTimeoutRef.current = null;
      }, 600);
    }
  };

  const handleTouchStart = (event: any) => {
    touchStartY.current = event.nativeEvent.pageY;
    isSwipingRef.current = false;
  };

  const handleTouchMove = (event: any) => {
    const currentY = event.nativeEvent.pageY;
    const moveDistance = Math.abs(touchStartY.current - currentY);
    // If user has moved significantly, mark as potential swipe
    if (moveDistance > 20) {
      isSwipingRef.current = true;
    }
  };

  const handleTouchEnd = (event: any) => {
    const touchEndY = event.nativeEvent.pageY;
    const swipeDistance = touchStartY.current - touchEndY;
    const minSwipeDistance = 60;

    // Only process swipe if movement was significant
    if (Math.abs(swipeDistance) > minSwipeDistance) {
      handleSwipe(swipeDistance);
    } else {
      // If no significant swipe, reset the flag after a short delay
      setTimeout(() => {
        isSwipingRef.current = false;
      }, 100);
    }
  };

  const handleCardPress = () => {
    // Prevent card press if a swipe was just detected
    if (isSwipingRef.current) {
      return;
    }
    if (todayArticle) {
      navigation.navigate('ArticleDetail', { article: todayArticle });
    }
  };


  return (
    <Layout
      date={currentDate}
      headerActions={
        <TouchableOpacity
          onPress={() => setIsSearchOpen(!isSearchOpen)}
          style={styles.searchButton}
        >
          <MaterialIcons
            name={isSearchOpen ? 'close' : 'search'}
            size={20}
            color="#000"
          />
        </TouchableOpacity>
      }
    >
      <Animated.View
        style={[
          styles.slidesContainer,
          {
            transform: [{ translateY: slideTranslateY }],
          },
        ]}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Page 1: Today's Article */}
        <View style={styles.page}>
          <View style={styles.container}>
            {loadingToday ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#000" />
              </View>
            ) : todayArticle ? (
              <View style={styles.todayArticleContainer}>
                <TodayArticleCard
                  id={todayArticle.id}
                  title={todayArticle.title}
                  hero_image_id={todayArticle.hero_image_id}
                  imageUrl={todayArticle.imageUrl}
                  onPress={handleCardPress}
                  isSaved={savedArticleIds.has(todayArticle.id)}
                />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyStateWrapper}>
                  <MaterialIcons name="article" size={48} color="#999" />
                  <Text style={styles.emptyStateText}>No article available today</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Check back later for new content
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Page 2: All Articles */}
        <View style={styles.page}>
          <View style={styles.container}>
            {isSearchOpen && (
              <View style={styles.searchContainer}>
                <MaterialIcons
                  name="search"
                  size={20}
                  color="#999"
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                  placeholderTextColor="#999"
                />
              </View>
            )}

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#000" />
              </View>
            ) : displayArticles.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyStateWrapper}>
                  {renderEmptyState()}
                </View>
              </View>
            ) : (
              <FlatList
                data={displayArticles}
                renderItem={renderArticle}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                style={styles.flatList}
                ListHeaderComponent={renderHeader}
              />
            )}
          </View>
        </View>
      </Animated.View>
    </Layout>
  );
}

const styles = StyleSheet.create({
  slidesContainer: {
    width: '100%',
    height: SCREEN_HEIGHT * 2, // Total height for 2 pages
  },
  page: {
    width: '100%',
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  container: {
    flex: 1,
    width: '100%',
  },
  flatList: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  searchButton: {
    padding: 4,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    width: '100%',
  },
  emptyStateWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 100,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
    width: '100%',
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  pageContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  pageDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  todayArticleContainer: {
    flex: 1,
    width: '100%',
  },
});
