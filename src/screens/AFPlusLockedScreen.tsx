import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Layout from '../components/Layout';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AFPlusLockedScreen() {
  const navigation = useNavigation<NavigationProp>();

  const handleUpgrade = () => {
    // Navigate to Settings where user can upgrade
    navigation.navigate('Settings');
  };

  return (
    <Layout>
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Icon Container */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <MaterialIcons name="lock" size={64} color="#F59E0B" />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>AF+ Required</Text>

          {/* Description */}
          <Text style={styles.description}>
            Unlock exclusive content, premium articles, and advanced features with AF+ membership.
          </Text>

          {/* Features List */}
          <View style={styles.featuresContainer}>
            <View style={styles.featureRow}>
              <MaterialIcons name="star" size={24} color="#F59E0B" />
              <Text style={styles.featureText}>Exclusive premium articles</Text>
            </View>
            <View style={styles.featureRow}>
              <MaterialIcons name="star" size={24} color="#F59E0B" />
              <Text style={styles.featureText}>Advanced analytics & insights</Text>
            </View>
            <View style={styles.featureRow}>
              <MaterialIcons name="star" size={24} color="#F59E0B" />
              <Text style={styles.featureText}>Priority support</Text>
            </View>
            <View style={styles.featureRow}>
              <MaterialIcons name="star" size={24} color="#F59E0B" />
              <Text style={styles.featureText}>Early access to new features</Text>
            </View>
          </View>

          {/* Upgrade Button */}
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleUpgrade}
            activeOpacity={0.8}
          >
            <MaterialIcons name="star" size={20} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.upgradeButtonText}>Upgrade to AF+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  iconContainer: {
    marginBottom: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FDE68A',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  featuresContainer: {
    width: '100%',
    marginBottom: 40,
    paddingHorizontal: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 12,
    flex: 1,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#F59E0B',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonIcon: {
    marginRight: 8,
  },
  upgradeButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  secondaryText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
});

