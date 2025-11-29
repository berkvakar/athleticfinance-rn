import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import ArticleCard from '../components/ArticleCard';

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

export function useArticleList(savedArticleIds?: Set<number>) {
  const navigation = useNavigation<NavigationProp>();

  const handleArticlePress = useCallback((article: Article) => {
    navigation.navigate('ArticleDetail', { article });
  }, [navigation]);

  const renderArticle = useCallback(({ item }: { item: Article }) => {
    const isSaved = savedArticleIds ? savedArticleIds.has(item.id) : false;
    return (
      <ArticleCard 
        id={item.id}
        title={item.title}
        hero_image_id={item.hero_image_id}
        imageUrl={item.imageUrl}
        onPress={() => handleArticlePress(item)}
        isSaved={isSaved}
      />
    );
  }, [handleArticlePress, savedArticleIds]);

  return {
    handleArticlePress,
    renderArticle,
  };
}

