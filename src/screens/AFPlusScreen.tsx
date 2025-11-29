import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import ArticleCard from '../components/ArticleCard';
import { apiClient } from '../lib/api';
import { isAFPlusMember } from '../lib/planUtils';
import AFPlusLockedScreen from './AFPlusLockedScreen';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Article {
  id: number;
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
}

export default function AFPlusScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false); // Start as false since there's no async work initially
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Check if user has AF+ plan - if not, show locked screen
  // This check happens on every render to prevent manipulation
  const hasAFPlus = isAFPlusMember(user?.plan);
  
  // Always check plan before rendering - if not AF+, show locked screen
  if (!hasAFPlus) {
    return <AFPlusLockedScreen />;
  }

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    try {
      // TODO: Replace with actual API call to fetch articles
      // When implementing real API call, set loading state:
      // setLoading(true);
      // const data = await apiClient.getArticles();
      // setArticles(data);
      // setLoading(false);
      
      // For now, articles array will be empty (no mock data)
      setArticles([]);
    } catch (error) {
      console.error('Error loading articles:', error);
      setLoading(false);
    }
  };

  // Filter articles based on premium status and search query - memoized for performance
  const visibleArticles = useMemo(() => {
    return articles.filter((article) => {
      if (!article.isPremium) return true;
      return user?.isPremium;
    });
  }, [articles, user?.isPremium]);

  const searchFilteredArticles = useMemo(() => {
    if (!searchQuery) return visibleArticles;
    const query = searchQuery.toLowerCase();
    return visibleArticles.filter(
      (article) =>
        article.title.toLowerCase().includes(query) ||
        article.excerpt.toLowerCase().includes(query)
    );
  }, [visibleArticles, searchQuery]);

  // Non-premium users see limited articles - memoized for performance
  const displayArticles = useMemo(() => {
    return user?.isPremium
      ? searchFilteredArticles
      : searchFilteredArticles.slice(0, 7);
  }, [searchFilteredArticles, user?.isPremium]);

  const currentDate = displayArticles[0]?.date || new Date();

  const handleArticlePress = useCallback((articleId: number) => {
    // TODO: Navigate to article detail screen
    console.log('Navigate to article:', articleId);
  }, []);

  const renderArticle = useCallback(({ item }: { item: Article }) => (
    <ArticleCard {...item} onPress={() => handleArticlePress(item.id)} />
  ), [handleArticlePress]);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialIcons name="article" size={48} color="#999" />
      <Text style={styles.emptyStateText}>No articles available</Text>
      <Text style={styles.emptyStateSubtext}>
        Check back later for new content
      </Text>
    </View>
  );


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
            removeClippedSubviews={true}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={10}
          />
        )}
      </View>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
});

