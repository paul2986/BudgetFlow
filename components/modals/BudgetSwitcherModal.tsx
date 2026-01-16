
import React, { useCallback, useMemo, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { useBudgetData } from '../../hooks/useBudgetData';
import { useTheme } from '../../hooks/useTheme';
import { useThemedStyles } from '../../hooks/useThemedStyles';
import { useToast } from '../../hooks/useToast';
import Icon from '../Icon';
import Modal from '../Modal';
import Button from '../Button';
import { Budget } from '../../types/budget';

interface BudgetSwitcherModalProps {
    visible: boolean;
    onClose: () => void;
}

const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

export default function BudgetSwitcherModal({ visible, onClose }: BudgetSwitcherModalProps) {
    const { appData, activeBudget, addBudget, renameBudget, deleteBudget, duplicateBudget, setActiveBudget } = useBudgetData();
    const { currentColors } = useTheme();
    const { themedStyles } = useThemedStyles();
    const { showToast } = useToast();

    const [newBudgetName, setNewBudgetName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [operationInProgress, setOperationInProgress] = useState(false);

    const budgets = useMemo(() => appData.budgets || [], [appData.budgets]);

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
            } else {
                showToast(result.error?.message || 'Failed to create budget', 'error');
            }
        } catch (error) {
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
            showToast('Failed to rename budget', 'error');
        } finally {
            setOperationInProgress(false);
        }
    }, [editingName, renameBudget, showToast]);

    const handleSetActiveBudget = useCallback(async (budgetId: string) => {
        setOperationInProgress(true);
        try {
            const result = await setActiveBudget(budgetId);
            if (result.success) {
                onClose();
            } else {
                showToast(result.error?.message || 'Failed to set active budget', 'error');
            }
        } catch (error) {
            showToast('Failed to set active budget', 'error');
        } finally {
            setOperationInProgress(false);
        }
    }, [setActiveBudget, showToast, onClose]);

    return (
        <Modal visible={visible} onClose={onClose} title="Switch Budget" maxWidth={500}>
            <View style={{ padding: 24 }}>
                {/* Create New Budget */}
                <View style={{ marginBottom: 24 }}>
                    <Text style={[themedStyles.text, { fontWeight: '700', marginBottom: 12 }]}>Create New Budget</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <TextInput
                            style={[themedStyles.input, { flex: 1, marginBottom: 0 }]}
                            placeholder="Budget Name"
                            placeholderTextColor={currentColors.textSecondary}
                            value={newBudgetName}
                            onChangeText={setNewBudgetName}
                        />
                        <TouchableOpacity
                            onPress={handleCreateBudget}
                            disabled={isCreating || !newBudgetName.trim()}
                            style={{
                                backgroundColor: currentColors.primary,
                                paddingHorizontal: 20,
                                borderRadius: 12,
                                justifyContent: 'center',
                                opacity: (isCreating || !newBudgetName.trim()) ? 0.6 : 1
                            }}
                        >
                            {isCreating ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '700' }}>Create</Text>}
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={[themedStyles.text, { fontWeight: '700', marginBottom: 12 }]}>Existing Budgets</Text>
                <ScrollView style={{ maxHeight: 400 }}>
                    <View style={{ gap: 12 }}>
                        {budgets.map((budget) => {
                            const isActive = activeBudget?.id === budget.id;
                            const isEditing = editingBudgetId === budget.id;

                            return (
                                <TouchableOpacity
                                    key={budget.id}
                                    onPress={() => !isActive && handleSetActiveBudget(budget.id)}
                                    style={[
                                        themedStyles.card,
                                        {
                                            borderColor: isActive ? currentColors.success : currentColors.border,
                                            borderWidth: isActive ? 2 : 1,
                                            backgroundColor: isActive ? currentColors.success + '05' : currentColors.backgroundAlt,
                                            marginBottom: 0,
                                        }
                                    ]}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flex: 1 }}>
                                            {isEditing ? (
                                                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                                    <TextInput
                                                        style={[themedStyles.input, { flex: 1, marginBottom: 0 }]}
                                                        value={editingName}
                                                        onChangeText={setEditingName}
                                                        autoFocus
                                                    />
                                                    <TouchableOpacity onPress={() => handleRenameBudget(budget.id)}>
                                                        <Icon name="checkmark" size={20} color={currentColors.success} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => setEditingBudgetId(null)}>
                                                        <Icon name="close" size={20} color={currentColors.error} />
                                                    </TouchableOpacity>
                                                </View>
                                            ) : (
                                                <View>
                                                    <Text style={[themedStyles.text, { fontWeight: '700', fontSize: 16, color: isActive ? currentColors.success : currentColors.text }]}>
                                                        {budget.name} {isActive && '(Active)'}
                                                    </Text>
                                                    <Text style={[themedStyles.textSecondary, { fontSize: 12, marginTop: 4 }]}>
                                                        {budget.people?.length || 0} people • {budget.expenses?.length || 0} expenses
                                                    </Text>
                                                </View>
                                            )}
                                        </View>

                                        {!isEditing && (
                                            <TouchableOpacity
                                                onPress={(e) => {
                                                    e.stopPropagation();
                                                    setEditingBudgetId(budget.id);
                                                    setEditingName(budget.name);
                                                }}
                                                style={{ padding: 8 }}
                                            >
                                                <Icon name="pencil" size={18} style={{ color: currentColors.textSecondary }} />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}
