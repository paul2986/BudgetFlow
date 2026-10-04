import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from '../Icon';
import { Card } from '../ui';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { type, space, radius, tabularNums } from '../../styles/tokens';
import type { BucketReview, CategoryShare } from '../../utils/budgetReview';
import { BUCKET_META, STATUS_ICON, statusLabel } from './bucketMeta';

/**
 * One 50/30/20 bucket: where it stands against its target (figures, a meter
 * with a target tick, a status badge that pairs an icon with words) and, behind
 * a disclosure, the categories that make it up.
 */

interface BucketCardProps {
  bucket: BucketReview;
  /** Tapping a category row: the screen opens its "counts as" sheet. */
  onOpenCategory: (category: CategoryShare) => void;
}

/** Text for how far a bucket is from its target, in money. */
const gapText = (b: BucketReview, format: (n: number) => string): string => {
  if (b.shownPct === b.targetPct) return 'Right on target';
  const amount = `${format(Math.abs(b.gapMonthly))}/mo`;
  if (b.id === 'savings') return b.gapMonthly < 0 ? `${amount} short of target` : `${amount} above target`;
  return b.gapMonthly > 0 ? `${amount} above target` : `${amount} under target`;
};

/** Why a category sits where it does, when that isn't the obvious default. */
const categoryNote = (c: CategoryShare): string =>
  c.moved ? `Moved from ${BUCKET_META[c.defaultBucket].name}` : c.custom ? 'Custom, counts as a want' : '';

/** A track with the fill up to your share and a tick at the target. Scale: twice the target, or more if you are beyond it. */
function TargetMeter({ bucket, color }: { bucket: BucketReview; color: string }) {
  const { tokens } = useTheme();
  const scale = Math.max(bucket.targetPct * 2, bucket.pct * 1.05);
  const fill = Math.min(100, (bucket.pct / scale) * 100);
  const tick = (bucket.targetPct / scale) * 100;
  const meta = BUCKET_META[bucket.id];

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${meta.name}: ${bucket.shownPct}% of income, target ${bucket.targetPct}%`}
      style={{ height: 20, justifyContent: 'center', marginTop: space.s4 }}
    >
      <View style={{ height: 12, borderRadius: radius.full, backgroundColor: tokens.colors.surfaceSunken, overflow: 'hidden' }}>
        <View style={{ width: `${fill}%`, height: '100%', backgroundColor: color, borderRadius: radius.full }} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: `${tick}%`,
          marginLeft: -2,
          width: 4,
          height: 20,
          borderRadius: 2,
          backgroundColor: tokens.colors.text,
          borderWidth: 1,
          borderColor: tokens.colors.surface,
        }}
      />
    </View>
  );
}

export default function BucketCard({ bucket, onOpenCategory }: BucketCardProps) {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const meta = BUCKET_META[bucket.id];
  const color = tokens.colors[meta.tone];
  const subtle = tokens.colors[`${meta.tone}Subtle` as const];
  const statusColor =
    bucket.status === 'onTrack' ? tokens.colors.income : bucket.status === 'close' ? tokens.colors.warning : tokens.colors.danger;
  const statusSubtle =
    bucket.status === 'onTrack' ? tokens.colors.incomeSubtle : bucket.status === 'close' ? tokens.colors.warningSubtle : tokens.colors.dangerSubtle;
  const label = statusLabel(bucket.id, bucket.status);
  const count = bucket.categories.length;

  return (
    <Card>
      <View
        accessible
        accessibilityLabel={`${meta.name}, ${label}. ${bucket.shownPct}% of income, ${formatCurrency(bucket.monthly)} a month. Target ${bucket.targetPct}%, ${formatCurrency(bucket.targetMonthly)} a month. ${gapText(bucket, formatCurrency)}.`}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.full,
              backgroundColor: subtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={meta.icon} size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[type.h3, { color: tokens.colors.text }]}>
              {meta.name}
            </Text>
            <Text style={[type.caption, { color: tokens.colors.textMuted }]}>Target {bucket.targetPct}% of income</Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s1,
              paddingVertical: space.s1,
              paddingHorizontal: space.s3,
              borderRadius: radius.full,
              backgroundColor: statusSubtle,
            }}
          >
            <Icon name={STATUS_ICON[bucket.status]} size={16} color={statusColor} />
            <Text style={[type.caption, { color: tokens.colors.text }]}>{label}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.s4 }}>
          <View>
            <Text style={[type.h1, { color: tokens.colors.text }]}>{bucket.shownPct}%</Text>
            <Text style={[type.caption, { color: tokens.colors.textMuted }]}>of your income</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type.h3, tabularNums, { color: tokens.colors.text }]}>{formatCurrency(bucket.monthly)}/mo</Text>
            <Text style={[type.caption, tabularNums, { color: tokens.colors.textMuted }]}>
              Target {formatCurrency(bucket.targetMonthly)}/mo
            </Text>
          </View>
        </View>

        <TargetMeter bucket={bucket} color={color} />

        <Text style={[type.bodyMed, { color: tokens.colors.text, marginTop: space.s3 }]}>{gapText(bucket, formatCurrency)}</Text>
      </View>

      <View style={{ marginTop: space.s2 }}>
        <Pressable
          onPress={() => count > 0 && setOpen((v) => !v)}
          disabled={count === 0}
          accessibilityRole="button"
          accessibilityState={{ expanded: open, disabled: count === 0 }}
          accessibilityLabel={`${meta.name}, what's in it, ${count} ${count === 1 ? 'category' : 'categories'}. ${open ? 'Hide' : 'Show'}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 44,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={[type.bodyMed, { color: count === 0 ? tokens.colors.textMuted : tokens.colors.brand }]}>
            {count === 0 ? 'Nothing here yet' : `What’s in it (${count})`}
          </Text>
          {count > 0 ? <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={tokens.colors.textMuted} /> : null}
        </Pressable>

        {count === 0 ? (
          <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{meta.emptyHint}</Text>
        ) : null}

        {open ? (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.colors.border }}>
            {bucket.categories.map((c, i) => (
              <Pressable
                key={c.name}
                onPress={() => onOpenCategory(c)}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${formatCurrency(c.monthly)} a month, ${c.pct.toFixed(1)}% of income. ${categoryNote(c) ? `${categoryNote(c)}. ` : ''}Change which bucket it counts towards`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.s3,
                  minHeight: 52,
                  paddingVertical: space.s2,
                  backgroundColor: pressed ? tokens.colors.surfaceHover : 'transparent',
                  borderBottomWidth: i < count - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: tokens.colors.border,
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[type.bodyMed, { color: tokens.colors.text }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={[type.caption, tabularNums, { color: tokens.colors.textMuted }]}>
                    {c.pct < 0.1 ? '<0.1' : c.pct.toFixed(1)}% of income{categoryNote(c) ? ` · ${categoryNote(c).toLowerCase()}` : ''}
                  </Text>
                </View>
                <Text style={[type.bodyMed, tabularNums, { color: tokens.colors.text }]}>{formatCurrency(c.monthly)}</Text>
                <Icon name="swap-horizontal-outline" size={18} color={tokens.colors.textFaint} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
