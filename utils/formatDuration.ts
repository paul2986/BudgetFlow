/** 14 → "1 year 2 months"; 5 → "5 months". */
export const formatDuration = (months: number): string => {
  const total = Math.max(0, Math.round(months));
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const y = `${years} ${years === 1 ? 'year' : 'years'}`;
  const m = `${rest} ${rest === 1 ? 'month' : 'months'}`;
  if (years === 0) return m;
  return rest ? `${y} ${m}` : y;
};
