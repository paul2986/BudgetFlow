
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { useBudgetData } from '../hooks/useBudgetData';
import { useBudgetLock } from '../hooks/useBudgetLock';
import Icon from '../components/Icon';
import StandardHeader from '../components/StandardHeader';

const AUTO_LOCK_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '1 minute', value: 1 },
  { label: '5 minutes', value: 5 },
  { label: '15 minutes', value: 15 },
  { label: '1 hour', value: 60 },
  { label: 'Never', value: -1 },
];

export default function BudgetLockScreen() {
  const { currentColors } = useTheme();
  const { themedStyles } = useThemedStyles();
  const { showToast } = useToast();
  const { appData, loading: dataLoading } = useBudgetData();
  const { capabilities, loading: lockLoading, toggleBudgetLock, setBudgetAutoLock, lockBudgetNow } = useBudgetLock();
  const params = useLocalSearchParams();
  
  const [saving, setSaving] = useState(false);
  
  const budgetId = params.budgetId as string;
  
  // Add comprehensive null checks for appData and budgets array
  const budget = appData && appData.budgets && Array.isArray(appData.budgets) 
    ? appData.budgets.find(b => b && b.id === budgetId) 
    : undefined;

  useEffect(() => {
    if (!dataLoading && !budget) {
      showToast('Budget not found', 'error');
      router.back();
    }
  }, [budget, dataLoading, showToast]);

  if (dataLoading || lockLoading || !budget) {
    return (
      <View style={[themedStyles.container, { backgroundColor: currentColors.background }]}>
        <StandardHeader 
          title="Budget Lock Settings" 
          onLeftPress={() => router.back()}
          showRightIcon={false}
        />
        <View style={[themedStyles.content, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={themedStyles.textSecondary}>Loading...</Text>
        </View>
      </View>
    );
  }

  const lockSettings = budget.lock || { locked: false, autoLockMinutes: 0 };

  const handleToggleLock = async (enabled: boolean) => {
    if (enabled && !capabilities.canUseDevicePasscode) {
      Alert.alert(
        'Device Passcode Required',
        'To use budget lock, you need to set up a device passcode or biometric authentication in your device settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    setSaving(true);
    try {
      const result = await toggleBudgetLock(budgetId, enabled);
      if (result.success) {
        showToast(enabled ? 'Budget lock enabled' : 'Budget lock disabled', 'success');
      } else {
        showToast(result.error?.message || 'Failed to update lock setting', 'error');
      }
    } catch (error) {
      console.error('BudgetLock: Toggle error:', error);
      showToast('Failed to update lock setting', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetAutoLock = async (minutes: number) => {
    setSaving(true);
    try {
      const result = await setBudgetAutoLock(budgetId, minutes);
      if (result.success) {
        const label = AUTO_LOCK_OPTIONS.find(opt => opt.value === minutes)?.label || `${minutes} minutes`;
        showToast(`Auto-lock set to ${label.toLowerCase()}`, 'success');
      } else {
        showToast(result.error?.message || 'Failed to update auto-lock setting', 'error');
      }
    } catch (error) {
      console.error('BudgetLock: Auto-lock error:', error);
      showToast('Failed to update auto-lock setting', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLockNow = async () => {
    setSaving(true);
    try {
      const result = await lockBudgetNow(budgetId);
      if (result.success) {
        showToast('Budget locked', 'success');
        router.back();
      } else {
        showToast(result.error?.message || 'Failed to lock budget', 'error');
      }
    } catch (error) {
      console.error('BudgetLock: Lock now error:', error);
      showToast('Failed to lock budget', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[themedStyles.container, { backgroundColor: currentColors.background }]}>
      <StandardHeader 
        title="Budget Lock Settings" 
        onLeftPress={() => router.back()}
        showRightIcon={false}
      />
      
      <ScrollView style={themedStyles.content} contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: 0, paddingTop: 16 }]}>
        {/* Budget Info */}
        <View style={[themedStyles.card, { marginBottom: 24 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Icon name="wallet-outline" size={20} style={{ color: currentColors.primary, marginRight: 8 }} />
            <Text style={[themedStyles.subtitle, { flex: 1 }]}>{budget.name}</Text>
          </View>
          <Text style={themedStyles.textSecondary}>
            Configure lock settings for this budget
          </Text>
        </View>

        {/* Device Capability Warning */}
        {!capabilities.canUseDevicePasscode && (
          <View style={[
            themedStyles.card, 
            { 
              backgroundColor: currentColors.error + '20',
              borderColor: currentColors.error,
              borderWidth: 1,
              marginBottom: 24,
            }
          ]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Icon name="warning-outline" size={20} style={{ color: currentColors.error, marginRight: 12, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[themedStyles.text, { color: currentColors.error, fontWeight: '600', marginBottom: 4 }]}>
                  Device Passcode Required
                </Text>
                <Text style={[themedStyles.textSecondary, { fontSize: 14 }]}>
                  Set a device passcode or biometric authentication in your device settings to use budget lock.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Lock Toggle */}
        <View style={[themedStyles.card, { marginBottom: 16 }]}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 44,
            }}
            onPress={() => handleToggleLock(!lockSettings.locked)}
            disabled={saving || !capabilities.canUseDevicePasscode}
          >
            <View style={{ flex: 1 }}>
              <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 4 }]}>
                Lock this budget
              </Text>
              <Text style={themedStyles.textSecondary}>
                Require device authentication to view this budget
              </Text>
            </View>
            <View style={{
              width: 50,
              height: 30,
              borderRadius: 15,
              backgroundColor: lockSettings.locked ? currentColors.primary : currentColors.border,
              justifyContent: 'center',
              paddingHorizontal: 2,
            }}>
              <View style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: '#fff',
                alignSelf: lockSettings.locked ? 'flex-end' : 'flex-start',
              }} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Auto-lock Settings */}
        {lockSettings.locked && (
          <View style={[themedStyles.card, { marginBottom: 16 }]}>
            <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 12 }]}>
              Auto-lock after
            </Text>
            {AUTO_LOCK_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  borderBottomWidth: option.value === AUTO_LOCK_OPTIONS[AUTO_LOCK_OPTIONS.length - 1].value ? 0 : 1,
                  borderBottomColor: currentColors.border,
                }}
                onPress={() => handleSetAutoLock(option.value)}
                disabled={saving}
              >
                <Text style={themedStyles.text}>{option.label}</Text>
                {lockSettings.autoLockMinutes === option.value && (
                  <Icon name="checkmark" size={20} style={{ color: currentColors.primary }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Lock Now Button */}
        {lockSettings.locked && (
          <TouchableOpacity
            style={[
              themedStyles.card,
              {
                backgroundColor: currentColors.error,
                borderColor: currentColors.error,
                borderWidth: 1,
                marginBottom: 16,
                minHeight: 50,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
            onPress={handleLockNow}
            disabled={saving}
          >
            <Icon name="lock-closed" size={20} style={{ color: '#fff', marginRight: 8 }} />
            <Text style={[themedStyles.text, { color: '#fff', fontWeight: '600' }]}>
              Lock now
            </Text>
          </TouchableOpacity>
        )}

        {/* Information */}
        <View style={[themedStyles.card, { backgroundColor: currentColors.backgroundAlt }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Icon name="information-circle-outline" size={20} style={{ color: currentColors.primary, marginRight: 12, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>
                How budget lock works
              </Text>
              <Text style={[themedStyles.textSecondary, { fontSize: 14, lineHeight: 20 }]}>
                • Uses your device's built-in passcode or biometric authentication{'\n'}
                • Your passcode is never stored by this app{'\n'}
                • Auto-lock settings control when authentication is required{'\n'}
                • "Immediately" requires authentication every time{'\n'}
                • "Never" keeps the budget unlocked until manually locked
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
