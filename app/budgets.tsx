
import { useToast } from '../hooks/useToast';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal } from 'react-native';
import { Alert } from '../utils/alert';
import { useBudgetData } from '../hooks/useBudgetData';
import { router, useFocusEffect } from 'expo-router';
import { useBudgetLock } from '../hooks/useBudgetLock';
import StandardHeader from '../components/StandardHeader';
import { useCallback, useMemo, useState, useRef } from 'react';
import Button from '../components/Button';
import { useTheme } from '../hooks/useTheme';
import { Budget } from '../types/budget';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from '../components/Icon';

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function BudgetsScreen() {
  const { appData, activeBudget, addBudget, renameBudget, deleteBudget, duplicateBudget, setActiveBudget, refreshData } = useBudgetData();
  const { currentColors } = useTheme();
  const { themedStyles } = useThemedStyles();
  const { showToast } = useToast();
  const { isLocked } = useBudgetLock();

  const [newBudgetName, setNewBudgetName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [dropdownBudgetId, setDropdownBudgetId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });
  const [operationInProgress, setOperationInProgress] = useState(false);
  const buttonRefs = useRef<{ [key: string]: React.ElementRef<typeof TouchableOpacity> | null }>({});

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
        setDropdownBudgetId(null);
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
            setDropdownBudgetId(null); // Close dropdown immediately
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
    setDropdownBudgetId(null); // Close dropdown immediately
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
    setDropdownBudgetId(null); // Close dropdown immediately
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

  const handleDropdownPress = useCallback((budgetId: string) => {
    const buttonRef = buttonRefs.current[budgetId];
    if (buttonRef) {
      buttonRef.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
        console.log('Button position:', { x, y, width, height, pageX, pageY });
        // Position dropdown to the left of the button and slightly below it
        setDropdownPosition({
          x: pageX - 180 + width, // Align right edge of dropdown with right edge of button
          y: pageY + height + 8, // Position below the button with some spacing
        });
        setDropdownBudgetId(dropdownBudgetId === budgetId ? null : budgetId);
      });
    } else {
      // Fallback positioning if measurement fails
      setDropdownPosition({ x: 200, y: 150 });
      setDropdownBudgetId(dropdownBudgetId === budgetId ? null : budgetId);
    }
  }, [dropdownBudgetId]);

  const DropdownMenu = ({ budget }: { budget: Budget }) => {
    const isActive = activeBudget?.id === budget.id;

    return (
      <Modal
        visible={dropdownBudgetId === budget.id}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownBudgetId(null)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
          }}
          activeOpacity={1}
          onPress={() => {
            console.log('Modal background pressed, closing dropdown');
            setDropdownBudgetId(null);
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: dropdownPosition.x,
              top: dropdownPosition.y,
              minWidth: 180,
              backgroundColor: currentColors.backgroundAlt,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: currentColors.border,
              shadowColor: currentColors.text,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
              paddingVertical: 8,
              zIndex: 1000,
            }}
          >
            {!isActive && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
                onPress={() => {
                  console.log('Set as Active pressed for budget:', budget.id);
                  handleSetActiveBudget(budget.id);
                }}
                activeOpacity={0.7}
              >
                <Icon name="checkmark-circle" size={18} color={currentColors.success} />
                <Text style={[themedStyles.text, { marginLeft: 12, fontSize: 15 }]}>Set as Active</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
              onPress={() => {
                console.log('Rename pressed for budget:', budget.id);
                setEditingBudgetId(budget.id);
                setEditingName(budget.name);
                setDropdownBudgetId(null);
              }}
              activeOpacity={0.7}
            >
              <Icon name="create" size={18} color={currentColors.text} />
              <Text style={[themedStyles.text, { marginLeft: 12, fontSize: 15 }]}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
              onPress={() => {
                console.log('Duplicate pressed for budget:', budget.id);
                handleDuplicateBudget(budget.id, budget.name);
              }}
              activeOpacity={0.7}
            >
              <Icon name="copy" size={18} color={currentColors.text} />
              <Text style={[themedStyles.text, { marginLeft: 12, fontSize: 15 }]}>Duplicate</Text>
            </TouchableOpacity>

            {budgets.length > 1 && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  opacity: isActive ? 0.5 : 1,
                }}
                onPress={() => {
                  console.log('Delete pressed for budget:', budget.id);
                  if (!isActive) {
                    handleDeleteBudget(budget.id, budget.name);
                  }
                }}
                disabled={isActive}
                activeOpacity={0.7}
              >
                <Icon name="trash" size={18} color={isActive ? currentColors.textSecondary : currentColors.error} />
                <Text style={[themedStyles.text, {
                  marginLeft: 12,
                  fontSize: 15,
                  color: isActive ? currentColors.textSecondary : currentColors.error
                }]}>
                  {isActive ? 'Cannot Delete Active' : 'Delete'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Budgets"
        showLeftIcon={false}
        showRightIcon={true}
        rightIcon="add"
        onRightPress={() => setShowCreateModal(true)}
      />

      {operationInProgress && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <View style={{
            backgroundColor: currentColors.backgroundAlt,
            padding: 24,
            borderRadius: 16,
            alignItems: 'center',
            minWidth: 150,
          }}>
            <ActivityIndicator size="large" color={currentColors.primary} />
            <Text style={[themedStyles.text, { marginTop: 16, fontSize: 16 }]}>
              Processing...
            </Text>
          </View>
        </View>
      )}

      <ScrollView style={themedStyles.content} contentContainerStyle={themedStyles.scrollContent}>
        {/* Individual Budget Cards */}
        {budgets.length > 0 && budgets.map((budget) => {
          const isActive = activeBudget?.id === budget.id;
          const isEditing = editingBudgetId === budget.id;

          return (
            <View
              key={budget.id}
              style={[
                themedStyles.card,
                {
                  position: 'relative',
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? currentColors.success : currentColors.border,
                  backgroundColor: isActive ? currentColors.success + '08' : currentColors.backgroundAlt,
                  boxShadow: isActive ? '0px 4px 12px rgba(34, 197, 94, 0.15)' : '0px 2px 4px rgba(0,0,0,0.05)',
                }
              ]}
            >
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <View style={{ flex: 1 }}>
                  {isEditing ? (
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TextInput
                        style={[themedStyles.input, { flex: 1, marginBottom: 0 }]}
                        value={editingName}
                        onChangeText={setEditingName}
                        autoFocus
                        selectTextOnFocus
                      />
                      <TouchableOpacity
                        onPress={() => handleRenameBudget(budget.id)}
                        style={{ padding: 8 }}
                      >
                        <Icon name="checkmark" size={20} color={currentColors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingBudgetId(null);
                          setEditingName('');
                        }}
                        style={{ padding: 8 }}
                      >
                        <Icon name="close" size={20} color={currentColors.error} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => !isActive && handleSetActiveBudget(budget.id)}
                      style={{ flex: 1 }}
                      disabled={operationInProgress}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={[
                          themedStyles.text,
                          {
                            fontWeight: isActive ? '700' : '600',
                            flex: 1,
                            fontSize: 18,
                            color: isActive ? currentColors.success : currentColors.text
                          }
                        ]}>
                          {budget.name}
                        </Text>
                        {isActive && (
                          <View style={[
                            {
                              backgroundColor: currentColors.success,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                            }
                          ]}>
                            <Icon name="checkmark-circle" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={[
                              {
                                color: '#FFFFFF',
                                fontSize: 12,
                                fontWeight: '700'
                              }
                            ]}>
                              Active
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: 'column', gap: 4 }}>
                        <View style={{ flexDirection: 'row', gap: 20 }}>
                          <Text style={[themedStyles.textSecondary, { fontSize: 14 }]}>
                            {budget.people?.length || 0} people
                          </Text>
                          <Text style={[themedStyles.textSecondary, { fontSize: 14 }]}>
                            {budget.expenses?.length || 0} expenses
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 20 }}>
                          <Text style={[themedStyles.textSecondary, { fontSize: 13 }]}>
                            Created: {formatDate(budget.createdAt)}
                          </Text>
                          <Text style={[themedStyles.textSecondary, { fontSize: 13 }]}>
                            Modified: {formatDate(budget.modifiedAt)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>

                {!isEditing && (
                  <TouchableOpacity
                    ref={(ref) => {
                      buttonRefs.current[budget.id] = ref;
                    }}
                    onPress={() => handleDropdownPress(budget.id)}
                    style={{
                      padding: 8,
                      marginLeft: 12,
                      borderRadius: 8,
                      backgroundColor: currentColors.background + '80'
                    }}
                    activeOpacity={0.7}
                    disabled={operationInProgress}
                  >
                    <Icon name="ellipsis-vertical" size={20} color={currentColors.text} />
                  </TouchableOpacity>
                )}
              </View>

              <DropdownMenu budget={budget} />
            </View>
          );
        })}

        {budgets.length === 0 && (
          <View style={[themedStyles.card, themedStyles.centerContent, { paddingVertical: 60 }]}>
            <Icon name="folder" size={64} color={currentColors.textSecondary} />
            <Text style={[themedStyles.text, { marginTop: 20, textAlign: 'center', fontSize: 18, fontWeight: '600' }]}>
              No budgets yet
            </Text>
            <Text style={[themedStyles.textSecondary, { textAlign: 'center', marginTop: 8, fontSize: 15 }]}>
              Tap the + button to create your first budget
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Create Budget Modal */}
      {showCreateModal && (
        <Modal
          visible={showCreateModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowCreateModal(false);
            setNewBudgetName('');
          }}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: currentColors.backgroundAlt,
              borderRadius: 16,
              padding: 24,
              margin: 20,
              width: '90%',
              maxWidth: 400,
              borderWidth: 1,
              borderColor: currentColors.border,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={[themedStyles.subtitle, { marginBottom: 0, fontSize: 20 }]}>Create New Budget</Text>
                <TouchableOpacity onPress={() => {
                  setShowCreateModal(false);
                  setNewBudgetName('');
                }}>
                  <Icon name="close" size={24} color={currentColors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>
                Budget Name:
              </Text>

              <TextInput
                style={themedStyles.input}
                placeholder="Enter budget name"
                placeholderTextColor={currentColors.textSecondary}
                value={newBudgetName}
                onChangeText={setNewBudgetName}
                editable={!isCreating}
                autoFocus
              />

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    text="Cancel"
                    onPress={() => {
                      setShowCreateModal(false);
                      setNewBudgetName('');
                    }}
                    disabled={isCreating}
                    variant="outline"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    text={isCreating ? 'Creating...' : 'Create'}
                    onPress={handleCreateBudget}
                    disabled={!newBudgetName.trim() || isCreating}
                    variant="primary"
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
