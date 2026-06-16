import { useState } from 'react';
import {
  Text, Button, IconButton, Surface, Card, Field, Chip, Badge, Divider,
  SectionLabel, ListRow, SegmentedControl, TopBar, FloatingTabBar, Fab,
  ProgressBar, ProgressRing, StatTile, Toast, EmptyState, Skeleton, Icon,
  type TabItem,
} from '../kit';

const TABS: TabItem[] = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'goal', label: 'Goal', icon: 'goal' },
  { key: 'pantry', label: 'Pantry', icon: 'pantry' },
  { key: 'account', label: 'Account', icon: 'account' },
];

const SWATCHES = [
  ['surface', 'bg-surface'], ['surface-sunken', 'bg-surface-sunken'], ['surface-muted', 'bg-surface-muted'],
  ['accent', 'bg-accent'], ['accent-soft', 'bg-accent-soft'],
  ['success', 'bg-success'], ['warn', 'bg-warn'], ['danger', 'bg-danger'],
  ['content', 'bg-content'], ['content-secondary', 'bg-content-secondary'],
  ['border-subtle', 'bg-border-subtle'], ['border-strong', 'bg-border-strong'],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <Text variant="eyebrow" tone="secondary" as="h3">{title}</Text>
      {children}
    </div>
  );
}

/* Renders the full kit. Wrapped once for light and once (in a .dark subtree)
   for dark, so token changes are visible in both at once. */
function Gallery() {
  const [seg, setSeg] = useState<'weekly' | 'monthly' | 'total'>('weekly');
  const [tab, setTab] = useState('today');
  const [name, setName] = useState('Greek yogurt');

  return (
    <div className="relative space-y-7 bg-surface-muted p-5 pb-40">
      <Section title="Tokens">
        <div className="grid grid-cols-3 gap-2">
          {SWATCHES.map(([label, cls]) => (
            <div key={label} className="space-y-1">
              <div className={`h-10 rounded-control border border-border-subtle ${cls}`} />
              <span className="block text-micro text-content-secondary">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type scale">
        <Card className="space-y-1.5">
          <Text variant="display" as="p">Display 30</Text>
          <Text variant="title" as="p">Title 22</Text>
          <Text variant="headline" as="p">Headline 17</Text>
          <Text variant="body" as="p">Body 17 — the quick brown fox.</Text>
          <Text variant="subhead" tone="secondary" as="p">Subhead 15 secondary</Text>
          <Text variant="footnote" tone="muted" as="p">Footnote 13 muted</Text>
          <Text variant="eyebrow" tone="secondary" as="p">Eyebrow / caption</Text>
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="space-y-2">
          <Button variant="solid" icon="check">Solid (accent)</Button>
          <Button variant="tinted" icon="plus">Tinted</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive" icon="trash">Destructive</Button>
          <div className="flex gap-2">
            <Button size="sm" fullWidth={false}>Small</Button>
            <Button size="md" fullWidth={false}>Medium</Button>
            <Button size="lg" fullWidth={false}>Large</Button>
            <Button fullWidth={false} disabled>Disabled</Button>
          </div>
          <div className="flex items-center gap-2">
            <IconButton icon="edit" label="Edit" variant="ghost" />
            <IconButton icon="search" label="Search" variant="tinted" />
            <IconButton icon="plus" label="Add" variant="solid" />
            <Fab label="Add entry" size={48} />
          </div>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="space-y-3">
          <Field label="Food name" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Calories" type="number" placeholder="0" suffix="kcal" defaultValue="120" />
          <Field label="Weight" suffix="kg" defaultValue="184,2" invalid hint="Use numbers only" />
          <SegmentedControl
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'total', label: 'Total' },
            ]}
          />
        </div>
      </Section>

      <Section title="Chips & badges">
        <div className="flex flex-wrap gap-2">
          <Chip icon="flame" selected>Eggs</Chip>
          <Chip icon="flame">Oats</Chip>
          <Chip>Chicken</Chip>
          <Badge status="success">On track</Badge>
          <Badge status="warn">Slightly behind</Badge>
          <Badge status="danger">Behind</Badge>
          <Badge status="accent">New</Badge>
        </div>
      </Section>

      <Section title="Cards & list">
        <SectionLabel>Grouped list</SectionLabel>
        <Card padded={false}>
          <ListRow leading={<Icon name="scale" />} title="Weight" subtitle="Latest weigh-in"
            trailing="84.2 kg" chevron onClick={() => {}} />
          <Divider inset />
          <ListRow leading={<Icon name="flame" />} title="Bouldering" subtitle="Activity"
            trailing="+420 kcal" chevron onClick={() => {}} />
        </Card>
        <Surface tone="sunken">
          <Text variant="subhead" tone="secondary">Sunken inset surface</Text>
        </Surface>
      </Section>

      <Section title="Data display">
        <Card>
          <div className="flex items-center justify-between">
            <StatTile label="Calories left" value="640" unit="kcal" foot="of 2,100 budget" tone="accent" />
            <ProgressRing value={0.68} status="accent" size={72} stroke={7}>
              <Text variant="headline">68%</Text>
            </ProgressRing>
          </div>
          <div className="mt-3"><ProgressBar value={0.68} status="success" /></div>
          <div className="mt-4 flex justify-between">
            <StatTile label="Protein" value="92" unit="g" />
            <StatTile label="Deficit" value="-540" tone="success" />
            <StatTile label="To go" value="2.8" unit="kg" />
          </div>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Toast status="success">Saved to pantry</Toast>
          <Toast status="danger">Already in pantry</Toast>
        </div>
        <Card className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
        <Card padded={false}>
          <EmptyState icon="goal" title="No active goal"
            description="Set a target weight and date to start tracking."
            action={<Button icon="plus">Set a goal</Button>} />
        </Card>
      </Section>

      <Section title="Glass chrome">
        <Text variant="footnote" tone="secondary">Top bar + floating tab bar render frosted over content.</Text>
      </Section>

      {/* Glass chrome shown in context over the scrolling content above. */}
      <TopBar title="Goal setup" leading="close" trailing={<IconButton icon="check" label="Save" variant="ghost" size={32} />} />
      <FloatingTabBar items={TABS} active={tab} onSelect={setTab} onAction={() => {}} />
    </div>
  );
}

export function StyleguideScreen() {
  return (
    <div className="min-h-[100dvh] bg-surface-muted">
      <div className="mx-auto grid max-w-5xl gap-6 p-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-border-subtle">
          <div className="bg-surface px-4 py-2"><Text variant="eyebrow" tone="secondary">Light</Text></div>
          <Gallery />
        </div>
        <div className="dark overflow-hidden rounded-card border border-border-subtle">
          <div className="bg-surface px-4 py-2"><Text variant="eyebrow" tone="secondary">Dark</Text></div>
          <Gallery />
        </div>
      </div>
    </div>
  );
}
