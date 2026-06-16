import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { PREVIEW } from './state/repos';
import { resetMemory, seedMemoryDemo } from './data/memoryRepositories';

// Only meaningful in the preview (in-memory) build — Dexie needs IndexedDB,
// which jsdom doesn't have. Run with: VITE_PREVIEW=true npm test
const d = PREVIEW ? describe : describe.skip;

d('preview app (real render of all components + memory repo)', () => {
  // App boots clean now; load the opt-in sample dataset for these tests.
  beforeEach(() => { resetMemory(); seedMemoryDemo(); });

  it('renders the Today screen with the calories-left budget (goal seeded)', async () => {
    render(<MemoryRouter initialEntries={['/today']}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Calories left/i)).toBeInTheDocument());
    expect(screen.getByText('Frequent foods')).toBeInTheDocument();
    expect((await screen.findAllByText('Chicken breast')).length).toBeGreaterThan(0); // seeded
    expect(screen.getByText('Deficit')).toBeInTheDocument(); // stat still shown
  });

  it('navigates to Goal and shows the on-track verdict + weight stats', async () => {
    render(<MemoryRouter initialEntries={['/goal']}><App /></MemoryRouter>);
    expect(await screen.findByText('Weight trend vs target')).toBeInTheDocument();
    expect(screen.getAllByText(/On track|Ahead|Behind/).length).toBeGreaterThan(0);
  });


  it('Add-entry has Food + Activity (no Weight) and a New food path', async () => {
    render(<MemoryRouter initialEntries={['/today']}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText('Add entry'));
    expect(await screen.findByText('From pantry')).toBeInTheDocument();
    expect(screen.getByText('+ New food')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^activity$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^weight$/i })).toBeNull();
  });

  it('tapping a log entry lets you delete it', async () => {
    render(<MemoryRouter initialEntries={['/today']}><App /></MemoryRouter>);
    const rows = await screen.findAllByText(/kcal ›/);
    const before = rows.length;
    fireEvent.click(rows[0]);
    fireEvent.click(await screen.findByText('Delete entry'));
    await waitFor(() => expect(screen.queryAllByText(/kcal ›/).length).toBe(before - 1));
  });

  it('Goal setup shows live intensity for 4kg (moderate)', async () => {
    render(<MemoryRouter initialEntries={['/goal-setup']}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Continue'));
    expect(await screen.findByText('How hard is this?')).toBeInTheDocument();
    expect(screen.getByText(/Moderate & sustainable\./)).toBeInTheDocument();
  });
});

d('clean first run (no seed)', () => {
  beforeEach(() => { resetMemory(); });

  it('Today has no logged entries and no Frequent foods section', async () => {
    render(<MemoryRouter initialEntries={['/today']}><App /></MemoryRouter>);
    expect(await screen.findByText(/Nothing logged yet/)).toBeInTheDocument();
    expect(screen.queryByText('Frequent foods')).toBeNull();
  });

  it('Goal screen prompts to set a goal when there is none', async () => {
    render(<MemoryRouter initialEntries={['/goal']}><App /></MemoryRouter>);
    expect(await screen.findByText('Set a goal')).toBeInTheDocument();
  });

  it('Pantry starts empty', async () => {
    render(<MemoryRouter initialEntries={['/pantry']}><App /></MemoryRouter>);
    expect(await screen.findByText(/Your pantry is empty/)).toBeInTheDocument();
  });
});
