
import { Budget } from '../types/budget';

// Utility: simple URI-encoded JSON "bfj:" offline payload for QR-only sharing.
// This keeps the app completely self-contained without any external dependencies.
export function buildOfflinePayload(budget: Budget) {
  const payload = {
    v: 1,
    type: 'budget',
    budget: {
      name: budget.name,
      people: budget.people,
      expenses: budget.expenses,
      householdSettings: budget.householdSettings,
    },
  };
  const text = JSON.stringify(payload);
  const encoded = encodeURIComponent(text);
  return `bfj:${encoded}`;
}

function parseOfflinePayload(text: string): { ok: true; data: any } | { ok: false; error: string } {
  try {
    if (!text.startsWith('bfj:')) return { ok: false, error: 'Not an offline payload' };
    const encoded = text.slice(4);
    const json = decodeURIComponent(encoded);
    const data = JSON.parse(json);
    if (!data || data.v !== 1 || data.type !== 'budget' || !data.budget) {
      return { ok: false, error: 'Invalid payload' };
    }
    return { ok: true, data };
  } catch (e) {
    console.log('parseOfflinePayload error', e);
    return { ok: false, error: 'Failed to parse payload' };
  }
}

/**
  Creates a shareable link via QR code only (offline mode).
  This app is now fully self-contained and doesn't require external services.
*/
export async function createShareLink(budget: Budget): Promise<{ url: string; code?: string; expiresAt?: string }> {
  // Generate offline QR payload
  const offlinePayload = buildOfflinePayload(budget);
  
  return { 
    url: offlinePayload,
    code: 'offline',
    expiresAt: 'never'
  };
}

/**
  Fetches a shared budget from a QR code payload.
  Only supports offline "bfj:" payloads since the app is now fully self-contained.
*/
export async function fetchSharedBudget(input: string): Promise<{ budget: Omit<Budget, 'id' | 'createdAt'>; source: 'offline' | 'link' }> {
  // Check offline payload
  const offlineParsed = parseOfflinePayload(input);
  if (offlineParsed.ok) {
    const b = offlineParsed.data.budget;
    return {
      budget: {
        name: b.name || 'Imported Budget',
        people: Array.isArray(b.people) ? b.people : [],
        expenses: Array.isArray(b.expenses) ? b.expenses : [],
        householdSettings: b.householdSettings || { distributionMethod: 'even' },
      },
      source: 'offline',
    };
  }

  // No longer support online sharing since the app is self-contained
  throw new Error('Only offline QR code sharing is supported. This app is fully self-contained and does not require internet connectivity.');
}
