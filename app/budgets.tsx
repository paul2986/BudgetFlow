import { useToast } from '../hooks/useToast';
import { LAYOUT } from '../hooks/useBreakpoint';
import { View, ScrollView, TextInput, StyleSheet } from 'react-native';
import { Alert } from '../utils/alert';
import { useBudgetData } from '../hooks/useBudgetData';
import { router, useFocusEffect } from 'expo-router';
import StandardHeader from '../components/StandardHeader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { useBudgetLock } from '../hooks/useBudgetLock';
import { hasLock } from '../utils/budgetLock';
import { Budget } from '../types/budget';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from '../components/Icon';
import Button from '../components/Button';
import { EmptyState, FormScreen, IconButton, Input, ListGroup, ListRow, Menu, Sheet, useFormInsets, type MenuAnchor, type MenuSection } from '../components/ui';
import { space } from '../styles/tokens';
import { buildBudgetWorkbook, fractionDigitsFor, workbookFileName } from '../utils/budgetWorkbook/export';
import { saveWorkbook } from '../utils/fileTransfer';

const formatDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
};

export default function BudgetsScreen() {
  const { appData, activeBudget, sharing, addBudget, renameBudget, deleteBudget, leaveBudget, duplicateBudget, setActiveBudget, refreshData } = useBudgetData();
  const { tokens } = useTheme();
  const { currency } = useCurrency();
  const { themedStyles, breakpoint } = useThemedStyles();
  const formInsets = useFormInsets();
  const { showToast } = useToast();
  const { isLocked } = useBudgetLock();

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

    const others = (sharing[budgetId]?.memberCount || 1) - 1;
    Alert.alert(
      'Delete Budget',
      others > 0
        ? `"${budgetName}" is shared with ${others === 1 ? '1 other person' : `${others} other people`}. Deleting it removes it for everyone. This action cannot be undone.`
        : `Are you sure you want to delete "${budgetName}"? This action cannot be undone.`,
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
  }, [deleteBudget, showToast, activeBudget, sharing]);

  const handleLeaveBudget = useCallback((budgetId: string, budgetName: string) => {
    Alert.alert(
      'Leave Budget',
      `Leave "${budgetName}"? It will be removed from your devices. Everyone else keeps it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setOperationInProgress(true);
            try {
              const result = await leaveBudget(budgetId);
              if (result.success) showToast(`You left "${budgetName}"`, 'success');
              else showToast(result.error?.message || 'Failed to leave budget', 'error');
            } finally {
              setOperationInProgress(false);
            }
          },
        },
      ]
    );
  }, [leaveBudget, showToast]);

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

  // Build and hand over the file with no waiting in between: browsers only allow the
  // share sheet straight after a tap.
  const handleExportBudget = useCallback(async (budget: Budget) => {
    try {
      const now = new Date();
      const bytes = buildBudgetWorkbook(budget, {
        currencyCode: currency.code,
        currencySymbol: currency.symbol,
        fractionDigits: fractionDigitsFor(currency.code),
        now,
      });
      const outcome = await saveWorkbook(workbookFileName(budget.name, now), bytes);
      if (outcome === 'downloaded') showToast(`Exported “${budget.name}”`, 'success');
    } catch (error) {
      console.error('Error exporting budget:', error);
      showToast('Couldn’t export the budget. Please try again.', 'error');
    }
  }, [currency, showToast]);

  const handleSetActiveBudget = useCallback(async (budgetId: string) => {
    setOperationInProgress(true);
        try {
      const result = await setActiveBudget(budgetId);
      if (!result.success) {
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
    const access = sharing[budget.id];
    // A locked budget opens only after its code; exporting or copying it from the list would skip that.
    const closed = isLocked(budget);
    const run = (fn: () => void) => () => {
      setActionBudgetId(null);
      fn();
    };
    const sections: MenuSection[] = [
      {
        items: [
          {
            key: 'share',
            label: 'Share',
            detail: access && access.memberCount > 1 ? `${access.memberCount} people` : undefined,
            icon: 'people-outline',
            onPress: run(() => router.push({ pathname: '/share-budget', params: { budgetId: budget.id } })),
          },
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
            detail: closed ? 'Unlock it first' : undefined,
            icon: 'copy-outline',
            disabled: closed,
            onPress: run(() => handleDuplicateBudget(budget.id, budget.name)),
          },
          {
            key: 'export',
            label: 'Export to Excel',
            detail: closed ? 'Unlock it first' : undefined,
            icon: 'download-outline',
            disabled: closed,
            onPress: run(() => handleExportBudget(budget)),
          },
          {
            key: 'lock',
            label: 'Budget lock',
            detail: hasLock(budget) ? 'On' : 'Off',
            icon: 'lock-closed-outline',
            onPress: run(() => router.push({ pathname: '/budget-lock', params: { budgetId: budget.id } })),
          },
        ],
      },
    ];
    if (access?.role === 'editor') {
      sections.push({
        items: [
          {
            key: 'leave',
            label: 'Leave budget',
            icon: 'exit-outline',
            destructive: true,
            onPress: run(() => handleLeaveBudget(budget.id, budget.name)),
          },
        ],
      });
    } else if (budgets.length > 1) {
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

  const isShared = (budget: Budget) => (sharing[budget.id]?.memberCount || 1) > 1;

  const describe = (budget: Budget) => {
    const people = budget.people?.length || 0;
    const expenses = budget.expenses?.length || 0;
    return `${isShared(budget) ? 'Shared · ' : ''}${people} ${people === 1 ? 'person' : 'people'} · ${expenses} ${expenses === 1 ? 'expense' : 'expenses'} · Edited ${formatDate(budget.modifiedAt)}`;
  };

  return (
    <View style={themedStyles.formContainer}>
      <FormScreen>
        <StandardHeader
          title="Budgets"
          onLeftPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          loading={operationInProgress}
          rightButtons={[{ icon: 'add', onPress: () => setShowCreateModal(true), accessibilityLabel: 'New budget' }]}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={
            breakpoint.isCompact
              ? [themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]
              : formInsets
          }
        >
          <View style={{ width: '100%', maxWidth: LAYOUT.listMaxWidth, alignSelf: 'center' }}>
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
                footer="Tap a budget to switch to it. Use ⋯ to share, rename, duplicate, export, lock or delete."
              >
                {budgets.map((budget, i) => {
                  const isActive = activeBudget?.id === budget.id;
                  const locked = hasLock(budget);
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
                      icon={locked ? 'lock-closed-outline' : isShared(budget) ? 'people-outline' : 'folder-outline'}
                      iconColor={isActive ? tokens.colors.brand : undefined}
                      trailing={isActive ? <Icon name="checkmark" size={20} color={tokens.colors.brand} /> : undefined}
                      onPress={isActive || operationInProgress || dimmed ? undefined : () => handleSetActiveBudget(budget.id)}
                      accessibilityLabel={`${budget.name}${isActive ? ', active budget' : ', switch to this budget'}${isShared(budget) ? ', shared' : ''}${locked ? ', locked' : ''}`}
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

            <ListGroup
              header="Spreadsheets"
              footer="Importing always adds a new budget. It never changes an existing one."
            >
              <ListRow
                title="Import a workbook"
                caption="From a Budget Flow export or template, in Excel format"
                captionLines={2}
                icon="document-outline"
                chevron
                onPress={operationInProgress ? undefined : () => router.push('/import-budget')}
                showSeparator={false}
              />
            </ListGroup>
          </View>
        </ScrollView>
      </FormScreen>

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
