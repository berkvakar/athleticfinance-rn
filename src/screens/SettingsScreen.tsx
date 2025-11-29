import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { logger } from '../lib/logger';
import { isAFPlusMember } from '../lib/planUtils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ThemeMode = 'light' | 'dark' | 'system';

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { logout, user } = useAuth();

  // Mock state for UI (no functionality yet)
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [dailyNotifications, setDailyNotifications] = useState(true);
  const [afPlusNotifications, setAfPlusNotifications] = useState(false);

  const handleSignOut = async () => {
    try {
      logger.log('[SETTINGS] handleSignOut: Starting sign out process');
      await logout();
      logger.log('[SETTINGS] handleSignOut: Logout successful');
    } catch (error: any) {
      logger.error('[SETTINGS] handleSignOut: Logout error:', error?.message || error);
    }
  };

  const renderSettingRow = (
    icon: string,
    iconFamily: 'MaterialIcons' | 'Ionicons',
    title: string,
    onPress?: () => void,
    rightElement?: React.ReactNode,
    destructive?: boolean,
  ) => (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, destructive && styles.iconContainerDestructive]}>
          {iconFamily === 'MaterialIcons' ? (
            <MaterialIcons name={icon as any} size={20} color={destructive ? '#EF4444' : '#374151'} />
          ) : (
            <Ionicons name={icon as any} size={20} color={destructive ? '#EF4444' : '#374151'} />
          )}
        </View>
        <Text style={[styles.settingTitle, destructive && styles.settingTitleDestructive]}>
          {title}
        </Text>
      </View>
      {rightElement ? (
        rightElement
      ) : (
        <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
      )}
    </TouchableOpacity>
  );

  const renderThemeSelector = () => {
    const isLightMode = themeMode === 'light';

    return (
      <View style={styles.themeSelectorContainer}>
        <TouchableOpacity
          style={styles.themeToggle}
          onPress={() => setThemeMode(isLightMode ? 'dark' : 'light')}
          activeOpacity={0.8}
        >
          <View style={[styles.themeSlider, isLightMode ? styles.themeSliderLeft : styles.themeSliderRight]} />
          <View style={[styles.themeLabel, styles.themeLabelLeft]}>
            <MaterialIcons name="wb-sunny" size={18} color={isLightMode ? '#fff' : '#9CA3AF'} />
            <Text style={[styles.themeLabelText, isLightMode && styles.themeLabelTextActive]}>
              Light
            </Text>
          </View>
          <View style={[styles.themeLabel, styles.themeLabelRight]}>
            <MaterialIcons name="nightlight-round" size={18} color={!isLightMode ? '#fff' : '#9CA3AF'} />
            <Text style={[styles.themeLabelText, !isLightMode && styles.themeLabelTextActive]}>
              Dark
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Layout
      headerActions={
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
      }
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.title}>Settings</Text>

          {/* Container 1: My Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Information</Text>
            <View style={styles.card}>
              {renderSettingRow('email', 'MaterialIcons', 'Email', () => {})}
              <View style={styles.divider} />
              {renderSettingRow('lock', 'MaterialIcons', 'Password', () => {})}
              <View style={styles.divider} />
              {renderSettingRow('card-membership', 'MaterialIcons', 'Subscription', () => {})}
              <View style={styles.divider} />
              {renderSettingRow(
                'logout',
                'MaterialIcons',
                'Log Out',
                handleSignOut,
                <MaterialIcons name="chevron-right" size={24} color="#EF4444" />,
                true
              )}
            </View>
          </View>

          {/* Container 2: My Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Settings</Text>
            <View style={styles.card}>
              {/* Theme Selector */}
              <View style={styles.settingRowFullWidth}>
                <View style={styles.settingLeft}>
                  <View style={styles.iconContainer}>
                    <MaterialIcons name="palette" size={20} color="#6366F1" />
                  </View>
                  <Text style={styles.settingTitle}>Theme</Text>
                </View>
              </View>
              {renderThemeSelector()}
              
              <View style={styles.divider} />
              
              {/* Daily Notifications */}
              {renderSettingRow(
                'notifications-active',
                'MaterialIcons',
                'Daily Notifications',
                undefined,
                <Switch
                  value={dailyNotifications}
                  onValueChange={setDailyNotifications}
                  trackColor={{ false: '#E5E7EB', true: '#9CA3AF' }}
                  thumbColor={dailyNotifications ? '#374151' : '#F3F4F6'}
                  ios_backgroundColor="#E5E7EB"
                />
              )}
              
              <View style={styles.divider} />
              
              {/* AF+ Notifications or Join AF+ Button */}
              {isAFPlusMember(user?.plan) ? (
                renderSettingRow(
                  'star',
                  'MaterialIcons',
                  'AF+ Notifications',
                  undefined,
                  <Switch
                    value={afPlusNotifications}
                    onValueChange={setAfPlusNotifications}
                    trackColor={{ false: '#E5E7EB', true: '#F59E0B' }}
                    thumbColor={afPlusNotifications ? '#fff' : '#F3F4F6'}
                    ios_backgroundColor="#E5E7EB"
                  />
                )
              ) : (
                <TouchableOpacity
                  style={styles.afPlusRow}
                  activeOpacity={0.7}
                  onPress={() => {}}
                >
                  <View style={styles.settingLeft}>
                    <View style={[styles.iconContainer, styles.iconContainerAfPlus]}>
                      <MaterialIcons name="star" size={20} color="#F59E0B" />
                    </View>
                    <Text style={styles.settingTitle}>AF+ Notifications</Text>
                  </View>
                  <TouchableOpacity style={styles.afPlusButton} activeOpacity={0.8}>
                    <MaterialIcons name="star" size={16} color="#fff" />
                    <Text style={styles.afPlusButtonText}>Join AF+</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Bottom spacing */}
          <View style={styles.bottomSpacing} />
        </View>
      </ScrollView>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 28,
    letterSpacing: -0.5,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingRowFullWidth: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconContainerDestructive: {
    backgroundColor: '#FEE2E2',
  },
  iconContainerAfPlus: {
    backgroundColor: '#FEF3C7',
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  settingTitleDestructive: {
    color: '#EF4444',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 64,
  },
  themeSelectorContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  themeToggle: {
    position: 'relative',
    height: 50,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  themeSlider: {
    position: 'absolute',
    width: '50%',
    height: 42,
    backgroundColor: '#000',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  themeSliderLeft: {
    left: 4,
  },
  themeSliderRight: {
    right: 4,
  },
  themeLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1,
  },
  themeLabelLeft: {
    paddingLeft: 8,
  },
  themeLabelRight: {
    paddingRight: 8,
  },
  themeLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  themeLabelTextActive: {
    color: '#fff',
  },
  afPlusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  afPlusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  afPlusButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  bottomSpacing: {
    height: 40,
  },
});

