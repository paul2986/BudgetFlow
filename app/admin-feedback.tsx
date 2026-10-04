import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useBudgetData } from '../hooks/useBudgetData';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useToast } from '../hooks/useToast';
import StandardHeader from '../components/StandardHeader';
import FeedbackStatusChip from '../components/FeedbackStatusChip';
import { ChoicePills, EmptyState, ListGroup, ListRow, Skeleton } from '../components/ui';
import {
  AdminFeedback,
  AdminFeedbackCounts,
  fetchAdminFeedback,
  fetchAdminFeedbackCounts,
} from '../utils/feedback';
import { FEEDBACK_STATUSES, FeedbackStatus, previewText, relativeTime, statusLabel } from '../utils/feedbackFormat';
import { radius, space } from '../styles/tokens';

/**
 * The feedback inbox, opened from the Admin dashboard for admin accounts. Reads
 * through `admin_feedback_*`, which check admin on every call: this screen only
 * keeps everyone else from landing on an error. A sender's email appears only
 * when they chose to share it.
 */

const MAX_WIDTH = 680;

type Filter = 'needs_you' | FeedbackStatus | 'all';

const filterArgs = (filter: Filter): { status?: FeedbackStatus; needsYou?: boolean } =>
  filter === 'needs_you' ? { needsYou: true } : filter === 'all' ? {} : { status: filter };

const emptyCopy: Record<Filter, { title: string; caption: string; icon: string }> = {
  needs_you: { title: 'You’re all caught up', caption: 'Nothing is waiting for a reply or a decision.', icon: 'checkmark-done-outline' },
  all: { title: 'No feedback yet', caption: 'Ideas people send from Settings show up here.', icon: 'chatbubbles-outline' },
  new: { title: 'Nothing new', caption: 'Nothing is filed as new.', icon: 'sparkles-outline' },
  backlog: { title: 'Backlog is empty', caption: 'Nothing is saved for later.', icon: 'bookmark-outline' },
  planned: { title: 'Nothing planned', caption: 'Nothing is marked as planned.', icon: 'calendar-outline' },
  done: { title: 'Nothing done yet', caption: 'Finished items show up here.', icon: 'checkmark-circle-outline' },
  rejected: { title: 'Nothing rejected', caption: 'Items you decide against show up here.', icon: 'close-circle-outline' },
};

export default function AdminFeedbackScreen() {
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { user } = useBudgetData();
  const { isAdmin, checked } = useIsAdmin(user?.id);
  const { showToast } = useToast();

  const [filter, setFilter] = useState<Filter>('needs_you');
  const [items, setItems] = useState<AdminFeedback[] | null>(null);
  const [counts, setCounts] = useState<AdminFeedbackCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/admin'));

  const load = useCallback(
    async (which: Filter) => {
      setLoading(true);
      try {
        const [list, tally] = await Promise.all([fetchAdminFeedback(filterArgs(which)), fetchAdminFeedbackCounts()]);
        setItems(list);
        setCounts(tally);
        setFailed(false);
      } catch (error) {
        console.error('AdminFeedback: Load error:', error);
        setFailed(true);
        showToast('Couldn’t load the feedback. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  // Tabs stay mounted, so reload (and re-check access) each time the screen is shown.
  useFocusEffect(
    useCallback(() => {
      if (!checked) return;
      if (!isAdmin) {
        router.replace('/settings');
        return;
      }
      load(filter);
    }, [checked, isAdmin, load, filter])
  );

  if (checked && !isAdmin) return <View style={themedStyles.container} />;

  const choose = (next: Filter) => {
    setFilter(next);
    setItems(null);
  };

  const countOf = (key: Filter): number | undefined => (!counts ? undefined : key === 'all' ? counts.total : counts[key]);
  const pill = (value: Filter, label: string) => {
    const n = countOf(value);
    return { value, label: n === undefined ? label : `${label} · ${n}` };
  };
  const options = [
    pill('needs_you', 'Needs you'),
    ...FEEDBACK_STATUSES.map((status) => pill(status, statusLabel(status, 'admin'))),
    pill('all', 'All'),
  ];

  const renderList = () => {
    if (!items) {
      if (failed) {
        return (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load the feedback"
            caption="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => load(filter)}
          />
        );
      }
      return (
        <View accessible accessibilityLabel="Loading" style={{ gap: space.s3 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={72} borderRadius={radius.lg} />
          ))}
        </View>
      );
    }
    if (items.length === 0) {
      const copy = emptyCopy[filter];
      return <EmptyState icon={copy.icon} title={copy.title} caption={copy.caption} />;
    }
    return (
      <ListGroup style={{ marginBottom: 0 }}>
        {items.map((item, i) => {
          const caption = [
            item.needs_you ? 'Waiting for you' : null,
            item.sender_email ?? 'Email not shared',
            relativeTime(item.last_activity_at),
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <ListRow
              key={item.id}
              title={previewText(item.body, 80)}
              caption={caption}
              captionLines={2}
              icon={item.needs_you ? 'mail-unread-outline' : 'mail-open-outline'}
              iconColor={item.needs_you ? tokens.colors.brand : undefined}
              chevron
              onPress={() => router.push({ pathname: '/admin-feedback-thread', params: { id: item.id } })}
              accessibilityLabel={`${previewText(item.body, 80)}. ${statusLabel(item.status, 'admin')}. ${caption}`}
              showSeparator={i < items.length - 1}
            >
              {/* Under the text, not beside it: the idea is what the row is about, so it gets the width. */}
              <FeedbackStatusChip status={item.status} audience="admin" style={{ marginTop: space.s2 }} />
            </ListRow>
          );
        })}
      </ListGroup>
    );
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Feedback"
        onLeftPress={goBack}
        rightButtons={[{ icon: 'refresh-outline', onPress: () => load(filter), accessibilityLabel: 'Refresh' }]}
        loading={loading}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
        refreshControl={
          <RefreshControl refreshing={loading && !!items} onRefresh={() => load(filter)} tintColor={tokens.colors.textMuted} />
        }
      >
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
          <ChoicePills<Filter>
            label="Show"
            showLabel={false}
            options={options}
            value={filter}
            onChange={choose}
            style={{ marginBottom: space.s5 }}
          />
          {renderList()}
        </View>
      </ScrollView>
    </View>
  );
}
