
import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { Alert } from '../utils/alert';
import StandardHeader from '../components/StandardHeader';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useTheme } from '../hooks/useTheme';
import { DEFAULT_CATEGORIES } from '../types/budget';
import { getCustomExpenseCategories, normalizeCategoryName } from '../utils/storage';
import { useBudgetData } from '../hooks/useBudgetData';
import { router } from 'expo-router';
import { Chip, EmptyState, IconButton, Input, ListGroup, ListRow, Sheet, Skeleton } from '../components/ui';
import { space } from '../styles/tokens';

export default function ManageCategoriesScreen() {
  const { themedStyles, breakpoint } = useThemedStyles();
  const { tokens } = useTheme();
  const { data, customCategories, saveCustomCategories, renameCustomCategory } = useBudgetData();

  const [customs, setCustoms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [categoryToRename, setCategoryToRename] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [renaming, setRenaming] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getCustomExpenseCategories();
      setCustoms(list);
    } catch (e) {
      console.log('Failed to load custom categories', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh when the synced list changes (another device, or clearing all data)
  useEffect(() => {
    refresh();
  }, [customCategories.join('|'), refresh]);

  const isInUse = (category: string): boolean => {
    if (!data?.expenses) return false;
    const normalized = normalizeCategoryName(category);
    return data.expenses.some((e) => normalizeCategoryName((e as any).categoryTag || 'Misc') === normalized);
  };

  const handleDelete = (category: string) => {
    if (isInUse(category)) {
      Alert.alert('Cannot delete', 'This category is currently in use by one or more expenses.');
      return;
    }
    Alert.alert('Delete Category', `Are you sure you want to delete "${category}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const next = customs.filter((c) => c !== category);
            const result = await saveCustomCategories(next);
            if (!result.success) throw result.error;
            setCustoms(next);
          } catch (e) {
            console.log('Failed to delete custom category', e);
            Alert.alert('Error', 'Failed to delete category. Please try again.');
          }
        },
      },
    ]);
  };

  const handleRename = (category: string) => {
    setCategoryToRename(category);
    setNewCategoryName(category);
    setRenameModalVisible(true);
  };

  const handleRenameSubmit = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Error', 'Category name cannot be empty.');
      return;
    }

    if (newCategoryName.trim() === categoryToRename) {
      setRenameModalVisible(false);
      return;
    }

    setRenaming(true);
    try {
      const result = await renameCustomCategory(categoryToRename, newCategoryName.trim());
      
      if (result.success) {
        await refresh();
        setRenameModalVisible(false);
        setCategoryToRename('');
        setNewCategoryName('');
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to rename category. Please try again.');
      }
    } catch (e) {
      console.log('Failed to rename custom category', e);
      Alert.alert('Error', 'Failed to rename category. Please try again.');
    } finally {
      setRenaming(false);
    }
  };

  const handleRenameCancel = () => {
    setRenameModalVisible(false);
    setCategoryToRename('');
    setNewCategoryName('');
  };

  const handleCreateCategory = () => {
    setNewCategoryInput('');
    setCreateModalVisible(true);
  };

  const handleCreateSubmit = async () => {
    const trimmedName = newCategoryInput.trim();
    if (!trimmedName) {
      Alert.alert('Error', 'Category name cannot be empty.');
      return;
    }

    const normalized = normalizeCategoryName(trimmedName);
    
    // Check if it conflicts with default categories
    if (DEFAULT_CATEGORIES.includes(normalized)) {
      Alert.alert('Error', 'This category name conflicts with a default category.');
      return;
    }

    // Check if it already exists in custom categories
    if (customs.includes(normalized)) {
      Alert.alert('Error', 'A category with this name already exists.');
      return;
    }

    setCreating(true);
    try {
      const updatedCategories = [...customs, normalized];
      const result = await saveCustomCategories(updatedCategories);
      if (!result.success) throw result.error;
      setCustoms(updatedCategories);
      setCreateModalVisible(false);
      setNewCategoryInput('');
    } catch (e) {
      console.log('Failed to create custom category', e);
      Alert.alert('Error', 'Failed to create category. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCancel = () => {
    setCreateModalVisible(false);
    setNewCategoryInput('');
  };

  const usageCount = (category: string) => {
    const normalized = normalizeCategoryName(category);
    return (data?.expenses || []).filter((e) => normalizeCategoryName((e as any).categoryTag || 'Misc') === normalized).length;
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Categories"
        onLeftPress={() => (router.canGoBack() ? router.back() : router.navigate('/settings'))}
        rightButtons={[{ icon: 'add', onPress: handleCreateCategory, accessibilityLabel: 'New category' }]}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
      >
        <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          {loading ? (
            <ListGroup header="Your categories">
              <View style={{ padding: space.s4, gap: space.s3 }}>
                <Skeleton width="60%" />
                <Skeleton width="40%" />
              </View>
            </ListGroup>
          ) : customs.length === 0 ? (
            <ListGroup header="Your categories">
              <EmptyState
                icon="pricetags-outline"
                title="No custom categories"
                caption="Add your own to tag expenses beyond the built-in set."
                actionLabel="New category"
                onAction={handleCreateCategory}
              />
            </ListGroup>
          ) : (
            <ListGroup header="Your categories" footer="Tap a category to rename it. Categories in use can't be deleted.">
              {customs.map((c, i) => {
                const count = usageCount(c);
                return (
                  <ListRow
                    key={c}
                    title={c}
                    caption={count > 0 ? `Used by ${count} ${count === 1 ? 'expense' : 'expenses'}` : 'Not used yet'}
                    icon="pricetag-outline"
                    onPress={() => handleRename(c)}
                    accessibilityLabel={`${c}, rename`}
                    accessory={
                      <IconButton
                        icon="trash-outline"
                        accessibilityLabel={count > 0 ? `${c} is in use and can't be deleted` : `Delete ${c}`}
                        onPress={() => handleDelete(c)}
                        disabled={count > 0}
                        color={count > 0 ? tokens.colors.textFaint : tokens.colors.danger}
                      />
                    }
                    showSeparator={i < customs.length - 1}
                  />
                );
              })}
            </ListGroup>
          )}

          <ListGroup header="Built in" footer="Built-in categories are always available and can't be changed.">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, padding: space.s4 }}>
              {DEFAULT_CATEGORIES.map((c) => (
                <Chip key={c} label={c} />
              ))}
            </View>
          </ListGroup>
        </View>
      </ScrollView>

      <Sheet
        visible={createModalVisible}
        onClose={handleCreateCancel}
        title="New category"
        leadingAction={{ label: 'Cancel', onPress: handleCreateCancel, disabled: creating }}
        trailingAction={{ label: 'Add', onPress: handleCreateSubmit, disabled: !newCategoryInput.trim() || creating }}
        width={420}
      >
        <View style={{ padding: space.s5 }}>
          <Input
            label="Name"
            value={newCategoryInput}
            onChangeText={setNewCategoryInput}
            placeholder="e.g. Pets"
            autoFocus
            maxLength={30}
            editable={!creating}
            returnKeyType="done"
            onSubmitEditing={handleCreateSubmit}
          />
        </View>
      </Sheet>

      <Sheet
        visible={renameModalVisible}
        onClose={handleRenameCancel}
        title="Rename category"
        leadingAction={{ label: 'Cancel', onPress: handleRenameCancel, disabled: renaming }}
        trailingAction={{
          label: 'Save',
          onPress: handleRenameSubmit,
          disabled: !newCategoryName.trim() || newCategoryName.trim() === categoryToRename || renaming,
        }}
        width={420}
      >
        <View style={{ padding: space.s5 }}>
          <Input
            label="Name"
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            autoFocus
            selectTextOnFocus
            maxLength={30}
            editable={!renaming}
            returnKeyType="done"
            onSubmitEditing={handleRenameSubmit}
            helperText={
              usageCount(categoryToRename) > 0
                ? `Renaming updates ${usageCount(categoryToRename)} ${usageCount(categoryToRename) === 1 ? 'expense' : 'expenses'}.`
                : undefined
            }
          />
        </View>
      </Sheet>
    </View>
  );
}
