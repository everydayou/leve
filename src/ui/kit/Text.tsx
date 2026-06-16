import type { ElementType, ReactNode } from 'react';

/* Typography atom. Maps a semantic `variant` to a token-driven size + weight +
   colour. Centralises type so a scale change happens in one place (the
   --text-* tokens + this map), never per-screen. */
type Variant =
  | 'display' | 'title' | 'headline' | 'body' | 'callout'
  | 'subhead' | 'footnote' | 'caption' | 'eyebrow';

type Tone = 'default' | 'secondary' | 'muted' | 'accent' | 'inverse'
  | 'success' | 'warn' | 'danger';

const VARIANT: Record<Variant, string> = {
  display:  'text-display font-bold tracking-tight',
  title:    'text-title font-bold tracking-tight',
  headline: 'text-headline font-semibold',
  body:     'text-body',
  callout:  'text-callout',
  subhead:  'text-subhead',
  footnote: 'text-footnote',
  caption:  'text-caption',
  eyebrow:  'text-caption font-semibold uppercase tracking-wide',
};

const TONE: Record<Tone, string> = {
  default:   'text-content',
  secondary: 'text-content-secondary',
  muted:     'text-content-muted',
  accent:    'text-accent',
  inverse:   'text-content-inverse',
  success:   'text-success',
  warn:      'text-warn',
  danger:    'text-danger',
};

export function Text({
  variant = 'body', tone = 'default', as, className = '', children,
}: {
  variant?: Variant; tone?: Tone; as?: ElementType; className?: string; children: ReactNode;
}) {
  const Tag = as ?? 'span';
  return <Tag className={`${VARIANT[variant]} ${TONE[tone]} ${className}`}>{children}</Tag>;
}
