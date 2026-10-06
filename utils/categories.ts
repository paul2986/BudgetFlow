// Normalize and validate category names
export const normalizeCategoryName = (name: any): string => {
  if (typeof name !== 'string') return 'Misc';
  // Allow only letters, numbers and spaces
  let cleaned = name.replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Misc';
  // Title Case
  cleaned = cleaned
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
  // Enforce max length 20
  if (cleaned.length > 20) cleaned = cleaned.slice(0, 20).trim();
  return cleaned;
};
