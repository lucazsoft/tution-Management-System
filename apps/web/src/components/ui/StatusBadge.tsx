import type { ReactNode } from 'react';

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'gold';

export interface StatusBadgeProps {
  status?: StatusBadgeVariant;
  variant?: StatusBadgeVariant;
  children?: ReactNode;
}

function formatLabel(status: StatusBadgeVariant) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Tint and text colour come from the themed `--color-*-soft` / `-strong`
 * tokens rather than inline rgba, so a badge stays legible in both themes.
 * The previous hardcoded tints were pale washes tuned for a white card and
 * all but vanished on the dark surface.
 */
export function StatusBadge({ status, variant, children }: StatusBadgeProps) {
  const resolved = status ?? variant ?? 'info';
  return (
    <span className={`status-badge status-badge--${resolved}`}>
      {children ?? formatLabel(resolved)}
    </span>
  );
}
