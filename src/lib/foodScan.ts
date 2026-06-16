/** Client-side service for the AI food photo scan feature.
 *  Calls the Vercel proxy (food-scan-api) which holds the Anthropic API key.
 *  Set VITE_FOOD_SCAN_API_URL in .env.local to the deployed Vercel URL,
 *  e.g. VITE_FOOD_SCAN_API_URL=https://food-scan-api.vercel.app */

export interface ScannedFood {
  name: string;
  /** Short description of the food item, e.g. "Partial torn cinnamon roll with cinnamon-sugar filling". */
  description?: string;
  estimatedGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fiber: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
}

const API_URL = (import.meta.env.VITE_FOOD_SCAN_API_URL as string | undefined) ?? '';

export async function scanFood(imageDataUrl: string): Promise<ScannedFood[]> {
  if (!API_URL) {
    throw new Error('Food scan not configured. Set VITE_FOOD_SCAN_API_URL in .env.local.');
  }

  const response = await fetch(`${API_URL}/api/analyze-food`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Scan failed (${response.status})`);
  }

  const data = await response.json() as { foods?: ScannedFood[] };
  return Array.isArray(data.foods) ? data.foods : [];
}
