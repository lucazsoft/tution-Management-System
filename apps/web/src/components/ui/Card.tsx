import * as React from 'react';
import { cn } from './utils';

export interface CardProps extends React.ComponentProps<'div'> {
  hoverable?: boolean;
}

export function Card({ hoverable = true, className, children, ...props }: CardProps) {
  return (
    <div
      data-slot="tms-card"
      className={cn('tms-panel', className)}
      style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: '16px',
        padding: '20px',
        transition: 'all 0.25s var(--ease-silk)',
        cursor: hoverable ? 'pointer' : 'default',
        ...props.style
      }}
      {...props}
    >
      {children}
    </div>
  );
}
