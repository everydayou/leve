/* Hairline separator. Inset variant matches iOS list dividers (starts after a
   leading element). Colour from the border token. */
export function Divider({ inset = false }: { inset?: boolean }) {
  return <div className={`h-px bg-border-subtle ${inset ? 'ml-12' : ''}`} role="separator" />;
}
