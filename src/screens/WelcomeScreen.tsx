import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/AppNavigator';
import afLogo from '../../assets/af-logo.png';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const touchStartY = useRef(0);
  const slideTranslateY = useRef(new Animated.Value(0)).current;
  const [currentSlide, setCurrentSlide] = useState(0);
  const hasNavigated = useRef(false); // Prevent double navigation

  // Animate slide transitions with smooth, controlled settings
  useEffect(() => {
    Animated.spring(slideTranslateY, {
      toValue: -currentSlide * SCREEN_HEIGHT,
      useNativeDriver: true,
      tension: 45, // Balanced tension for smooth animation
      friction: 12, // Higher friction = slower, more controlled
    }).start();
  }, [currentSlide]);

  const handleSwipe = (touchEndY: number) => {
    const swipeDistance = touchStartY.current - touchEndY;
    const minSwipeDistance = 60; // Same as Auth screen

    // Swipe up to go to next slide (home)
    if (swipeDistance > minSwipeDistance && !hasNavigated.current) {
      if (currentSlide === 0) {
        hasNavigated.current = true;
        // Navigate immediately - no delay
        navigation.navigate('MainTabs');
        // Update slide state for visual feedback (but navigation already happened)
        setCurrentSlide(1);
      }
    }
  };

  const handleTouchStart = (event: any) => {
    touchStartY.current = event.nativeEvent.pageY;
  };

  const handleTouchEnd = (event: any) => {
    handleSwipe(event.nativeEvent.pageY);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View
        style={[
          styles.slidesContainer,
          {
            transform: [{ translateY: slideTranslateY }],
          },
        ]}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Welcome Slide (0) */}
        <View style={styles.page}>
          <View style={styles.slideContainer}>
            <Image source={afLogo} style={styles.logo} resizeMode="contain" />
            <Text style={styles.hintText}>Swipe up to continue</Text>
          </View>
        </View>

        {/* Home Placeholder Slide (1) - This will navigate to MainTabs */}
        <View style={styles.page}>
          <View style={styles.slideContainer}>
            {/* Empty - navigation happens immediately on swipe */}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  slidesContainer: {
    width: '100%',
    height: SCREEN_HEIGHT * 2, // Total height for 2 slides
  },
  page: {
    width: '100%',
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    width: '100%',
  },
  logo: {
    height: 200,
    width: 200,
    marginBottom: 40,
  },
  hintText: {
    fontSize: 16,
    color: '#999',
    marginTop: 20,
  },
});

