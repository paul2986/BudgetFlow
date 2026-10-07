import React from 'react';
import { ScrollView, View } from 'react-native';
import { useBudgetData } from '../hooks/useBudgetData';
import { useBudgetLock } from '../hooks/useBudgetLock';
import { useThemedStyles } from '../hooks/useThemedStyles';
import StandardHeader from './StandardHeader';
import BudgetUnlock from './BudgetUnlock';
import UnlockFade from './UnlockFade';
import { Card } from './ui';
import { space } from '../styles/tokens';

/**
 * Wraps a screen that shows what is in the active budget. While the budget is
 * locked on this device, the code pad is all anyone sees; the screen itself
 * isn't rendered, so nothing of it is read or shown until the budget is open.
 */
export default function LockGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { activeBudget } = useBudgetData();
  const { isLocked } = useBudgetLock();
  const { themedStyles, breakpoint } = useThemedStyles();

  const locked = !!activeBudget && isLocked(activeBudget);

  // The wrapper stays put whether the lock is up or not, so the budget can fade in when it goes.
  return (
    <UnlockFade locked={locked} style={{ flex: 1 }}>
      {locked && activeBudget ? (
        <View style={themedStyles.container}>
          <StandardHeader title={title} showLeftIcon={false} showRightIcon={false} maxWidth={420} />
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
          >
            <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
              <Card>
                <BudgetUnlock budget={activeBudget} />
              </Card>
            </View>
          </ScrollView>
        </View>
      ) : (
        children
      )}
    </UnlockFade>
  );
}
