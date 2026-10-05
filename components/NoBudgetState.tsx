import React from 'react';
import { router } from 'expo-router';
import { EmptyState } from './ui';

/**
 * What People, Expenses and their add forms show before the first budget
 * exists. Everything is saved into a budget, so without one an "Add" button
 * can only fail; point at where the budget is created (Overview) instead.
 */
export default function NoBudgetState() {
  return (
    <EmptyState
      icon="wallet-outline"
      title="Create your budget first"
      caption="People, income and expenses live in a budget. Name yours to get started."
      actionLabel="Create budget"
      onAction={() => router.navigate('/')}
    />
  );
}
