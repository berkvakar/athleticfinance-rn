import React from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  useWindowDimensions,
} from 'react-native';
import RenderHTML from 'react-native-render-html';

interface ParagraphBlockProps {
  html: string;
  index: number;
  isActive: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ParagraphBlock({
  html,
  index,
  isActive,
}: ParagraphBlockProps) {
  const { width } = useWindowDimensions();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(50)).current;

  React.useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
    }
  }, [isActive]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.contentWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <RenderHTML
          contentWidth={Math.min(width - 48, 600)}
          source={{ html }}
          tagsStyles={htmlTagStyles}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 40,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: SCREEN_WIDTH - 48,
  },
});

const htmlTagStyles = {
  p: {
    fontSize: 16,
    lineHeight: 28,
    color: '#1a1a1a',
    marginBottom: 16,
  },
  h1: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 16,
    color: '#000',
  },
  h2: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 14,
    color: '#000',
  },
  h3: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
    color: '#000',
  },
  a: {
    color: '#0A84FF',
    textDecorationLine: 'underline',
  },
  ul: {
    marginBottom: 16,
    paddingLeft: 20,
  },
  ol: {
    marginBottom: 16,
    paddingLeft: 20,
  },
  li: {
    fontSize: 16,
    lineHeight: 28,
    color: '#1a1a1a',
    marginBottom: 8,
  },
  hr: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: 24,
  },
  strong: {
    fontWeight: '700',
  },
  em: {
    fontStyle: 'italic',
  },
  u: {
    textDecorationLine: 'underline',
  },
  s: {
    textDecorationLine: 'line-through',
  },
  code: {
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 14,
  },
  img: {
    maxWidth: '100%',
    height: 'auto',
    marginVertical: 16,
    borderRadius: 8,
  },
};

