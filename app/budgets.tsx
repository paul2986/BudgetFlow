import { useToast } from '../hooks/useToast';
import { View, ScrollView, TextInput, StyleSheet } from 'react-native';
import { Alert } from '../utils/alert';
import { useBudgetData } from '../hooks/useBudgetData';
import { router, useFocusEffect } from 'expo-router';
import StandardHeader from '../components/StandardHeader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { Budget } from '../types/budget';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from '../components/Icon';
import Button from '../components/Button';
import { EmptyState, IconButton, Input, ListGroup, ListRow, Menu, Sheet, type MenuAnchor, type MenuSection } from '../components/ui';
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
  const [actionAnchor, setActionAnchor] = useState<MenuAnchor | null>(null);
  // Each row's ⋯ button, measured so the actions menu drops from it.
  const moreButtons = useRef<Record<string, View | null>>({});
  const openActions = (budgetId: string) => {
    moreButtons.current[budgetId]?.measureInWindow((x, y, width, height) => {
      setActionAnchor({ x, y, width, height });
      setActionBudgetId(budgetId);
    });
  };
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
  // Focus the rename field once the actions menu has closed; closing it hands
  // focus back to the ⋯ button, which would otherwise win over autoFocus.
  const renameInput = useRef<TextInput>(null);
  useEffect(() => {
    if (!editingBudgetId) return;
    const t = setTimeout(() => renameInput.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [editingBudgetId]);
  // Inline rename: Return or ✓ saves, Escape or ✕ cancels. An unchanged name just closes.
  const commitRename = (budget: Budget) => {
    const next = editingName.trim();
    if (!next || next === budget.name) closeRename();
    else handleRenameBudget(budget.id);
  };

  const actionBudget = budgets.find((b) => b.id === actionBudgetId) || null;

  const budgetActions = (budget: Budget): MenuSection[] => {
    const isActive = activeBudget?.id === budget.id;
    const run = (fn: () => void) => () => {
      setActionBudgetId(null);
      fn();
    };
    const sections: MenuSection[] = [
      {
        items: [
          {
            key: 'rename',
            label: 'Rename',
            icon: 'create-outline',
            onPress: run(() => {
              setEditingBudgetId(budget.id);
              setEditingName(budget.name);
            }),
          },
          {
            key: 'duplicate',
            label: 'Duplicate',
            icon: 'copy-outline',
            onPress: run(() => handleDuplicateBudget(budget.id, budget.name)),
          },
          {
            key: 'lock',
            label: 'Budget lock',
            detail: budget.lock?.locked ? 'On' : 'Off',
            icon: 'lock-closed-outline',
            onPress: run(() => router.push({ pathname: '/budget-lock', params: { budgetId: budget.id } })),
          },
        ],
      },
    ];
    if (budgets.length > 1) {
      sections.push({
        items: [
          {
            key: 'delete',
            label: 'Delete budget',
            detail: isActive ? 'Switch to another budget first' : undefined,
            icon: 'trash-outline',
            destructive: true,
            disabled: isActive,
            onPress: run(() => handleDeleteBudget(budget.id, budget.name)),
          },
        ],
      });
    }
    return sections;
  };

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
                const renaming = editingBudgetId === budget.id;
                if (renaming) {
                  // Rename takes over the row: a labelled field and text actions,
                  // so nothing reads as the active-budget tick. Other rows dim.
                  return (
                    <View
                      key={budget.id}
                      style={{
                        padding: space.s4,
                        borderBottomWidth: i < budgets.length - 1 ? StyleSheet.hairlineWidth : 0,
                        borderBottomColor: tokens.colors.border,
                      }}
                    >
                      <Input
                        ref={renameInput}
                        label="Budget name"
                        value={editingName}
                        onChangeText={setEditingName}
                        selectTextOnFocus
                        maxLength={50}
                        editable={!operationInProgress}
                        returnKeyType="done"
                        onSubmitEditing={() => commitRename(budget)}
                        onKeyPress={(e) => {
                          if (e.nativeEvent.key === 'Escape') closeRename();
                        }}
                      />
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.s2, marginTop: space.s3 }}>
                        <Button
                          text="Cancel"
                          variant="secondary"
                          onPress={closeRename}
                          disabled={operationInProgress}
                          style={{ width: 'auto', marginTop: 0, paddingHorizontal: space.s5 }}
                        />
                        <Button
                          text="Save"
                          onPress={() => commitRename(budget)}
                          disabled={!editingName.trim() || operationInProgress}
                          loading={operationInProgress}
                          style={{ width: 'auto', marginTop: 0, paddingHorizontal: space.s5 }}
                        />
                      </View>
                    </View>
                  );
                }
                const dimmed = !!editingBudgetId;
                return (
                  <ListRow
                    key={budget.id}
                    title={budget.name}
                    caption={describe(budget)}
                    icon={locked ? 'lock-closed-outline' : 'folder-outline'}
                    iconColor={isActive ? tokens.colors.brand : undefined}
                    trailing={isActive ? <Icon name="checkmark" size={20} color={tokens.colors.brand} /> : undefined}
                    onPress={isActive || operationInProgress || dimmed ? undefined : () => handleSetActiveBudget(budget.id)}
                    accessibilityLabel={`${budget.name}${isActive ? ', active budget' : ', switch to this budget'}${locked ? ', locked' : ''}`}
                    accessory={
                      <View ref={(el) => { moreButtons.current[budget.id] = el; }} collapsable={false}>
                        <IconButton
                          icon="ellipsis-horizontal"
                          accessibilityLabel={`More actions for ${budget.name}`}
                          onPress={() => openActions(budget.id)}
                          disabled={operationInProgress || dimmed}
                        />
                      </View>
                    }
                    showSeparator={i < budgets.length - 1}
                    style={dimmed ? { opacity: 0.4 } : undefined}
                  />
                );
              })}
            </ListGroup>
          )}
        </View>
      </ScrollView>

      {/* Per-budget actions */}
      <Menu
        visible={!!actionBudget}
        onClose={() => setActionBudgetId(null)}
        anchor={actionAnchor}
        label={actionBudget ? `Actions for ${actionBudget.name}` : 'Budget actions'}
        sections={actionBudget ? budgetActions(actionBudget) : []}
      />

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

    </View>
  );
}
