import React, { useState } from 'react';

export interface StudentAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: React.CSSProperties;
}

const SIZE_MAP: Record<NonNullable<StudentAvatarProps['size']>, { dimension: number; fontSize: number }> = {
  xs: { dimension: 28, fontSize: 11 },
  sm: { dimension: 36, fontSize: 13 },
  md: { dimension: 42, fontSize: 15 },
  lg: { dimension: 52, fontSize: 18 },
  xl: { dimension: 64, fontSize: 22 },
};

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function StudentAvatar({
  name,
  photoUrl,
  size = 'md',
  className = '',
  style = {},
}: StudentAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const { dimension, fontSize } = SIZE_MAP[size] || SIZE_MAP.md;

  const hasPhoto = Boolean(photoUrl) && !imgError;

  return (
    <div
      className={`student-avatar-box ${hasPhoto ? 'has-photo' : 'has-initials'} ${className}`}
      style={{
        width: dimension,
        height: dimension,
        minWidth: dimension,
        minHeight: dimension,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize,
        flexShrink: 0,
        background: hasPhoto ? 'var(--color-surface, #f8fafc)' : 'linear-gradient(135deg, #1560bd 0%, #2563eb 100%)',
        color: '#ffffff',
        border: '1.5px solid var(--border, #e2e8f0)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        userSelect: 'none',
        ...style,
      }}
      title={name}
      aria-label={`${name}'s avatar`}
    >
      {hasPhoto ? (
        <img
          src={photoUrl!}
          alt={name}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
}
