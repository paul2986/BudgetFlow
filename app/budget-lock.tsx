
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Switch, Platform } from 'react-native';
import { Alert } from '../utils/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { useBudgetData } from '../hooks/useBudgetData';
import { useBudgetLock } from '../hooks/useBudgetLock';
import Icon from '../components/Icon';
import StandardHeader from '../components/StandardHeader';
import { ListGroup, ListRow, Skeleton } from '../components/ui';
import { type, space, radius } from '../styles/tokens';

const AUTO_LOCK_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '1 minute', value: 1 },
  { label: '5 minutes', value: 5 },
  { label: '15 minutes', value: 15 },
  { label: '1 hour', value: 60 },
  { label: 'Never', value: -1 },
];

export default function BudgetLockScreen() {
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
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
      <View style={themedStyles.container}>
        <StandardHeader title="Budget lock" onLeftPress={() => router.back()} showRightIcon={false} />
        <View style={{ padding: breakpoint.gutter, paddingTop: space.s6, gap: space.s3 }}>
          <Skeleton height={64} borderRadius={radius.lg} />
          <Skeleton height={160} borderRadius={radius.lg} />
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

  const canLock = capabilities.canUseDevicePasscode;

  return (
    <View style={themedStyles.container}>
      <StandardHeader title="Budget lock" onLeftPress={() => router.back()} showRightIcon={false} loading={saving} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
      >
        <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          <ListGroup
            header={budget.name}
            footer={
              canLock
                ? 'Uses Face ID, Touch ID or your device passcode. Budget Flow never sees or stores your passcode.'
                : undefined
            }
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 64,
                paddingHorizontal: space.s4,
                paddingVertical: space.s3,
                opacity: canLock ? 1 : 0.5,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.full,
                  backgroundColor: tokens.colors.surfaceSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: space.s3,
                }}
              >
                <Icon name="lock-closed-outline" size={18} color={tokens.colors.textMuted} />
              </View>
              <View style={{ flex: 1, marginRight: space.s3 }}>
                <Text style={[type.bodyMed, { color: tokens.colors.text }]}>Lock this budget</Text>
                <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: 2 }]}>
                  Ask to unlock before showing it
                </Text>
              </View>
              <Switch
                value={!!lockSettings.locked}
                onValueChange={(v) => handleToggleLock(v)}
                disabled={saving || !canLock}
                accessibilityLabel="Lock this budget"
                trackColor={{ false: tokens.colors.borderStrong, true: tokens.colors.brand }}
                thumbColor={tokens.colors.switchThumb}
                // @ts-ignore web-only prop on react-native-web's Switch
                activeThumbColor={tokens.colors.switchThumb}
              />
            </View>
          </ListGroup>

          {!canLock ? (
            <ListGroup>
              <View style={{ flexDirection: 'row', padding: space.s4, gap: space.s3 }}>
                <Icon
                  name={Platform.OS === 'web' ? 'phone-portrait-outline' : 'alert-circle'}
                  size={20}
                  color={Platform.OS === 'web' ? tokens.colors.textMuted : tokens.colors.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyMed, { color: tokens.colors.text }]}>
                    {Platform.OS === 'web' ? 'Available in the mobile app' : 'Set up a device passcode first'}
                  </Text>
                  <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s1 }]}>
                    {Platform.OS === 'web'
                      ? 'Budget lock uses Face ID, Touch ID or your phone’s passcode, so it can only be turned on in the iOS or Android app.'
                      : 'Budget lock uses your device’s passcode or biometrics. Turn one on in your device settings, then come back here.'}
                  </Text>
                </View>
              </View>
            </ListGroup>
          ) : null}

          {lockSettings.locked ? (
            <>
              <ListGroup
                header="Lock again after"
                footer="“Immediately” asks every time you open the budget. “Never” keeps it open until you lock it yourself."
              >
                {AUTO_LOCK_OPTIONS.map((option, i) => {
                  const selected = lockSettings.autoLockMinutes === option.value;
                  return (
                    <ListRow
                      key={option.value}
                      title={option.label}
                      trailing={selected ? <Icon name="checkmark" size={20} color={tokens.colors.brand} /> : undefined}
                      onPress={saving || selected ? undefined : () => handleSetAutoLock(option.value)}
                      accessibilityLabel={`${option.label}${selected ? ', selected' : ''}`}
                      style={{ minHeight: 52 } as any}
                      showSeparator={i < AUTO_LOCK_OPTIONS.length - 1}
                    />
                  );
                })}
              </ListGroup>

              <ListGroup>
                <ListRow
                  title="Lock now"
                  icon="lock-closed"
                  iconColor={tokens.colors.brand}
                  onPress={saving ? undefined : handleLockNow}
                  showSeparator={false}
                />
              </ListGroup>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
