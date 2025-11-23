import React, { ReactNode, memo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import afLogo from '../../assets/af-logo.png';

interface LayoutProps {
  children: ReactNode;
  date?: Date;
  headerActions?: ReactNode;
  leftHeaderActions?: ReactNode;
}

const Layout = memo(function Layout({ children, date, headerActions, leftHeaderActions }: LayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <Image 
              source={afLogo} 
              style={styles.logo} 
              resizeMode="contain"
              // Ensure high quality rendering
              defaultSource={afLogo}
              fadeDuration={0}
            />
          </View>
          {leftHeaderActions && (
            <View style={styles.leftHeaderActions}>
              {leftHeaderActions}
            </View>
          )}
          <View style={styles.headerActions}>
            {headerActions}
          </View>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
});

export default Layout;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#fff',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 50,
    position: 'relative',
  },
  logoContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  logo: {
    width: 96,
    height: 96,
    // Ensure sharp rendering on all devices
    overflow: 'hidden',
  },
  leftHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    zIndex: 1,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 1,
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

