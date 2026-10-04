import React from 'react';
import { View, Text } from 'react-native';
import Button from '../Button';
import Icon from '../Icon';
import { Sheet, SegmentedControl } from '../ui';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { type, space, radius, tabularNums } from '../../styles/tokens';
import type { BucketId, CategoryShare } from '../../utils/budgetReview';
import { BUCKET_META, BUCKET_OPTIONS } from './bucketMeta';

/**
 * Where one category counts in the budget review: pick Needs, Wants or Savings,
 * or put it back to its default. The choice is stored on the budget, so it
 * applies to everyone who shares it.
 */

interface CategoryBucketSheetProps {
  visible: boolean;
  onClose: () => void;
  category: CategoryShare | null;
  /** Where the category counts right now. */
  bucket: BucketId;
  /** The budget has other people on it. */
  shared: boolean;
  saving: boolean;
  onChoose: (bucket: BucketId) => void;
  onReset: () => void;
  onShowExpenses: () => void;
}

export default function CategoryBucketSheet({
  visible,
  onClose,
  category,
  bucket,
  shared,
  saving,
  onChoose,
  onReset,
  onShowExpenses,
}: CategoryBucketSheetProps) {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  if (!category) return null;
  const defaultName = BUCKET_META[category.defaultBucket].name;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={category.name}
      trailingAction={{ label: 'Done', onPress: onClose }}
      width={420}
    >
      <View style={{ padding: space.s5, gap: space.s4 }}>
        <Text style={[type.caption, tabularNums, { color: tokens.colors.textMuted }]}>
          {formatCurrency(category.monthly)}/mo · {category.pct < 0.1 ? '<0.1' : category.pct.toFixed(1)}% of income
        </Text>

        <SegmentedControl<BucketId>
          label="Counts as"
          options={BUCKET_OPTIONS}
          value={bucket}
          onChange={(next) => !saving && next !== bucket && onChoose(next)}
        />

        {category.moved ? (
          <View style={{ gap: space.s1 }}>
            <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Usually counts as {defaultName}.</Text>
            <Button variant="ghost" text={`Put back to ${defaultName}`} onPress={onReset} disabled={saving} style={{ marginTop: 0 }} />
          </View>
        ) : (
          <Text style={[type.caption, { color: tokens.colors.textMuted }]}>
            {category.custom
              ? 'A custom category, counted as a want unless you move it.'
              : `Counts as ${defaultName} unless you move it.`}
          </Text>
        )}

        {shared ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s2,
              padding: space.s3,
              borderRadius: radius.md,
              backgroundColor: tokens.colors.brandSubtle,
            }}
          >
            <Icon name="people-outline" size={18} color={tokens.colors.brand} />
            <Text style={[type.caption, { flex: 1, color: tokens.colors.text }]}>
              This budget is shared, so everyone on it sees this change.
            </Text>
          </View>
        ) : null}

        <Button variant="secondary" text="Show these expenses" onPress={onShowExpenses} style={{ marginTop: 0 }} />
      </View>
    </Sheet>
  );
}
