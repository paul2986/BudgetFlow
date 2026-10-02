import { useCallback, useState } from 'react';
import { View, ScrollView, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import StandardHeader from '../components/StandardHeader';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { useBudgetData } from '../hooks/useBudgetData';
import { useAuth } from '../hooks/useAuth';
import { Avatar, ConfirmDialog, EmptyState, IconButton, ListGroup, ListRow, Skeleton } from '../components/ui';
import {
  BudgetInvite,
  BudgetMember,
  createInvite,
  getBudgetMembers,
  getOpenInvites,
  inviteLink,
  removeMember,
  revokeInvite,
} from '../utils/sharing';
import { radius, space } from '../styles/tokens';

const formatExpiry = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// Hand an invite link to the system share sheet, or copy it where there isn't one.
const sendLink = async (url: string, budgetName: string): Promise<'shared' | 'copied' | 'cancelled'> => {
  const message = `Join my budget “${budgetName}” in Budget Flow: ${url}`;
  if (Platform.OS !== 'web') {
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: `Join “${budgetName}”`, text: message });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  await Clipboard.setStringAsync(url);
  return 'copied';
};

/**
 * Who shares a budget, and how to invite or remove people. The owner invites
 * with single-use links and can remove anyone; editors can see who's here and
 * leave.
 */
export default function ShareBudgetScreen() {
  const { themedStyles, breakpoint } = useThemedStyles();
  const { tokens } = useTheme();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { appData, sharing, leaveBudget, refreshData } = useBudgetData();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();

  const budget = appData.budgets.find((b) => b.id === budgetId);
  const access = budgetId ? sharing[budgetId] : undefined;
  const isOwner = access?.role === 'owner';

  const [members, setMembers] = useState<BudgetMember[] | null>(null);
  const [invites, setInvites] = useState<BudgetInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<BudgetMember | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = useCallback(async () => {
    if (!budgetId || !access) return;
    try {
      const [m, i] = await Promise.all([getBudgetMembers(budgetId), isOwner ? getOpenInvites(budgetId) : Promise.resolve([])]);
      setMembers(m);
      setInvites(i);
    } catch (e) {
      console.error('ShareBudget: load failed', e);
      showToast('Couldn’t load who shares this budget. Check your connection.', 'error');
    }
  }, [budgetId, access, isOwner, showToast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/budgets'));

  const handleInvite = async () => {
    if (!budgetId || !user || !budget) return;
    setBusy(true);
    try {
      const invite = await createInvite(budgetId, user.id);
      setInvites((list) => [...list, invite]);
      const outcome = await sendLink(inviteLink(invite.token), budget.name);
      if (outcome === 'copied') showToast('Invite link copied', 'success');
    } catch (e) {
      console.error('ShareBudget: invite failed', e);
      showToast('Couldn’t create an invite link. Check your connection.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (invite: BudgetInvite) => {
    await Clipboard.setStringAsync(inviteLink(invite.token));
    showToast('Invite link copied', 'success');
  };

  const handleRevoke = async (invite: BudgetInvite) => {
    setBusy(true);
    try {
      await revokeInvite(invite.token);
      setInvites((list) => list.filter((i) => i.token !== invite.token));
      showToast('Invite link turned off', 'success');
    } catch (e) {
      console.error('ShareBudget: revoke failed', e);
      showToast('Couldn’t turn off that link. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!removing || !budgetId) return;
    setBusy(true);
    try {
      await removeMember(budgetId, removing.userId);
      setMembers((list) => list?.filter((m) => m.userId !== removing.userId) || null);
      showToast(`${removing.email} removed`, 'success');
      refreshData(true, true);
    } catch (e) {
      console.error('ShareBudget: remove failed', e);
      showToast('Couldn’t remove them. Try again.', 'error');
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  const handleLeave = async () => {
    if (!budgetId) return;
    setBusy(true);
    const result = await leaveBudget(budgetId);
    setBusy(false);
    setConfirmLeave(false);
    if (result.success) {
      showToast(`You left “${budget?.name}”`, 'success');
      router.navigate('/budgets');
    } else {
      showToast(result.error?.message || 'Couldn’t leave the budget. Try again.', 'error');
    }
  };

  const body = () => {
    if (!budget) {
      return (
        <ListGroup>
          <EmptyState icon="folder-open-outline" title="Budget not found" caption="It may have been deleted, or you no longer share it." />
        </ListGroup>
      );
    }
    if (!access) {
      return (
        <ListGroup>
          <EmptyState
            icon="cloud-offline-outline"
            title="Not synced yet"
            caption="You can share this budget once it has synced. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => refreshData(true, true)}
          />
        </ListGroup>
      );
    }
    if (!members) {
      return (
        <View style={{ gap: space.s3 }}>
          <Skeleton height={120} borderRadius={radius.lg} />
          <Skeleton height={64} borderRadius={radius.lg} />
        </View>
      );
    }
    return (
      <View style={{ gap: space.s6 }}>
        <ListGroup
          header="People"
          footer={isOwner ? 'Everyone here can add, edit and delete people, income and expenses.' : 'Only the owner can invite or remove people.'}
        >
          {members.map((m, i) => {
            const isMe = m.userId === user?.id;
            return (
              <ListRow
                key={m.userId}
                title={isMe ? `${m.email} (you)` : m.email}
                caption={m.role === 'owner' ? 'Owner' : 'Can edit'}
                leading={<Avatar name={m.email} seed={m.userId} size={36} />}
                accessory={
                  isOwner && !isMe ? (
                    <IconButton
                      icon="person-remove-outline"
                      accessibilityLabel={`Remove ${m.email}`}
                      onPress={() => setRemoving(m)}
                      disabled={busy}
                    />
                  ) : undefined
                }
                showSeparator={i < members.length - 1}
              />
            );
          })}
        </ListGroup>

        {isOwner && (
          <ListGroup
            header="Invite"
            footer="Anyone with a link can join this budget and edit it. Each link works once and expires after 7 days."
          >
            <ListRow
              title="Share an invite link"
              icon="link-outline"
              iconColor={tokens.colors.brand}
              onPress={busy ? undefined : handleInvite}
              showSeparator={invites.length > 0}
            />
            {invites.map((invite, i) => (
              <ListRow
                key={invite.token}
                title="Unused invite link"
                caption={`Expires ${formatExpiry(invite.expiresAt)}`}
                icon="mail-outline"
                accessory={
                  <View style={{ flexDirection: 'row' }}>
                    <IconButton icon="copy-outline" accessibilityLabel="Copy invite link" onPress={() => handleCopy(invite)} disabled={busy} />
                    <IconButton icon="close-circle-outline" accessibilityLabel="Turn off invite link" onPress={() => handleRevoke(invite)} disabled={busy} />
                  </View>
                }
                showSeparator={i < invites.length - 1}
              />
            ))}
          </ListGroup>
        )}

        {!isOwner && (
          <ListGroup footer="The budget stays with everyone else. You’d need a new invite to rejoin.">
            <ListRow title="Leave budget" icon="exit-outline" destructive onPress={busy ? undefined : () => setConfirmLeave(true)} />
          </ListGroup>
        )}
      </View>
    );
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader title={budget ? `Share “${budget.name}”` : 'Share budget'} onLeftPress={goBack} showRightIcon={false} loading={busy} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
      >
        <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>{body()}</View>
      </ScrollView>

      <ConfirmDialog
        visible={!!removing}
        title={`Remove ${removing?.email}?`}
        message="They’ll lose access to this budget on all their devices. You can invite them again later."
        confirmLabel="Remove"
        destructive
        loading={busy}
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
      <ConfirmDialog
        visible={confirmLeave}
        title={`Leave “${budget?.name}”?`}
        message="It will be removed from your devices. Everyone else keeps it."
        confirmLabel="Leave"
        destructive
        loading={busy}
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </View>
  );
}
