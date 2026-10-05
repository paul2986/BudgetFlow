import { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import StandardHeader from '../../components/StandardHeader';
import Button from '../../components/Button';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useToast } from '../../hooks/useToast';
import { useBudgetData } from '../../hooks/useBudgetData';
import { EmptyState, ListGroup, Skeleton } from '../../components/ui';
import { InvitePreview, acceptInvite, clearPendingInvite, previewInvite } from '../../utils/sharing';
import { radius, space } from '../../styles/tokens';

/** Opened from an invite link: says which budget it's for and joins it. */
export default function InviteScreen() {
  const { themedStyles, breakpoint } = useThemedStyles();
  const { showToast } = useToast();
  const { appData, refreshData, setActiveBudget, user } = useBudgetData();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    // This link is being handled now; don't reopen it after the next sign-in.
    clearPendingInvite(user);
    if (!token) return;
    previewInvite(token)
      .then(setPreview)
      .catch(() => setPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const alreadyMember = !!preview && appData.budgets.some((b) => b.id === preview.budgetId);

  const openBudget = async (budgetId: string) => {
    await refreshData(true, true);
    await setActiveBudget(budgetId);
    router.replace('/');
  };

  const handleJoin = async () => {
    if (!token) return;
    setJoining(true);
    try {
      const budgetId = await acceptInvite(token);
      showToast(`You joined “${preview?.budgetName}”`, 'success');
      await openBudget(budgetId);
    } catch (e) {
      showToast((e as Error).message, 'error');
      setJoining(false);
    }
  };

  const body = () => {
    if (preview === undefined) return <Skeleton height={220} borderRadius={radius.lg} />;
    if (preview === null) {
      return (
        <EmptyState
          icon="link-outline"
          title="This invite link doesn’t work"
          caption="Check you have the whole link, or ask for a new one."
          actionLabel="Go to my budgets"
          onAction={() => router.replace('/')}
        />
      );
    }
    if (alreadyMember) {
      return (
        <EmptyState
          icon="people-outline"
          title={`You’re already in “${preview.budgetName}”`}
          actionLabel="Open budget"
          onAction={() => openBudget(preview.budgetId)}
        />
      );
    }
    if (preview.status !== 'valid') {
      return (
        <EmptyState
          icon="time-outline"
          title={preview.status === 'expired' ? 'This invite has expired' : 'This invite has been used'}
          caption={`Ask whoever shared “${preview.budgetName}” to send you a new link.`}
          actionLabel="Go to my budgets"
          onAction={() => router.replace('/')}
        />
      );
    }
    return (
      <View style={{ padding: space.s5 }}>
        <EmptyState
          icon="people-outline"
          title={`Join “${preview.budgetName}”?`}
          caption="You’ll be able to see and edit its people, income and expenses. Your own budgets stay private."
        />
        <Button text="Join budget" onPress={handleJoin} loading={joining} variant="primary" size="lg" />
        <Button text="Not now" onPress={() => router.replace('/')} disabled={joining} variant="ghost" />
      </View>
    );
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader title="Invitation" onLeftPress={() => router.replace('/')} showRightIcon={false} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
      >
        <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          <ListGroup>{body()}</ListGroup>
        </View>
      </ScrollView>
    </View>
  );
}
