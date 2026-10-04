import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useBudgetData } from '../hooks/useBudgetData';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useToast } from '../hooks/useToast';
import StandardHeader from '../components/StandardHeader';
import Icon from '../components/Icon';
import { EmptyState, ListGroup, ListRow, Skeleton, StatCard } from '../components/ui';
import { AdminOverview, fetchAdminOverview } from '../utils/admin';
import { AdminFeedbackCounts, fetchAdminFeedbackCounts } from '../utils/feedback';
import { describeFrequencies, formatBytes, formatCount } from '../utils/adminFormat';
import { type, radius, space, tabularNums } from '../styles/tokens';

/**
 * Admin panel, pushed from Settings for admin accounts only. Read-only numbers
 * about the app as a whole, from `admin_overview()`: counts and timestamps,
 * never budget names, people or amounts. The server checks admin on every
 * request; this screen only keeps everyone else from landing on an error.
 */

const MAX_WIDTH = 680;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={{ marginBottom: space.s6 }}>
      <Text
        accessibilityRole="header"
        style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2, marginHorizontal: space.s4 }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A figure that should be zero: a tick beside it when it is, an alert icon when not. */
function CheckedValue({ value }: { value: number }) {
  const { tokens } = useTheme();
  const ok = value === 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
      <Icon
        name={ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
        size={20}
        color={ok ? tokens.colors.income : tokens.colors.danger}
      />
      <Text style={[type.bodyMed, tabularNums, { color: tokens.colors.text }]}>{formatCount(value)}</Text>
    </View>
  );
}

function Value({ children }: { children: string }) {
  const { tokens } = useTheme();
  return <Text style={[type.bodyMed, tabularNums, { color: tokens.colors.text }]}>{children}</Text>;
}

export default function AdminScreen() {
  const { tokens } = useTheme();
  const bp = useBreakpoint();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { user } = useBudgetData();
  const { isAdmin, checked } = useIsAdmin(user?.id);
  const { showToast } = useToast();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  // Only for the inbox row: if it can't load, the row still opens the inbox.
  const [feedbackCounts, setFeedbackCounts] = useState<AdminFeedbackCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/settings'));

  const load = useCallback(async () => {
    setLoading(true);
    fetchAdminFeedbackCounts()
      .then(setFeedbackCounts)
      .catch((error) => console.error('Admin: Load feedback counts error:', error));
    try {
      setOverview(await fetchAdminOverview());
      setFailed(false);
    } catch (error) {
      console.error('Admin: Load overview error:', error);
      setFailed(true);
      showToast('Couldn’t load the numbers. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Tabs stay mounted, so reload (and re-check access) each time the screen is shown.
  useFocusEffect(
    useCallback(() => {
      if (!checked) return;
      if (!isAdmin) {
        router.replace('/settings');
        return;
      }
      load();
    }, [checked, isAdmin, load])
  );

  if (checked && !isAdmin) return <View style={themedStyles.container} />;

  const grid = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.s3 };
  const tile = { flexGrow: 1, flexBasis: (bp.isExpanded ? 200 : '46%') as any, marginBottom: 0 };
  const footnote = [type.caption, { color: tokens.colors.textMuted, marginTop: space.s2, marginHorizontal: space.s4 }];

  const renderBody = () => {
    if (!overview) {
      if (failed) {
        return (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load the numbers"
            caption="Check your connection and try again."
            actionLabel="Try again"
            onAction={load}
          />
        );
      }
      return (
        <View accessible accessibilityLabel="Loading" style={grid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={112} borderRadius={radius.lg} style={{ flexGrow: 1, flexBasis: tile.flexBasis }} />
          ))}
        </View>
      );
    }

    const { users, budgets, content, health } = overview;
    const frequencies = describeFrequencies(content.expenses_by_frequency);
    const updated = new Date(overview.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    return (
      <>
        <Section title="Users">
          <View style={grid}>
            <StatCard
              format="count"
              label="Accounts"
              value={users.total}
              icon="people-outline"
              caption={users.unconfirmed > 0 ? `${formatCount(users.unconfirmed)} not confirmed` : 'All confirmed'}
              style={tile}
            />
            <StatCard
              format="count"
              label="New · 7d"
              value={users.signups_7d}
              icon="person-add-outline"
              caption={`${formatCount(users.signups_30d)} in 30d`}
              style={tile}
            />
            <StatCard
              format="count"
              label="Active · 7d"
              value={users.active_editors_7d}
              icon="create-outline"
              caption={`${formatCount(users.active_editors_30d)} in 30d`}
              style={tile}
            />
          </View>
          <Text style={footnote}>
            Active means edited a budget. Only each budget’s last editor is recorded, so this runs a little low.
          </Text>
        </Section>

        <Section title="Budgets">
          <View style={grid}>
            <StatCard
              format="count"
              label="Budgets"
              value={budgets.total}
              icon="folder-outline"
              caption={`${formatCount(budgets.shared)} shared`}
              style={tile}
            />
            <StatCard
              format="count"
              label="Edited · 7d"
              value={budgets.edited_7d}
              icon="create-outline"
              caption={`${formatCount(budgets.edited_30d)} in 30d`}
              style={tile}
            />
            <StatCard
              format="count"
              label="New · 7d"
              value={budgets.created_7d}
              icon="add-circle-outline"
              caption={`${formatCount(budgets.created_30d)} in 30d`}
              style={tile}
            />
          </View>
          <ListGroup style={{ marginTop: space.s3, marginBottom: 0 }}>
            <ListRow
              title="Dormant budgets"
              caption="Not edited in 30+ days"
              trailing={<Value>{formatCount(budgets.dormant_30d)}</Value>}
            />
            <ListRow
              title="Average members"
              caption="People per budget"
              trailing={<Value>{formatCount(budgets.avg_members)}</Value>}
            />
            <ListRow
              title="Invites"
              caption={`${formatCount(budgets.invites_pending)} pending · ${formatCount(budgets.invites_expired)} expired`}
              trailing={<Value>{`${formatCount(budgets.invites_accepted)} accepted`}</Value>}
              showSeparator={false}
            />
          </ListGroup>
        </Section>

        <Section title="Content">
          <View style={grid}>
            <StatCard
              format="count"
              label="Expenses"
              value={content.expenses}
              icon="receipt-outline"
              caption={`Median ${formatCount(content.median_expenses_per_budget)}/budget`}
              style={tile}
            />
            <StatCard format="count" label="People" value={content.people} icon="person-outline" style={tile} />
          </View>
          <ListGroup style={{ marginTop: space.s3, marginBottom: 0 }}>
            <ListRow
              title="Expenses by frequency"
              caption={frequencies || 'No expenses yet'}
              captionLines={2}
              showSeparator={false}
            />
          </ListGroup>
        </Section>

        <Section title="Health">
          <ListGroup style={{ marginBottom: 0 }}>
            <ListRow
              title="Largest budget"
              caption="Every sync sends the whole budget"
              trailing={<Value>{formatBytes(health.largest_budget_bytes)}</Value>}
            />
            <ListRow
              title="Budgets without an owner"
              caption="Should always be 0"
              trailing={<CheckedValue value={health.budgets_without_owner} />}
              showSeparator={false}
            />
          </ListGroup>
        </Section>

        <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'center' }]}>
          Updated {updated}. Counts only: budget names, people and amounts are never shown here.
        </Text>
      </>
    );
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Admin"
        onLeftPress={goBack}
        rightButtons={[{ icon: 'refresh-outline', onPress: load, accessibilityLabel: 'Refresh' }]}
        loading={loading}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
        refreshControl={
          <RefreshControl refreshing={loading && !!overview} onRefresh={load} tintColor={tokens.colors.textMuted} />
        }
      >
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
          <ListGroup header="Feedback">
            <ListRow
              title="Feedback inbox"
              caption={
                feedbackCounts
                  ? `${formatCount(feedbackCounts.needs_you)} waiting for you · ${formatCount(feedbackCounts.total)} in total`
                  : 'Read and reply to ideas people send'
              }
              icon="chatbubbles-outline"
              iconColor={feedbackCounts && feedbackCounts.needs_you > 0 ? tokens.colors.brand : undefined}
              chevron
              onPress={() => router.push('/admin-feedback')}
              showSeparator={false}
            />
          </ListGroup>
          {renderBody()}
        </View>
      </ScrollView>
    </View>
  );
}
