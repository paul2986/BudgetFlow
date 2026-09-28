import { useToast } from '../hooks/useToast';
import { View, ScrollView } from 'react-native';
import { Alert } from '../utils/alert';
import { useBudgetData } from '../hooks/useBudgetData';
import { router, useFocusEffect } from 'expo-router';
import StandardHeader from '../components/StandardHeader';
import { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { Budget } from '../types/budget';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from '../components/Icon';
import { EmptyState, IconButton, Input, ListGroup, ListRow, Sheet } from '../components/ui';
import { space } from '../styles/tokens';

const formatDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
};

export default function BudgetsScreen() {
  const { appData, activeBudget, addBudget, renameBudget, deleteBudget, duplicateBudget, setActiveBudget, refreshData } = useBudgetData();
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { showToast } = useToast();

  const [newBudgetName, setNewBudgetName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [actionBudgetId, setActionBudgetId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState(false);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('BudgetsScreen: Screen focused, refreshing data');
      refreshData(true);
    }, [refreshData])
  );

  const budgets = useMemo(() => {
    return appData.budgets || [];
  }, [appData.budgets]);

  const handleCreateBudget = useCallback(async () => {
    if (!newBudgetName.trim()) {
      showToast('Please enter a budget name', 'error');
      return;
    }

    setIsCreating(true);
    try {
      const result = await addBudget(newBudgetName.trim());
      if (result.success) {
        showToast('Budget created successfully', 'success');
        setNewBudgetName('');
        setShowCreateModal(false);
      } else {
        showToast(result.error?.message || 'Failed to create budget', 'error');
      }
    } catch (error) {
      console.error('Error creating budget:', error);
      showToast('Failed to create budget', 'error');
    } finally {
      setIsCreating(false);
    }
  }, [newBudgetName, addBudget, showToast]);

  const handleRenameBudget = useCallback(async (budgetId: string) => {
    if (!editingName.trim()) {
      showToast('Please enter a budget name', 'error');
      return;
    }

    setOperationInProgress(true);
    try {
      const result = await renameBudget(budgetId, editingName.trim());
      if (result.success) {
        showToast('Budget renamed successfully', 'success');
        setEditingBudgetId(null);
        setEditingName('');
      } else {
        showToast(result.error?.message || 'Failed to rename budget', 'error');
      }
    } catch (error) {
      console.error('Error renaming budget:', error);
      showToast('Failed to rename budget', 'error');
    } finally {
      setOperationInProgress(false);
    }
  }, [editingName, renameBudget, showToast]);

  const handleDeleteBudget = useCallback(async (budgetId: string, budgetName: string) => {
    // Prevent deletion of active budget
    if (activeBudget?.id === budgetId) {
      showToast('Cannot delete the active budget. Please set another budget as active first.', 'error');
      return;
    }

    Alert.alert(
      'Delete Budget',
      `Are you sure you want to delete "${budgetName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setOperationInProgress(true);
                        try {
              const result = await deleteBudget(budgetId);
              if (result.success) {
                showToast('Budget deleted successfully', 'success');
              } else {
                showToast(result.error?.message || 'Failed to delete budget', 'error');
              }
            } catch (error) {
              console.error('Error deleting budget:', error);
              showToast('Failed to delete budget', 'error');
            } finally {
              setOperationInProgress(false);
            }
          },
        },
      ]
    );
  }, [deleteBudget, showToast, activeBudget]);

  const handleDuplicateBudget = useCallback(async (budgetId: string, budgetName: string) => {
    setOperationInProgress(true);
        try {
      const result = await duplicateBudget(budgetId, `${budgetName} (Copy)`);
      if (result.success) {
        showToast('Budget duplicated successfully', 'success');
      } else {
        showToast(result.error?.message || 'Failed to duplicate budget', 'error');
      }
    } catch (error) {
      console.error('Error duplicating budget:', error);
      showToast('Failed to duplicate budget', 'error');
    } finally {
      setOperationInProgress(false);
    }
  }, [duplicateBudget, showToast]);

  const handleSetActiveBudget = useCallback(async (budgetId: string) => {
    setOperationInProgress(true);
        try {
      const result = await setActiveBudget(budgetId);
      if (result.success) {
        console.log('Active budget changed successfully');
      } else {
        showToast(result.error?.message || 'Failed to set active budget', 'error');
      }
    } catch (error) {
      console.error('Error setting active budget:', error);
      showToast('Failed to set active budget', 'error');
    } finally {
      setOperationInProgress(false);
    }
  }, [setActiveBudget, showToast]);

  const closeCreate = () => {
    setShowCreateModal(false);
    setNewBudgetName('');
  };
  const closeRename = () => {
    setEditingBudgetId(null);
    setEditingName('');
  };

  const actionBudget = budgets.find((b) => b.id === actionBudgetId) || null;
  const renamingBudget = budgets.find((b) => b.id === editingBudgetId) || null;

  const describe = (budget: Budget) => {
    const people = budget.people?.length || 0;
    const expenses = budget.expenses?.length || 0;
    return `${people} ${people === 1 ? 'person' : 'people'} · ${expenses} ${expenses === 1 ? 'expense' : 'expenses'} · Edited ${formatDate(budget.modifiedAt)}`;
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Budgets"
        onLeftPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        loading={operationInProgress}
        rightButtons={[{ icon: 'add', onPress: () => setShowCreateModal(true), accessibilityLabel: 'New budget' }]}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          themedStyles.scrollContent,
          { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 },
        ]}
      >
        <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          {budgets.length === 0 ? (
            <ListGroup>
              <EmptyState
                icon="folder-open-outline"
                title="No budgets yet"
                caption="A budget holds the people, income and expenses you track together."
                actionLabel="New budget"
                onAction={() => setShowCreateModal(true)}
              />
            </ListGroup>
          ) : (
            <ListGroup
              header="Your budgets"
              footer="Tap a budget to switch to it. Use ⋯ to rename, duplicate, lock or delete."
            >
              {budgets.map((budget, i) => {
                const isActive = activeBudget?.id === budget.id;
                const locked = !!budget.lock?.locked;
                return (
                  <ListRow
                    key={budget.id}
                    title={budget.name}
                    caption={describe(budget)}
                    icon={locked ? 'lock-closed-outline' : 'folder-outline'}
                    iconColor={isActive ? tokens.colors.brand : undefined}
                    trailing={isActive ? <Icon name="checkmark" size={20} color={tokens.colors.brand} /> : undefined}
                    onPress={isActive || operationInProgress ? undefined : () => handleSetActiveBudget(budget.id)}
                    accessibilityLabel={`${budget.name}${isActive ? ', active budget' : ', switch to this budget'}${locked ? ', locked' : ''}`}
                    accessory={
                      <IconButton
                        icon="ellipsis-horizontal"
                        accessibilityLabel={`More actions for ${budget.name}`}
                        onPress={() => setActionBudgetId(budget.id)}
                        disabled={operationInProgress}
                      />
                    }
                    showSeparator={i < budgets.length - 1}
                  />
                );
              })}
            </ListGroup>
          )}
        </View>
      </ScrollView>

      {/* Per-budget actions */}
      <Sheet
        visible={!!actionBudget}
        onClose={() => setActionBudgetId(null)}
        title={actionBudget?.name || 'Budget'}
        leadingAction={{ label: 'Done', onPress: () => setActionBudgetId(null) }}
        width={420}
        grouped
      >
        {actionBudget ? (
          <ScrollView contentContainerStyle={{ padding: space.s4 }}>
            <ListGroup style={{ marginBottom: space.s4 }}>
              <ListRow
                title="Rename"
                icon="create-outline"
                onPress={() => {
                  setActionBudgetId(null);
                  setEditingBudgetId(actionBudget.id);
                  setEditingName(actionBudget.name);
                }}
              />
              <ListRow
                title="Duplicate"
                icon="copy-outline"
                onPress={() => {
                  setActionBudgetId(null);
                  handleDuplicateBudget(actionBudget.id, actionBudget.name);
                }}
              />
              <ListRow
                title="Budget lock"
                caption={actionBudget.lock?.locked ? 'On' : 'Off'}
                icon="lock-closed-outline"
                chevron
                onPress={() => {
                  setActionBudgetId(null);
                  router.push({ pathname: '/budget-lock', params: { budgetId: actionBudget.id } });
                }}
                showSeparator={false}
              />
            </ListGroup>
            {budgets.length > 1 ? (
              <ListGroup
                style={{ marginBottom: 0 }}
                footer={activeBudget?.id === actionBudget.id ? 'Switch to another budget before deleting this one.' : undefined}
              >
                <ListRow
                  title="Delete budget"
                  icon="trash-outline"
                  destructive
                  onPress={
                    activeBudget?.id === actionBudget.id
                      ? undefined
                      : () => {
                          setActionBudgetId(null);
                          handleDeleteBudget(actionBudget.id, actionBudget.name);
                        }
                  }
                  style={activeBudget?.id === actionBudget.id ? { opacity: 0.45 } : undefined}
                  showSeparator={false}
                />
              </ListGroup>
            ) : null}
          </ScrollView>
        ) : null}
      </Sheet>

      {/* Create */}
      <Sheet
        visible={showCreateModal}
        onClose={closeCreate}
        title="New budget"
        leadingAction={{ label: 'Cancel', onPress: closeCreate, disabled: isCreating }}
        trailingAction={{ label: 'Create', onPress: handleCreateBudget, disabled: !newBudgetName.trim() || isCreating }}
        width={420}
      >
        <View style={{ padding: space.s5 }}>
          <Input
            label="Name"
            value={newBudgetName}
            onChangeText={setNewBudgetName}
            placeholder="e.g. Holiday fund"
            editable={!isCreating}
            autoFocus
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={handleCreateBudget}
          />
        </View>
      </Sheet>

      {/* Rename */}
      <Sheet
        visible={!!renamingBudget}
        onClose={closeRename}
        title="Rename budget"
        leadingAction={{ label: 'Cancel', onPress: closeRename, disabled: operationInProgress }}
        trailingAction={{
          label: 'Save',
          onPress: () => renamingBudget && handleRenameBudget(renamingBudget.id),
          disabled: !editingName.trim() || editingName.trim() === renamingBudget?.name || operationInProgress,
        }}
        width={420}
      >
        <View style={{ padding: space.s5 }}>
          <Input
            label="Name"
            value={editingName}
            onChangeText={setEditingName}
            autoFocus
            selectTextOnFocus
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={() => renamingBudget && handleRenameBudget(renamingBudget.id)}
          />
        </View>
      </Sheet>
    </View>
  );
}
