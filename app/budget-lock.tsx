import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { useBudgetData } from '../hooks/useBudgetData';
import { useBudgetLock } from '../hooks/useBudgetLock';
import { describeWait, hasLock } from '../utils/budgetLock';
import { haptics } from '../utils/haptics';
import Icon from '../components/Icon';
import StandardHeader from '../components/StandardHeader';
import BudgetUnlock from '../components/BudgetUnlock';
import CodeSheet from '../components/CodeSheet';
import { Card, ConfirmDialog, ListGroup, ListRow, Skeleton } from '../components/ui';
import { type, space, radius } from '../styles/tokens';

const AUTO_LOCK_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '1 minute', value: 1 },
  { label: '5 minutes', value: 5 },
  { label: '15 minutes', value: 15 },
  { label: '1 hour', value: 60 },
  { label: 'Never', value: -1 },
];

/** A settings row with a switch, which stays its own control (the row isn't one big button). */
function SwitchRow({
  icon,
  title,
  caption,
  value,
  onChange,
  disabled,
  showSeparator = true,
}: {
  icon: string;
  title: string;
  caption: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  showSeparator?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 64,
        paddingHorizontal: space.s4,
        paddingVertical: space.s3,
        borderBottomWidth: showSeparator ? 1 : 0,
        borderBottomColor: tokens.colors.border,
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
        <Icon name={icon as any} size={18} color={tokens.colors.textMuted} />
      </View>
      <View style={{ flex: 1, marginRight: space.s3 }}>
        <Text style={[type.bodyMed, { color: tokens.colors.text }]}>{title}</Text>
        <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: 2 }]}>{caption}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ false: tokens.colors.borderStrong, true: tokens.colors.brand }}
        thumbColor={tokens.colors.switchThumb}
        // @ts-ignore web-only prop on react-native-web's Switch
        activeThumbColor={tokens.colors.switchThumb}
      />
    </View>
  );
}

type Sheet = 'new' | 'change' | 'off' | null;

export default function BudgetLockScreen() {
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { showToast } = useToast();
  const { appData, loading: dataLoading } = useBudgetData();
  const { biometric, isLocked, setCode, removeLock, setAutoLock, lockNow, setBiometrics, enableBiometrics, checkCode } = useBudgetLock();
  const params = useLocalSearchParams();

  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [offerBiometric, setOfferBiometric] = useState(false);
  const justLocked = useRef(false);

  const budgetId = params.budgetId as string;
  const budget = appData?.budgets?.find((b) => b && b.id === budgetId);
  const lock = budget?.lock;
  const locked = hasLock(budget);

  useEffect(() => {
    if (!dataLoading && !budget) {
      showToast('Budget not found', 'error');
      router.back();
    }
  }, [budget, dataLoading, showToast]);

  // Just locked it: offer Face ID / Touch ID, once the code sheet has gone (a dialog
  // can't open over a sheet that is still closing).
  useEffect(() => {
    if (sheet !== null || !justLocked.current || !biometric || lock?.biometrics) return;
    justLocked.current = false;
    const timer = setTimeout(() => setOfferBiometric(true), 500);
    return () => clearTimeout(timer);
  }, [sheet, biometric, lock?.biometrics]);

  const run = useCallback(
    async (action: () => Promise<{ success: boolean; error?: Error }>, done: string, failed: string) => {
      setSaving(true);
      try {
        const result = await action();
        if (result.success) showToast(done, 'success');
        else showToast(result.error?.message || failed, 'error');
        return result.success;
      } catch (error) {
        console.error('BudgetLock:', failed, error);
        showToast(failed, 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [showToast]
  );

  if (dataLoading || !budget) {
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

  // A locked budget asks for its code before it lets anyone change how it is locked.
  if (isLocked(budget)) {
    return (
      <View style={themedStyles.container}>
        <StandardHeader title="Budget lock" onLeftPress={() => router.back()} showRightIcon={false} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
        >
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <Card>
              <BudgetUnlock budget={budget} title={`${budget.name} is locked`} caption="Enter your code to change its lock." showSwitch={false} />
            </Card>
          </View>
        </ScrollView>
      </View>
    );
  }

  const checkCurrent = async (pin: string): Promise<string | void> => {
    const check = await checkCode(budget.id, pin, { unlock: false });
    if (check.ok) return;
    return check.reason === 'wait'
      ? `Too many wrong codes. Try again in ${describeWait(check.seconds)}.`
      : 'That code isn’t right.';
  };

  const handleNewCode = async (pin: string): Promise<string | void> => {
    const result = await setCode(budget.id, pin);
    if (!result.success) return result.error?.message || 'Couldn’t save the code. Please try again.';
    haptics.success();
    showToast(locked ? 'Code changed' : 'Budget locked', 'success');
    justLocked.current = !locked;
  };

  const handleTurnOff = async (pin: string): Promise<string | void> => {
    const wrong = await checkCurrent(pin);
    if (wrong) return wrong;
    const result = await removeLock(budget.id);
    if (!result.success) return result.error?.message || 'Couldn’t turn the lock off. Please try again.';
    haptics.success();
    showToast('Lock turned off', 'success');
  };

  const handleBiometrics = async (enabled: boolean) => {
    setSaving(true);
    try {
      const ok = enabled ? await enableBiometrics(budget) : (await setBiometrics(budget.id, false)).success;
      if (!ok) showToast(enabled ? `Couldn’t turn on ${biometric}` : 'Couldn’t update that setting', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLockNow = async () => {
    const ok = await run(() => lockNow(budget.id), 'Budget locked', 'Failed to lock budget');
    if (ok) router.back();
  };

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
              locked
                ? 'The same code opens this budget on every device you’re signed in to. If it’s shared, only you are asked for it.'
                : 'Hide this budget behind a 4-digit code. It’s yours alone: people you share the budget with aren’t asked for it. It keeps the screen private; it doesn’t encrypt your data.'
            }
          >
            <SwitchRow
              icon="lock-closed-outline"
              title="Lock this budget"
              caption={locked ? 'Asks for a code before showing it' : 'Choose a 4-digit code'}
              value={locked}
              onChange={(next) => setSheet(next ? 'new' : 'off')}
              disabled={saving}
              showSeparator={false}
            />
          </ListGroup>

          {locked ? (
            <>
              <ListGroup>
                {biometric ? (
                  <SwitchRow
                    icon={biometric === 'Face ID' ? 'scan-outline' : 'finger-print'}
                    title={`Unlock with ${biometric}`}
                    caption="On this device only. The code still works."
                    value={!!lock?.biometrics}
                    onChange={handleBiometrics}
                    disabled={saving}
                  />
                ) : null}
                <ListRow
                  title="Change code"
                  icon="keypad-outline"
                  chevron
                  onPress={saving ? undefined : () => setSheet('change')}
                  showSeparator={false}
                />
              </ListGroup>

              <ListGroup
                header="Lock after leaving the app"
                footer="How long Budget Flow can be out of sight before it asks for the code again. “Never” keeps it open on a device until you lock it yourself. Applies on all your devices."
              >
                {AUTO_LOCK_OPTIONS.map((option, i) => {
                  const selected = lock?.autoLockMinutes === option.value;
                  return (
                    <ListRow
                      key={option.value}
                      title={option.label}
                      trailing={selected ? <Icon name="checkmark" size={20} color={tokens.colors.brand} /> : undefined}
                      onPress={
                        saving || selected
                          ? undefined
                          : () =>
                              run(
                                () => setAutoLock(budget.id, option.value),
                                `Locks ${option.label === 'Never' ? 'only when you lock it' : option.label === 'Immediately' ? 'as soon as you leave the app' : `after ${option.label}`}`,
                                'Failed to update auto-lock setting'
                              )
                      }
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

      <CodeSheet
        visible={sheet === 'new'}
        onClose={() => setSheet(null)}
        title="Lock budget"
        prompt="Choose a 4-digit code"
        confirm
        onSubmit={handleNewCode}
      />
      <CodeSheet
        visible={sheet === 'change'}
        onClose={() => setSheet(null)}
        title="Change code"
        prompt="Choose a new code"
        confirm
        current={{ prompt: 'Enter your current code', check: checkCurrent }}
        onSubmit={handleNewCode}
      />
      <CodeSheet
        visible={sheet === 'off'}
        onClose={() => setSheet(null)}
        title="Turn off lock"
        prompt="Enter your code to turn the lock off"
        onSubmit={handleTurnOff}
      />

      <ConfirmDialog
        visible={offerBiometric}
        title={`Use ${biometric}?`}
        message={`Open this budget with ${biometric} instead of typing the code. The code still works.`}
        confirmLabel={`Use ${biometric}`}
        cancelLabel="Not now"
        onConfirm={() => {
          setOfferBiometric(false);
          handleBiometrics(true);
        }}
        onCancel={() => setOfferBiometric(false)}
      />
    </View>
  );
}
