import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';

import { Button, FilterPills, Sheet, EmptyState, Icon } from '../kit';
import { Thumb } from '../components/PhotoPicker';
import { FoodItemFormContent } from '../components/FoodItemForm';
import type { FoodItemFormValues } from '../components/FoodItemForm';

import { hapticLight } from '../../lib/haptics';
import type { DayContext } from '../AppShell';
import type { ShowToast } from '../components/Toaster';
import type { FoodItem, MeasurementType } from '../../domain/types';



export function PantryScreen() {
  const { showToast } = useOutletContext<DayContext>();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | MeasurementType>('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FoodItem | null>(null);
  // rawItems is null while IndexedDB is still loading; [] means truly empty.
  // Keep them separate so we never flash the EmptyState before data arrives.
  const rawItems = useLive(() => repos.foodItems.all(), []);
  const items = rawItems ?? [];

  const filtered = items
    .filter((i) => filter === 'all' || i.measurementType === filter)
    .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pb-6">
      <header className="flex items-start justify-between px-6 pt-4">
        <h1 className="text-title font-semibold">Pantry</h1>
        <Button variant="ghost" size="sm" fullWidth={false} className="!font-normal !text-accent-hover -mr-3.5" onClick={() => setAdding(true)}>+ Add food</Button>
      </header>

      <div className="px-6">
        {/* Search — pill shape, sunken bg. Border is transparent at rest,
            accent on focus-within. Input itself has no outline. */}
        <div className="mt-3 flex items-center gap-2 rounded-pill border border-transparent bg-surface-sunken px-4 py-2.5 transition-colors focus-within:border-accent">
          <Icon name="search" size={18} className="shrink-0 text-content-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search foods…"
            className="w-full bg-transparent text-subhead text-content placeholder:text-content-muted"
            style={{ outline: 'none' }}
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="shrink-0 text-content-muted active:text-content"
            >
              <Icon name="close" size={16} strokeWidth={2.25} />
            </button>
          )}
        </div>
        {/* Content-hugging filter pills (white selected pill, like a segmented
            control, but each sized to its label). */}
        <FilterPills<'all' | MeasurementType>
          className="mt-3"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'per_100g', label: 'per 100g' },
            { value: 'per_serving', label: 'per serving' },
          ]}
        />
      </div>

      {rawItems != null && (
        <>
          <p className="px-6 pt-4 text-callout font-bold text-content">{filtered.length} items</p>
          {/* The list sits in a single card container. */}
          <div className="mx-6 mt-1 overflow-hidden rounded-card border border-border-subtle bg-surface">
            <ul className="divide-y divide-border-subtle">
              {filtered.map((i) => (
                <li key={i.id}>
                  <button onClick={() => { hapticLight(); setEditing(i); }} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken">
                    <Thumb photo={i.photo} radius="rounded-[8px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-callout font-normal leading-[1.2] text-content">{i.name}</p>
                      <p className="mt-[4px] text-subhead leading-none text-content-secondary">{i.measurementType === 'per_100g' ? 'per 100g' : 'per serving'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-callout font-bold leading-[1.2] text-content">{i.calories} kcal</p>
                      <p className="mt-[4px] text-subhead leading-none text-content-secondary">{i.protein}g Protein</p>
                    </div>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li>
                  {items.length === 0 ? (
                    <EmptyState
                      icon="foodIcon"
                      title="Your pantry is empty"
                      description="Add foods you eat often so you can log them in one tap."
                      action={<Button icon="plus" onClick={() => setAdding(true)}>Add food</Button>}
                    />
                  ) : (
                    <p className="px-6 py-10 text-center text-subhead text-content-muted">No foods match.</p>
                  )}
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {adding && <FoodItemForm items={items} showToast={showToast} onClose={() => setAdding(false)} />}
      {editing && <FoodItemForm item={editing} items={items} showToast={showToast} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Add (no item) or edit (item provided) a pantry food — uses shared FoodItemFormContent. */
function FoodItemForm({ item, items, onClose, showToast }: {
  item?: FoodItem;
  items: FoodItem[];
  onClose: () => void;
  showToast?: ShowToast;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSave(values: FoodItemFormValues) {
    await repos.foodItems.put({
      id: item?.id ?? newId(),
      name: values.name,
      measurementType: values.measurementType,
      referenceAmount: values.referenceAmount,
      calories: values.calories,
      protein:  values.protein,
      carbs:    values.carbs,
      fiber:    values.fiber,
      fat:      values.fat,
      photo:    values.photo,
      isArchived: item?.isArchived ?? false,
    });
    onClose();
  }

  async function handleDelete() {
    if (!item) return;
    const snapshot = item;
    await repos.foodItems.remove(snapshot.id);
    showToast?.('Food deleted', async () => repos.foodItems.put(snapshot));
    onClose();
  }

  return (
    <>
      <Sheet title={item ? 'Edit food item' : 'New food item'} onClose={onClose} forceExpanded>
        <FoodItemFormContent
          mode={item ? 'pantry-edit' : 'pantry-new'}
          initial={item ? {
            name:              item.name,
            measurementType:   item.measurementType,
            referenceAmount:   item.referenceAmount,
            calories:          item.calories,
            protein:           item.protein,
            carbs:             item.carbs,
            fiber:             item.fiber,
            fat:               item.fat,
            photo:             item.photo,
          } : undefined}
          existingItems={items}
          existingItemId={item?.id}
          onSave={handleSave}
          onCancel={onClose}
          onDelete={item ? () => setConfirmingDelete(true) : undefined}
        />
      </Sheet>
      {confirmingDelete && item && (
        <Sheet title="Delete food?" onClose={() => setConfirmingDelete(false)}>
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">
              <span className="font-medium text-content">"{item.name}"</span> will be removed from your pantry. Existing log entries won't be affected.
            </p>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
