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
import { apiClient } from '../lib/api';
import { useArticleList } from '../hooks/useArticleList';
import type { RootStackParamList } from '../navigation/AppNavigator';

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
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false); // Start as false since there's no async work initially
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    // Only load articles after auth is done loading and user is authenticated
    if (!authLoading && user) {
      loadArticles();
    }
  }, [authLoading, user]);

  const loadArticles = async () => {
    try {
      setLoading(true);
      const posts = await apiClient.getRecentPosts();
      setArticles(posts);
      setLoading(false);
    } catch (error) {
      console.error('Error loading articles:', error);
      setLoading(false);
      // Keep articles empty on error - user will see empty state
      setArticles([]);
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

  const currentDate = displayArticles[0]?.published_at 
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
            ListHeaderComponent={renderHeader}
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
});
