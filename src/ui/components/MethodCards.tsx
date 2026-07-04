// Shared "other logging methods" building blocks — extracted (round 123) so
// the Day's-log basket flow (AddEntrySheet.tsx) and the Pantry meal-builder
// (PantryFoodItemDetail / PantryMealDetail) render the exact same collapsible
// module and method buttons. One place to change either, and it reflects
// everywhere it's used.
import { Icon, Sheet } from '../kit';

// ── MethodPickerModal ─────────────────────────────────────────────────────────

/** Small modal showing the MethodCards row as a one-off choice — used where
 *  there's no existing basket/meal context to expand inline into, e.g.
 *  Pantry's "+ New food" (round 134): tapping it asks which method before
 *  landing on any specific form, rather than jumping straight to Manual
 *  entry. Just the standard Sheet (not forceExpanded, so it sizes to its
 *  content) — gets the slide-up/down animation, the X close button, and
 *  drag-to-dismiss for free, same as every other sheet in the app. */
export function MethodPickerModal({
  title = 'New food', helperText = "Choose one way to add this food", onDismiss, ...methodProps
}: {
  title?: string;
  helperText?: string;
  onDismiss: () => void;
  onCamera: () => void;
  onPhoto: () => void;
  onDescribe: () => void;
  onLabel?: () => void;
  onPantry?: () => void;
  onManual: () => void;
}) {
  return (
    <Sheet title={title} onClose={onDismiss}>
      <p className="pt-2 pb-6 text-center text-subhead text-content-secondary">{helperText}</p>
      <MethodCards {...methodProps} />
    </Sheet>
  );
}

// ── AddAnotherSection ─────────────────────────────────────────────────────────

/** Collapsible "+ <label>" row that expands to reveal `children` inline,
 *  inside the same rounded sunken surface. Used both for "+ Add another item"
 *  (Day's-log basket) and "+ Create a meal" / "+ Add a new food item" (Pantry). */
export function AddAnotherSection({
  open, onToggle, onClose, children, label = 'Add another item', helperText, bordered = false,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
  /** Defaults to the Day's-log basket copy; Pantry surfaces pass their own. */
  label?: string;
  /** Small muted line under the label, shown only while collapsed. Pantry
   *  surfaces pass "Add another item" here (round 126) so the collapsed pill
   *  reads e.g. "+ Create a meal" / "Add another item", matching spec copy. */
  helperText?: string;
  /** Round 166: adds a border-field outline (darker than the sunken
   *  background) — only for the Meal use case, where this module now sits
   *  inside the Meal card's own grey Food-items panel and would otherwise
   *  blend invisibly into that identical bg-surface-sunken backdrop. */
  bordered?: boolean;
}) {
  return (
    <div className={`rounded-[24px] bg-surface-sunken overflow-hidden${bordered ? ' border border-border-field' : ''}`}>
      {/* Heading row */}
      <button
        onClick={onToggle}
        className={`flex w-full items-center px-4 py-3.5${open ? ' pb-3' : ''}`}
      >
        {/* X — same width as right spacer to keep title centred */}
        <span className="w-6 flex items-center justify-center">
          {open && (
            <span
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              role="button"
              aria-label="Close"
              className="flex h-6 w-6 items-center justify-center"
            >
              <Icon name="close" size={18} strokeWidth={2} className="text-content-muted" />
            </span>
          )}
        </span>
        <span className="flex-1 flex flex-col items-center text-center">
          <span className="text-body font-semibold text-content">
            <Icon name="plus" size={18} strokeWidth={2.5} className="inline mr-1 align-[-3px]" />
            {label}
          </span>
          {!open && helperText && (
            <span className="mt-0.5 text-subhead text-content-secondary">{helperText}</span>
          )}
        </span>
        <span className="w-6" />
      </button>

      {/* Picker content — bare (no extra container), expands inside the same surface */}
      {open && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ── MethodCards ───────────────────────────────────────────────────────────────

export function MethodCards({
  onCamera, onPhoto, onDescribe, onLabel, onPantry, onManual,
}: {
  onCamera: () => void; onPhoto: () => void; onDescribe: () => void;
  /** Nutri-scan (barcode/label) — optional because a few older call sites
   *  predate it; every current surface (Day's-log basket, Pantry meal
   *  builder) wires it up. */
  onLabel?: () => void;
  /** "Add from pantry" — Pantry meal-builder only; omit in the Day's-log
   *  basket, which already has its own search+recents picker. */
  onPantry?: () => void;
  onManual: () => void;
}) {
  const methods = [
    ...(onPantry ? [{ label: 'Pantry', onClick: onPantry, icon: <PantryMethodIcon /> }] : []),
    { label: 'Camera',   onClick: onCamera,   icon: <CameraMethodIcon /> },
    { label: 'Photo',    onClick: onPhoto,    icon: <PhotoMethodIcon /> },
    { label: 'Describe', onClick: onDescribe, icon: <DescribeMethodIcon /> },
    ...(onLabel ? [{ label: 'Nutri-scan', onClick: onLabel, icon: <LabelMethodIcon /> }] : []),
    { label: 'Manual',   onClick: onManual,   icon: <ManualMethodIcon /> },
  ];

  return (
    // overflow-x-auto with negative margin so the scroll container reaches the full
    // grey container width and card shadows aren't clipped at the edges
    <div className="-mx-3 -mb-3 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-2 px-3 pt-1 pb-1">
        {methods.map(({ label, onClick, icon }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex h-[72px] w-[82px] shrink-0 flex-col items-center justify-center gap-[3px] rounded-[14px] border border-border-subtle bg-surface text-[12px] font-medium text-content shadow-card transition-colors active:bg-accent/5"
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PantryMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 3a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4Zm1 4V5h14v2H5Zm1 2h12v9H6V9Zm3 2a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H9Z" />
    </svg>
  );
}

function CameraMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 7V2H7V4H4V7H2ZM20 7V4H17V2H22V7H20ZM2 22V17H4V20H7V22H2ZM17 22V20H20V17H22V22H17Z" />
      <path d="M12 14.75C12.625 14.75 13.1562 14.5312 13.5938 14.0938C14.0312 13.6562 14.25 13.125 14.25 12.5C14.25 11.875 14.0312 11.3438 13.5938 10.9062C13.1562 10.4688 12.625 10.25 12 10.25C11.375 10.25 10.8438 10.4688 10.4062 10.9062C9.96875 11.3438 9.75 11.875 9.75 12.5C9.75 13.125 9.96875 13.6562 10.4062 14.0938C10.8438 14.5312 11.375 14.75 12 14.75ZM8 16.5C7.725 16.5 7.48958 16.4021 7.29375 16.2063C7.09792 16.0104 7 15.775 7 15.5V9.5C7 9.225 7.09792 8.98958 7.29375 8.79375C7.48958 8.59792 7.725 8.5 8 8.5H9.575L10.5 7.5H13.5L14.425 8.5H16C16.275 8.5 16.5104 8.59792 16.7063 8.79375C16.9021 8.98958 17 9.225 17 9.5V15.5C17 15.775 16.9021 16.0104 16.7063 16.2063C16.5104 16.4021 16.275 16.5 16 16.5H8Z" />
    </svg>
  );
}

function PhotoMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.99961 21.6496C4.26628 21.6496 3.64128 21.3913 3.12461 20.8746C2.60794 20.3579 2.34961 19.7329 2.34961 18.9996V4.99961C2.34961 4.26628 2.60794 3.64128 3.12461 3.12461C3.64128 2.60794 4.26628 2.34961 4.99961 2.34961H18.9996C19.7329 2.34961 20.3579 2.60794 20.8746 3.12461C21.3913 3.64128 21.6496 4.26628 21.6496 4.99961V18.9996C21.6496 19.7329 21.3913 20.3579 20.8746 20.8746C20.3579 21.3913 19.7329 21.6496 18.9996 21.6496H4.99961ZM4.99961 18.9996H18.9996V4.99961H4.99961V18.9996ZM6.87461 17.3996H17.1246C17.4079 17.3996 17.6079 17.2788 17.7246 17.0371C17.8413 16.7954 17.8163 16.5663 17.6496 16.3496L14.8246 12.5496C14.6913 12.3663 14.5163 12.2788 14.2996 12.2871C14.0829 12.2954 13.9079 12.3913 13.7746 12.5746L11.2496 15.9496L9.47461 13.5996C9.34128 13.4163 9.16628 13.3246 8.94961 13.3246C8.73294 13.3246 8.55794 13.4163 8.42461 13.5996L6.34961 16.3496C6.18294 16.5663 6.15794 16.7954 6.27461 17.0371C6.39128 17.2788 6.59128 17.3996 6.87461 17.3996Z" />
    </svg>
  );
}

function DescribeMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.04787 18.0181H14.9584C15.2535 18.0181 15.501 17.9173 15.7006 17.7156C15.9003 17.514 16.0001 17.2655 16.0001 16.9704C16.0001 16.6752 15.9003 16.4277 15.7006 16.2279C15.501 16.0282 15.2535 15.9284 14.9584 15.9284H9.04188C8.74671 15.9284 8.49929 16.0282 8.29963 16.2279C8.09996 16.4277 8.00012 16.6752 8.00012 16.9704C8.00012 17.2655 8.10054 17.514 8.30137 17.7156C8.50221 17.9173 8.75104 18.0181 9.04787 18.0181ZM9.04787 14.0181H14.9584C15.2535 14.0181 15.501 13.9173 15.7006 13.7156C15.9003 13.514 16.0001 13.2655 16.0001 12.9704C16.0001 12.6752 15.9003 12.4277 15.7006 12.2279C15.501 12.0282 15.2535 11.9284 14.9584 11.9284H9.04188C8.74671 11.9284 8.49929 12.0282 8.29963 12.2279C8.09996 12.4277 8.00012 12.6752 8.00012 12.9704C8.00012 13.2655 8.10054 13.514 8.30137 13.7156C8.50221 13.9173 8.75104 14.0181 9.04787 14.0181ZM6.07187 22.2034C5.44221 22.2034 4.90562 21.9816 4.46212 21.5381C4.01863 21.0946 3.79688 20.558 3.79688 19.9284V4.07188C3.79688 3.44221 4.01863 2.90562 4.46212 2.46212C4.90562 2.01862 5.44221 1.79688 6.07187 1.79688H13.1451C13.4488 1.79688 13.7381 1.85388 14.0131 1.96788C14.2881 2.08171 14.5313 2.24429 14.7426 2.45562L19.5446 7.25762C19.756 7.46896 19.9185 7.71212 20.0324 7.98712C20.1464 8.26212 20.2034 8.55146 20.2034 8.85513V19.9284C20.2034 20.558 19.9816 21.0946 19.5381 21.5381C19.0946 21.9816 18.558 22.2034 17.9284 22.2034H6.07187ZM12.9284 7.93438V4.07188H6.07187V19.9284H17.9284V9.07188H14.0659C13.7467 9.07188 13.4773 8.96213 13.2576 8.74263C13.0381 8.52296 12.9284 8.25354 12.9284 7.93438Z" />
    </svg>
  );
}

function LabelMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.07187 18.9284V5.07188V9.12238V8.74312V18.9284ZM8.03587 13.0001H11.5669C11.8502 13.0001 12.0877 12.9043 12.2794 12.7126C12.471 12.521 12.5669 12.2835 12.5669 12.0001C12.5669 11.7168 12.471 11.4793 12.2794 11.2876C12.0877 11.096 11.8502 11.0001 11.5669 11.0001H8.03587C7.75254 11.0001 7.51504 11.096 7.32338 11.2876C7.13171 11.4793 7.03587 11.7168 7.03587 12.0001C7.03587 12.2835 7.13171 12.521 7.32338 12.7126C7.51504 12.9043 7.75254 13.0001 8.03587 13.0001ZM8.03587 16.9644H11.5664C11.85 16.9644 12.0877 16.8685 12.2794 16.6769C12.471 16.4852 12.5669 16.2477 12.5669 15.9644C12.5669 15.681 12.471 15.4435 12.2794 15.2519C12.0877 15.0602 11.85 14.9644 11.5664 14.9644H8.03587C7.75254 14.9644 7.51504 15.0602 7.32338 15.2519C7.13171 15.4435 7.03587 15.681 7.03587 15.9644C7.03587 16.2477 7.13171 16.4852 7.32338 16.6769C7.51504 16.8685 7.75254 16.9644 8.03587 16.9644ZM8.03587 9.03587H15.9644C16.2477 9.03587 16.4852 8.94004 16.6769 8.74837C16.8685 8.55671 16.9644 8.31921 16.9644 8.03587C16.9644 7.75254 16.8685 7.51504 16.6769 7.32338C16.4852 7.13171 16.2477 7.03587 15.9644 7.03587H8.03587C7.75254 7.03587 7.51504 7.13171 7.32338 7.32338C7.13171 7.51504 7.03587 7.75254 7.03587 8.03587C7.03587 8.31921 7.13171 8.55671 7.32338 8.74837C7.51504 8.94004 7.75254 9.03587 8.03587 9.03587ZM5.07187 21.2034C4.44221 21.2034 3.90562 20.9816 3.46212 20.5381C3.01862 20.0946 2.79688 19.558 2.79688 18.9284V5.07188C2.79688 4.44221 3.01862 3.90562 3.46212 3.46212C3.90562 3.01862 4.44221 2.79688 5.07187 2.79688H18.9284C19.558 2.79688 20.0946 3.01862 20.5381 3.46212C20.9816 3.90562 21.2034 4.44221 21.2034 5.07188V10.5C21.2034 10.8192 21.0936 11.0886 20.8741 11.3083C20.6545 11.5278 20.385 11.6375 20.0659 11.6375C19.7467 11.6375 19.4773 11.5278 19.2576 11.3083C19.0381 11.0886 18.9284 10.8192 18.9284 10.5V5.07188H5.07187V18.9284H11.5C11.8193 18.9284 12.0887 19.0381 12.3082 19.2576C12.5277 19.4773 12.6375 19.7467 12.6375 20.0659C12.6375 20.385 12.5277 20.6545 12.3082 20.8741C12.0887 21.0936 11.8193 21.2034 11.5 21.2034H5.07187Z" />
      <path d="M19 20.25C19.625 20.25 20.1562 20.0312 20.5938 19.5938C21.0312 19.1562 21.25 18.625 21.25 18C21.25 17.375 21.0312 16.8438 20.5938 16.4062C20.1562 15.9688 19.625 15.75 19 15.75C18.375 15.75 17.8438 15.9688 17.4062 16.4062C16.9688 16.8438 16.75 17.375 16.75 18C16.75 18.625 16.9688 19.1562 17.4062 19.5938C17.8438 20.0312 18.375 20.25 19 20.25ZM15 22C14.725 22 14.4896 21.9021 14.2938 21.7063C14.0979 21.5104 14 21.275 14 21V15C14 14.725 14.0979 14.4896 14.2938 14.2938C14.4896 14.0979 14.725 14 15 14H16.575L17.5 13H20.5L21.425 14H23C23.275 14 23.5104 14.0979 23.7063 14.2938C23.9021 14.4896 24 14.725 24 15V21C24 21.275 23.9021 21.5104 23.7063 21.7063C23.5104 21.9021 23.275 22 23 22H15Z" />
    </svg>
  );
}

function ManualMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.07187 21.2034C4.44221 21.2034 3.90562 20.9816 3.46212 20.5381C3.01862 20.0946 2.79688 19.558 2.79688 18.9284V5.07188C2.79688 4.44221 3.01862 3.90562 3.46212 3.46212C3.90562 3.01862 4.44221 2.79688 5.07187 2.79688H18.9284C19.558 2.79688 20.0946 3.01862 20.5381 3.46212C20.9816 3.90562 21.2034 4.44221 21.2034 5.07188V15.1451C21.2034 15.4488 21.1464 15.7381 21.0324 16.0131C20.9185 16.2881 20.756 16.5313 20.5446 16.7426L16.7426 20.5446C16.5313 20.756 16.2881 20.9185 16.0131 21.0324C15.7381 21.1464 15.4488 21.2034 15.1451 21.2034H5.07187ZM14.9284 18.9284V17.0001C14.9284 16.4305 15.1312 15.9427 15.5369 15.5369C15.9427 15.1312 16.4305 14.9284 17.0001 14.9284H18.9284V5.07188H5.07187V18.9284H14.9284ZM10.9524 10.0479V15.0001C10.9524 15.297 11.0531 15.5458 11.2546 15.7466C11.4563 15.9475 11.7048 16.0479 12.0001 16.0479C12.2955 16.0479 12.544 15.9475 12.7456 15.7466C12.9471 15.5458 13.0479 15.297 13.0479 15.0001V10.0479H15.0001C15.297 10.0479 15.5458 9.94713 15.7466 9.74563C15.9475 9.54396 16.0479 9.29546 16.0479 9.00013C16.0479 8.70479 15.9475 8.45629 15.7466 8.25463C15.5458 8.05313 15.297 7.95238 15.0001 7.95238H9.00013C8.70329 7.95238 8.45446 8.05313 8.25363 8.25463C8.05279 8.45629 7.95238 8.70479 7.95238 9.00013C7.95238 9.29546 8.05279 9.54396 8.25363 9.74563C8.45446 9.94713 8.70329 10.0479 9.00013 10.0479H10.9524Z" />
    </svg>
  );
}
