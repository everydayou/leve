/**
 * FoodItemFormContent — single source of truth for all 4 food-item entry/edit surfaces:
 *
 *   pantry-new    Pantry › +Add food › New food item        (empty fields, no "save to pantry")
 *   pantry-edit   Pantry › card › Edit food item            (pre-filled, delete button, no "save to pantry")
 *   basket-edit   Basket › card › Edit                      (pre-filled, "save to pantry" when not yet in pantry)
 *   basket-manual Basket › Other methods › Add manually     (empty, "save to pantry" checkbox)
 *
 * Callers own the navigation header (Sheet title or OverlayNav) and any outer wrapper.
 * This component renders only the scrollable form content, from photo through CTAs.
 */

import { useRef, useState } from 'react';
import { findByName } from '../../domain/pantry';
import { Button, Icon, LabeledInput, MeasurementTypeSelector, NumberField } from '../kit';
import type { FoodItem, MeasurementType } from '../../domain/types';

// ── Shared icon ───────────────────────────────────────────────────────────────

function DeletePhotoIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.75 18.1673C5.125 18.1673 4.60069 17.9555 4.17708 17.5319C3.75347 17.1083 3.54167 16.584 3.54167 15.959V4.91732C3.23611 4.91732 2.97569 4.80968 2.76042 4.5944C2.54514 4.37912 2.4375 4.11871 2.4375 3.81315C2.4375 3.5076 2.54514 3.24718 2.76042 3.0319C2.97569 2.81662 3.23611 2.70898 3.54167 2.70898H7.45833C7.45833 2.43121 7.55417 2.1951 7.74583 2.00065C7.9375 1.80621 8.175 1.70898 8.45833 1.70898H11.5833C11.8667 1.70898 12.1042 1.80482 12.2958 1.99648C12.4875 2.18815 12.5833 2.42565 12.5833 2.70898H16.5C16.8056 2.70898 17.066 2.81662 17.2813 3.0319C17.4965 3.24718 17.6042 3.5076 17.6042 3.81315C17.6042 4.11871 17.4965 4.37912 17.2813 4.5944C17.066 4.80968 16.8056 4.91732 16.5 4.91732V15.959C16.5 16.584 16.2882 17.1083 15.8646 17.5319C15.441 17.9555 14.9167 18.1673 14.2917 18.1673H5.75ZM14.2917 4.91732H5.75V15.959H14.2917V4.91732ZM8.94792 13.9486C9.16319 13.7333 9.27083 13.4729 9.27083 13.1673V7.70898C9.27083 7.40343 9.16319 7.14301 8.94792 6.92773C8.73264 6.71246 8.47222 6.60482 8.16667 6.60482C7.86111 6.60482 7.60069 6.71246 7.38542 6.92773C7.17014 7.14301 7.0625 7.40343 7.0625 7.70898V13.1673C7.0625 13.4729 7.17014 13.7333 7.38542 13.9486C7.60069 14.1638 7.86111 14.2715 8.16667 14.2715C8.47222 14.2715 8.73264 14.1638 8.94792 13.9486ZM12.6563 13.9486C12.8715 13.7333 12.9792 13.4729 12.9792 13.1673V7.70898C12.9792 7.40343 12.8715 7.14301 12.6563 6.92773C12.441 6.71246 12.1806 6.60482 11.875 6.60482C11.5694 6.60482 11.309 6.71246 11.0938 6.92773C10.8785 7.14301 10.7708 7.40343 10.7708 7.70898V13.1673C10.7708 13.4729 10.8785 13.7333 11.0938 13.9486C11.309 14.1638 11.5694 14.2715 11.875 14.2715C12.1806 14.2715 12.441 14.1638 12.6563 13.9486Z" fill="currentColor"/>
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type FoodItemFormMode = 'pantry-new' | 'pantry-edit' | 'basket-edit' | 'basket-manual';

export type FoodItemFormValues = {
  name: string;
  measurementType: MeasurementType;
  referenceAmount: number;
  calories: number;
  protein: number;
  carbs: number;
  fiber: number;
  fat: number;
  photo: string | undefined;
  /** Always false in pantry modes. In basket modes, reflects the checkbox state. */
  saveToPantry: boolean;
};

export type FoodItemFormInitial = {
  name?: string;
  measurementType?: MeasurementType;
  referenceAmount?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fiber?: number;
  fat?: number;
  photo?: string;
  /** basket-edit only: when set, hides the "Save to pantry" checkbox */
  pantryItemId?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FoodItemFormContent({
  mode,
  initial = {},
  existingItems = [],
  existingItemId,
  onSave,
  onCancel,
  onDelete,
  onPhotoChange,
}: {
  mode: FoodItemFormMode;
  initial?: FoodItemFormInitial;
  existingItems?: FoodItem[];
  existingItemId?: string;
  onSave: (values: FoodItemFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onPhotoChange?: (url: string | undefined) => void;
}) {
  const [name, setName]   = useState(initial.name ?? '');
  const [mType, setMType] = useState<MeasurementType>(initial.measurementType ?? 'per_100g');
  const [srvG, setSrvG]   = useState(
    initial.measurementType === 'per_serving' && (initial.referenceAmount ?? 0) > 1
      ? String(initial.referenceAmount)
      : ''
  );
  const [cal, setCal]   = useState(initial.calories != null ? String(Math.round(initial.calories))            : '');
  const [pro, setPro]   = useState(initial.protein  != null ? String(Math.round(initial.protein  * 10) / 10) : '');
  const [carb, setCarb] = useState(initial.carbs    != null ? String(Math.round(initial.carbs    * 10) / 10) : '');
  const [fib, setFib]   = useState(initial.fiber    != null ? String(Math.round(initial.fiber    * 10) / 10) : '');
  const [fat, setFat]   = useState(initial.fat      != null ? String(Math.round(initial.fat      * 10) / 10) : '');
  const [photo, setPhoto]           = useState<string | undefined>(initial.photo);
  const [saveToPantry, setSaveToPantry] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isSrv        = mType === 'per_serving';
  const isPantryMode = mode === 'pantry-new' || mode === 'pantry-edit';
  const isBasketEdit = mode === 'basket-edit';

  const showSaveToPantry =
    mode === 'basket-manual' || (isBasketEdit && !initial.pantryItemId);

  const checkDuplicate =
    isPantryMode || (mode === 'basket-manual' && saveToPantry);
  const duplicate = checkDuplicate ? findByName(existingItems, name, existingItemId) : undefined;
  const blocked   = !!duplicate;
  const canSave   = name.trim().length > 0 && !blocked;

  const ctaLabel =
    mode === 'pantry-new'  ? 'Save to pantry' :
    mode === 'pantry-edit' ? 'Save changes'   :
    mode === 'basket-edit' ? 'Save'            :
    /* basket-manual */      'Add to meal';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setPhoto(url);
      onPhotoChange?.(url);
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoRemove() {
    setPhoto(undefined);
    onPhotoChange?.(undefined);
  }

  function handleSave() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      measurementType: mType,
      referenceAmount: isSrv ? (+srvG || 1) : 100,
      calories: +cal  || 0,
      protein:  +pro  || 0,
      carbs:    +carb || 0,
      fiber:    +fib  || 0,
      fat:      +fat  || 0,
      photo,
      saveToPantry: showSaveToPantry ? saveToPantry : false,
    });
  }

  return (
    <div className="space-y-3 pb-4">

      {/* ── Photo ─────────────────────────────────────────────────────────── */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      {photo ? (
        <div className="flex justify-center">
          <div className="h-64 w-64 rounded-[20px] shadow-card-lg">
            <div className="relative h-full w-full overflow-hidden rounded-[20px]">
              <img src={photo} alt="Food" className="h-full w-full object-cover" />
              <button
                onClick={handlePhotoRemove}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
                aria-label="Remove photo"
              >
                <DeletePhotoIcon />
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-white px-4 py-1.5 text-[16px] font-semibold text-white bg-black/20 active:bg-black/40"
              >
                Change photo
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-border-field py-4 text-subhead font-medium text-content-secondary active:border-accent active:text-accent"
        >
          <Icon name="camera" size={18} strokeWidth={1.8} />
          Add photo
        </button>
      )}

      {/* ── Name ──────────────────────────────────────────────────────────── */}
      <LabeledInput
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Homemade granola"
        invalid={blocked}
      />
      {blocked && (
        <p className="text-caption text-danger">This name already exists in your pantry</p>
      )}

      {/* ── Save to pantry ────────────────────────────────────────────────── */}
      {showSaveToPantry && (
        <label className="flex cursor-pointer select-none items-center gap-2 text-subhead text-content-secondary">
          <input
            type="checkbox"
            checked={saveToPantry}
            onChange={(e) => setSaveToPantry(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Save to pantry
        </label>
      )}

      {/* ── Measurement type ──────────────────────────────────────────────── */}
      <MeasurementTypeSelector value={mType} onChange={setMType} />

      {/* ── Calories (paired with serving size when per_serving) ──────────── */}
      {isSrv ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Serving size (g)"  value={srvG} set={setSrvG} centerAt={100} />
          <NumberField label="Calories (kcal)"   value={cal}  set={setCal}  centerAt={350} />
        </div>
      ) : (
        <NumberField label="Calories (kcal · per 100g)" value={cal} set={setCal} max={5000} step={1} centerAt={350} />
      )}

      {/* ── Macros ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Protein (g)" value={pro}  set={setPro}  max={500} step={1} centerAt={25} />
        <NumberField label="Carbs (g)"   value={carb} set={setCarb} max={800} step={1} centerAt={30} />
        <NumberField label="Fat (g)"     value={fat}  set={setFat}  max={400} step={1} centerAt={12} />
        <NumberField label="Fiber (g)"   value={fib}  set={setFib}  max={200} step={1} centerAt={5}  />
      </div>

      {/* ── Basket-edit context hint ───────────────────────────────────────── */}
      {isBasketEdit && (
        <p className="text-caption text-content-secondary">
          {isSrv
            ? 'Values are per serving. Adjust quantity in the basket.'
            : 'Values are per 100g. Adjust grams in the basket.'}
        </p>
      )}

      {/* ── CTAs ──────────────────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1">
        <Button size="lg" onClick={handleSave} disabled={!canSave}>
          {ctaLabel}
        </Button>
        {onDelete && (
          <Button variant="outline" onClick={onDelete}>
            Delete food
          </Button>
        )}
        <button
          onClick={onCancel}
          className="w-full py-3 text-body font-semibold text-content active:opacity-70"
        >
          Cancel
        </button>
      </div>

    </div>
  );
}
