import { useState } from 'react';
import { LAYOUT } from '../hooks/useBreakpoint';
import { Text, View, Platform, Animated, Linking } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useCurrency, displaySymbol } from '../hooks/useCurrency';
import { useBudgetData } from '../hooks/useBudgetData';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useFeedbackBadges } from '../hooks/useFeedbackBadges';
import { useEndReminders } from '../hooks/useEndReminders';
import { Alert } from '../utils/alert';
import StandardHeader, { LargeTitle } from '../components/StandardHeader';
import { useLargeTitle } from '../hooks/useLargeTitle';
import Icon from '../components/Icon';
import {
  Avatar,
  ConfirmDialog,
  ListGroup,
  ListRow,
  SegmentedControl,
  SwitchRow,
} from '../components/ui';
import { type, radius, space } from '../styles/tokens';
import { appVersionLabel } from '../utils/appVersion';
import { haptics } from '../utils/haptics';

/**
 * Settings (UI_AUDIT Phase 3): one inset-grouped layout at every size, the
 * iOS Settings idiom. Budgets and categories are managed on their own screens
 * (/budgets, /manage-categories, /currency); this screen only links to them, so there is
 * a single place to do each task.
 */

type ThemeMode = 'system' | 'light' | 'dark';

/** Settings reads best as a narrow column, even on desktop. */
const SETTINGS_MAX_WIDTH = LAYOUT.listMaxWidth;

export default function SettingsScreen() {
  const { tokens, themeMode, setThemeMode } = useTheme();
  const largeTitle = useLargeTitle();
  const { currency } = useCurrency();
  const { appData, activeBudget, clearAllData, user, isSyncing } = useBudgetData();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { showToast } = useToast();
  const { signOut, deleteAccount } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const { unreadReplies, needsYou } = useFeedbackBadges(user?.id, isAdmin);
  const reminders = useEndReminders();

  const [confirmSignOutVisible, setConfirmSignOutVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const budgetCount = appData?.budgets?.length || 0;

  const handleRemindersChange = async (next: boolean) => {
    const result = await reminders.setEnabled(next);
    if (result === 'blocked') {
      haptics.error();
      showToast('Notifications are off for Budget Flow. Turn them on in iOS Settings.', 'error');
    } else if (result === 'on') {
      haptics.success();
    }
  };

  const handleClearAllData = () => {
    Alert.alert(
      'Erase all data?',
      'This permanently deletes every budget, person and expense in your account. Budgets you share stay with the people you share them with. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase all data',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await clearAllData();
              if (result.success) {
                showToast('All data erased', 'success');
                // Reload so every cache starts clean.
                setTimeout(() => {
                  if (Platform.OS === 'web') {
                    window.location.href = '/';
                  } else {
                    router.replace('/');
                  }
                }, 500);
              } else {
                showToast('Couldn’t erase data. Please try again.', 'error');
              }
            } catch (error) {
              console.error('Settings: Clear data error:', error);
              showToast('Couldn’t erase data. Please try again.', 'error');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader title="Settings" largeTitle={largeTitle} maxWidth={SETTINGS_MAX_WIDTH} showLeftIcon={false} showRightIcon={false} />

      <Animated.ScrollView
        {...largeTitle.scrollProps}
        contentContainerStyle={[
          themedStyles.scrollContent,
          { paddingHorizontal: breakpoint.gutter, paddingTop: largeTitle.enabled ? 0 : space.s6 },
        ]}
      >
        <View style={{ width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' }}>
          <LargeTitle largeTitle={largeTitle} />
          <ListGroup header="Account">
            <ListRow
              title={user?.email || 'Signed in'}
              caption={isSyncing ? 'Syncing…' : 'Synced to your account'}
              leading={<Avatar name={user?.email || '?'} seed={user?.id} size={36} />}
              trailing={
                <Icon
                  name={isSyncing ? 'sync-outline' : 'cloud-done-outline'}
                  size={20}
                  color={isSyncing ? tokens.colors.textMuted : tokens.colors.income}
                />
              }
              accessibilityLabel={`${user?.email || 'Signed in'}, ${isSyncing ? 'syncing' : 'synced'}`}
            />
            {/* Sign out is reversible (data stays synced), so it lives with the
                account it acts on and stays neutral; red is reserved for the
                permanent actions in the danger zone. */}
            <ListRow
              title="Sign out"
              icon="log-out-outline"
              onPress={() => setConfirmSignOutVisible(true)}
              showSeparator={false}
            />
          </ListGroup>

          <ListGroup header="Budget">
            <ListRow
              title="Budgets"
              caption={`${activeBudget?.name ? `${activeBudget.name} · ` : ''}${budgetCount} ${budgetCount === 1 ? 'budget' : 'budgets'}`}
              icon="folder-outline"
              chevron
              onPress={() => router.push('/budgets')}
            />
            <ListRow
              title="Categories"
              caption="Add, rename or remove expense categories"
              icon="pricetags-outline"
              chevron
              onPress={() => router.push('/manage-categories')}
              showSeparator={false}
            />
          </ListGroup>

          <ListGroup header="Preferences">
            <ListRow
              title="Currency"
              icon="cash-outline"
              trailing={
                <Text style={[type.body, { color: tokens.colors.textMuted }]}>
                  {displaySymbol(currency.symbol)} {currency.code}
                </Text>
              }
              chevron
              onPress={() => router.push('/currency')}
              accessibilityLabel={`Currency, ${currency.name}`}
            />
            <View
              style={{
                flexDirection: breakpoint.isCompact ? 'column' : 'row',
                alignItems: breakpoint.isCompact ? 'stretch' : 'center',
                gap: space.s3,
                paddingHorizontal: space.s4,
                paddingVertical: space.s3,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: breakpoint.isCompact ? undefined : 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: tokens.colors.surfaceSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: space.s3,
                  }}
                >
                  <Icon name="contrast-outline" size={18} color={tokens.colors.textMuted} />
                </View>
                <Text style={[type.bodyMed, { color: tokens.colors.text }]}>Appearance</Text>
              </View>
              <SegmentedControl<ThemeMode>
                label="Appearance"
                value={themeMode as ThemeMode}
                onChange={setThemeMode}
                style={breakpoint.isCompact ? undefined : { width: 280 }}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </View>
          </ListGroup>

          {reminders.supported ? (
            <ListGroup
              header="Reminders"
              footer="A notification one period before an expense with an end date finishes (a month for a monthly expense, a week for a weekly one), and another on the day. Set per device."
            >
              <SwitchRow
                icon="notifications-outline"
                title="Expenses about to end"
                caption={reminders.enabled ? 'On, at 9:00 am' : 'Off'}
                value={reminders.enabled}
                onChange={handleRemindersChange}
                disabled={!reminders.loaded}
                showSeparator={reminders.permission === 'denied' && !reminders.enabled}
              />
              {reminders.permission === 'denied' && !reminders.enabled ? (
                <ListRow
                  title="Notifications are off in iOS"
                  caption="Open Settings to allow them for Budget Flow"
                  icon="settings-outline"
                  chevron
                  onPress={() => Linking.openSettings()}
                  showSeparator={false}
                />
              ) : null}
            </ListGroup>
          ) : null}

          <ListGroup header="Feedback">
            <ListRow
              title="Send feedback"
              caption={
                unreadReplies > 0
                  ? `${unreadReplies} new ${unreadReplies === 1 ? 'reply' : 'replies'}`
                  : 'Share an idea or suggestion'
              }
              icon="chatbubble-ellipses-outline"
              iconColor={unreadReplies > 0 ? tokens.colors.brand : undefined}
              trailing={
                unreadReplies > 0 ? (
                  <View style={{ width: 10, height: 10, borderRadius: radius.full, backgroundColor: tokens.colors.brand }} />
                ) : undefined
              }
              chevron
              onPress={() => router.push('/feedback')}
              accessibilityLabel={`Send feedback${unreadReplies > 0 ? `, ${unreadReplies} new ${unreadReplies === 1 ? 'reply' : 'replies'}` : ''}`}
              showSeparator={false}
            />
          </ListGroup>

          <ListGroup header="About">
            <ListRow
              title="Privacy"
              caption="What’s stored and who can see it"
              icon="lock-closed-outline"
              chevron
              onPress={() => router.push('/privacy')}
              showSeparator={false}
            />
          </ListGroup>

          {/* Only admin accounts get this; the server checks it again on every request. */}
          {isAdmin ? (
            <ListGroup header="Admin">
              <ListRow
                title="Admin dashboard"
                caption={needsYou > 0 ? `${needsYou} feedback waiting · Users, budgets and app health` : 'Feedback, users, budgets and app health'}
                captionLines={2}
                icon="shield-checkmark-outline"
                chevron
                onPress={() => router.push('/admin')}
                showSeparator={false}
              />
            </ListGroup>
          ) : null}

          {/* Irreversible actions sit apart at the bottom, after an extra gap,
              so they're never mistaken for everyday controls. */}
          <ListGroup
            header="Danger zone"
            footer="These actions are permanent and can’t be undone."
            style={{ marginTop: space.s4 }}
          >
            <ListRow
              title="Erase all data"
              caption="Removes all budgets, people and expenses; keeps your account"
              captionLines={2}
              icon="trash-outline"
              destructive
              onPress={handleClearAllData}
            />
            <ListRow
              title="Delete account"
              caption="Removes your account and everything in it"
              captionLines={2}
              icon="person-remove-outline"
              destructive
              onPress={() => setConfirmDeleteVisible(true)}
              showSeparator={false}
            />
          </ListGroup>

          <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'center', marginTop: space.s2 }]}>
            Budget Flow {appVersionLabel}
          </Text>
        </View>
      </Animated.ScrollView>

      <ConfirmDialog
        visible={confirmSignOutVisible}
        title="Sign out?"
        message="Local data on this device will be cleared. Your budgets stay safely synced to your account."
        confirmLabel="Sign out"
        destructive
        loading={signingOut}
        onConfirm={async () => {
          setSigningOut(true);
          try {
            await signOut();
            showToast('Signed out', 'success');
          } finally {
            setSigningOut(false);
            setConfirmSignOutVisible(false);
          }
        }}
        onCancel={() => setConfirmSignOutVisible(false)}
      />

      <ConfirmDialog
        visible={confirmDeleteVisible}
        title="Delete account?"
        message={`This permanently deletes ${user?.email || 'your account'} and every budget, person and expense in it. Budgets you share stay with the people you share them with. It cannot be undone.`}
        confirmLabel="Delete account"
        destructive
        loading={deletingAccount}
        onConfirm={async () => {
          setDeletingAccount(true);
          try {
            // Signs out; AuthGuard then shows the "Account deleted" screen.
            await deleteAccount();
            setConfirmDeleteVisible(false);
          } catch (error) {
            console.error('Settings: Delete account error:', error);
            showToast('Couldn’t delete account. Please try again.', 'error');
          } finally {
            setDeletingAccount(false);
          }
        }}
        onCancel={() => setConfirmDeleteVisible(false)}
      />
    </View>
  );
}
