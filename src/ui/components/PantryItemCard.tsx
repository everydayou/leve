// Shared "Food item card" for Pantry surfaces (Food item detail's own card,
// Meal detail's per-item cards) — see "Component: Food item card" in the
// meals-in-pantry spec. Deliberately a SEPARATE component from the Day's-log
// BasketCard in AddEntrySheet.tsx rather than a forced unification: the two
// surfaces have opposite stepper rules (Pantry = always disabled, managing a
// definition; Day's log = always enabled, logging a consumed quantity) and
// different trash semantics (Pantry: remove-from-meal vs delete-whole-object;
// Day's log: remove-from-basket). They DO share the same macro-line
// formatting via <MacroSummaryLine>, and the same DeleteIcon/EditIcon glyphs
// as BasketCard — one icon change reflects on every card, everywhere.
import { Icon, MacroSummaryLine } from '../kit';
import type { NutritionSnapshot } from '../../domain/types';
import { DeleteIcon, EditIcon } from './icons';

export function PantryItemCard({
  name, nutrition, servingLabel, onEdit, onRemove, onCorrect,
}: {
  name: string;
  nutrition: NutritionSnapshot;
  /** e.g. "1 Srv" or "100g" — the Meal/Food item's definition amount. Always
   *  shown in a disabled stepper: Pantry manages definitions, not consumed
   *  quantity (spec §10). */
  servingLabel: string;
  /** Tapping ANYWHERE on the card opens edit — same convention as BasketCard.
   *  No photo thumbnail here, by design — matches BasketCard exactly, which
   *  never shows one either. Photos live in the aggregated hero/collage at
   *  the top of the sheet, not repeated per card. */
  onEdit: () => void;
  /** When provided, shows a card-level trash button ("remove this Food item
   *  from the Meal" — spec §11). Omit for a single Food item's own detail
   *  card, where there's nothing to remove it from. */
  onRemove?: () => void;
  /** When provided, shows a "Change" button (scanned items, same window as
   *  the Day's-log basket's own Change button — re-run Describe to replace
   *  this item's macros rather than editing them by hand). */
  onCorrect?: () => void;
}) {
  return (
    <div
      className="rounded-[20px] border border-border-subtle bg-surface p-4 shadow-card"
      onClick={onEdit}
      style={{ cursor: 'pointer' }}
    >
      <div className="mb-2 flex items-center gap-3">
        <span className="flex-1 truncate text-callout font-bold text-content">{name}</span>
        <span className="shrink-0 text-callout text-content">{nutrition.calories} kcal</span>
      </div>
      <MacroSummaryLine nutrition={nutrition} className="mb-2.5" />
      <div className="flex items-center justify-between">
        {/* Disabled stepper — Pantry defines properties, never consumed quantity. */}
        <div
          className="inline-flex items-center gap-0 rounded-full bg-surface-sunken px-1 py-1 opacity-50"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-content border border-border-field">
            <Icon name="minus" size={20} strokeWidth={2} />
          </span>
          <span className="min-w-[54px] text-center text-subhead font-normal text-content">{servingLabel}</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-content border border-border-field">
            <Icon name="plus" size={20} strokeWidth={2} />
          </span>
        </div>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {onCorrect && (
            <button
              onClick={onCorrect}
              className="flex h-10 items-center rounded-full border border-border-field px-3 text-subhead font-medium text-content-secondary active:bg-surface-sunken"
            >
              Change
            </button>
          )}
          <button
            onClick={onEdit}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border-field bg-surface text-content active:opacity-60"
            aria-label="Edit"
          >
            <EditIcon size={20} />
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border-field bg-surface text-content active:opacity-60"
              aria-label="Remove from meal"
            >
              <DeleteIcon size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
