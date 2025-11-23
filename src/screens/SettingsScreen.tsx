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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ThemeMode = 'light' | 'dark' | 'system';

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { logout, user } = useAuth();

  // Mock state for UI (no functionality yet)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
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
            <MaterialIcons name={icon as any} size={20} color={destructive ? '#EF4444' : '#6366F1'} />
          ) : (
            <Ionicons name={icon as any} size={20} color={destructive ? '#EF4444' : '#6366F1'} />
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
    const themes: { mode: ThemeMode; label: string; icon: string }[] = [
      { mode: 'light', label: 'Light', icon: 'wb-sunny' },
      { mode: 'dark', label: 'Dark', icon: 'nightlight-round' },
      { mode: 'system', label: 'System', icon: 'phone-iphone' },
    ];

    return (
      <View style={styles.themeSelectorContainer}>
        {themes.map((theme, index) => (
          <TouchableOpacity
            key={theme.mode}
            style={[
              styles.themeOption,
              themeMode === theme.mode && styles.themeOptionActive,
              index === 0 && styles.themeOptionFirst,
              index === themes.length - 1 && styles.themeOptionLast,
            ]}
            onPress={() => setThemeMode(theme.mode)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={theme.icon as any}
              size={22}
              color={themeMode === theme.mode ? '#6366F1' : '#6B7280'}
            />
            <Text
              style={[
                styles.themeOptionText,
                themeMode === theme.mode && styles.themeOptionTextActive,
              ]}
            >
              {theme.label}
            </Text>
            {themeMode === theme.mode && (
              <View style={styles.themeCheckmark}>
                <MaterialIcons name="check" size={16} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        ))}
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

          {/* Container 2: My Devices */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Devices</Text>
            <View style={styles.card}>
              <View style={styles.deviceRow}>
                <View style={styles.settingLeft}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="phone-portrait-outline" size={20} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={styles.deviceName}>This Device</Text>
                    <Text style={styles.deviceInfo}>Last active: Now</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.removeButton} activeOpacity={0.7}>
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Container 3: My Settings */}
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
                  trackColor={{ false: '#E5E7EB', true: '#C7D2FE' }}
                  thumbColor={dailyNotifications ? '#6366F1' : '#F3F4F6'}
                  ios_backgroundColor="#E5E7EB"
                />
              )}
              
              <View style={styles.divider} />
              
              {/* AF+ Notifications or Join AF+ Button */}
              {user?.isPremium ? (
                renderSettingRow(
                  'star',
                  'MaterialIcons',
                  'AF+ Notifications',
                  undefined,
                  <Switch
                    value={afPlusNotifications}
                    onValueChange={setAfPlusNotifications}
                    trackColor={{ false: '#E5E7EB', true: '#FDE68A' }}
                    thumbColor={afPlusNotifications ? '#F59E0B' : '#F3F4F6'}
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
    backgroundColor: '#EEF2FF',
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
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  deviceInfo: {
    fontSize: 13,
    color: '#6B7280',
  },
  removeButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  themeSelectorContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    position: 'relative',
  },
  themeOptionFirst: {
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  themeOptionLast: {
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  themeOptionActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 6,
  },
  themeOptionTextActive: {
    color: '#6366F1',
    fontWeight: '600',
  },
  themeCheckmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
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

