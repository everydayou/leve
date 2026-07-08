/** Client-side service for the AI food photo scan feature.
 *  Two backends are supported:
 *   1. The shared Vercel proxy (food-scan-api), which holds Marco's own
 *      Anthropic API key server-side. This is the default for everyone.
 *   2. Bring-your-own-key: if the user has saved their own Anthropic key in
 *      Settings → AI Food Scan, calls go straight from the device to
 *      Anthropic instead, bypassing the proxy entirely. See lib/apiKey.ts.
 *  Set VITE_FOOD_SCAN_API_URL in .env.local to the deployed Vercel URL,
 *  e.g. VITE_FOOD_SCAN_API_URL=https://food-scan-api.vercel.app */

import { getApiKey } from './apiKey';

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

/** Single source of truth for whether the AI food-scan feature (Camera/
 *  Photo/Nutri-scan) is configured — gates its UI everywhere it appears
 *  (Day's-log basket, Pantry meal builder, FAB speed dial). Unaffected by
 *  bring-your-own-key: a user's own key changes WHICH backend handles a
 *  request, not whether the feature is offered in the first place. */
export const SCAN_ENABLED = !!API_URL;

/** Thrown whenever a scan/describe call couldn't reach a working AI
 *  backend — shared proxy down/misconfigured, network failure, or the
 *  user's own key being missing/invalid. Distinct from a plain Error (e.g.
 *  "no food found in that photo", which is a normal result, not a backend
 *  problem) so callers can offer a direct route into Settings → AI Food
 *  Scan instead of just showing "scan failed". `actionLabel` is always the
 *  toast/inline action button's label; it always opens the same
 *  bring-your-own-key sheet (see lib/apiKey.ts's requestApiKeySheet). */
export class FoodScanError extends Error {
  actionLabel: string;
  constructor(message: string, actionLabel = 'Add key') {
    super(message);
    this.name = 'FoodScanError';
    this.actionLabel = actionLabel;
  }
}

export async function scanFood(imageDataUrl: string): Promise<ScannedFood[]> {
  const userKey = await getApiKey();
  if (userKey) return scanFoodDirect(imageDataUrl, userKey);
  return proxyRequest('/api/analyze-food', { imageDataUrl });
}

/** Estimate nutrition from a plain-text meal description.
 *  Requires a /api/describe-food endpoint on the same API server. */
export async function describeFood(description: string): Promise<ScannedFood[]> {
  const userKey = await getApiKey();
  if (userKey) return describeFoodDirect(description, userKey);
  return proxyRequest('/api/describe-food', { description });
}

// ── Shared Vercel proxy (Marco's key) ─────────────────────────────────────

async function proxyRequest(path: string, body: unknown): Promise<ScannedFood[]> {
  if (!API_URL) {
    throw new FoodScanError("AI food scan isn't available right now. Connect your own Claude API key to use it.");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new FoodScanError('Could not reach the AI scanner. Connect your own Claude API key to keep scanning.');
  }

  if (!response.ok) {
    throw new FoodScanError('The shared scan service is unavailable right now. Connect your own Claude API key to keep scanning.');
  }

  const data = await response.json() as { foods?: ScannedFood[] };
  return Array.isArray(data.foods) ? data.foods : [];
}

// ── Bring-your-own-key: direct-to-Anthropic path ──────────────────────────
// No server involved — the device calls api.anthropic.com straight with the
// user's own key, via the `anthropic-dangerous-direct-browser-access` header
// Anthropic provides for exactly this (the key never touches any server of
// ours). Structured output is forced via tool use so we always get back
// valid ScannedFood[] instead of having to parse free-form text.

const ANTHROPIC_MODEL = 'claude-sonnet-5';

const FOOD_TOOL = {
  name: 'record_foods',
  description: 'Record the food item(s) identified, with estimated nutrition per item.',
  input_schema: {
    type: 'object',
    properties: {
      foods: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string', description: 'Short description of exactly what was identified — portion, state, etc.' },
            estimatedGrams: { type: 'number' },
            calories: { type: 'number' },
            protein: { type: 'number', description: 'grams' },
            carbs: { type: 'number', description: 'grams' },
            fiber: { type: 'number', description: 'grams' },
            fat: { type: 'number', description: 'grams' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['name', 'estimatedGrams', 'calories', 'protein', 'carbs', 'fiber', 'fat', 'confidence'],
        },
      },
    },
    required: ['foods'],
  },
};

async function callAnthropicDirect(apiKey: string, userContent: unknown): Promise<ScannedFood[]> {
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        tools: [FOOD_TOOL],
        tool_choice: { type: 'tool', name: 'record_foods' },
        messages: [{ role: 'user', content: userContent }],
      }),
    });
  } catch {
    throw new FoodScanError('Could not reach Claude. Check your connection, or check your key in Settings → AI Food Scan.', 'Fix key');
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new FoodScanError('Your Claude API key was rejected. Check it in Settings → AI Food Scan.', 'Fix key');
    }
    throw new FoodScanError("Claude couldn't process that. Check your API key or usage limits in Settings → AI Food Scan.", 'Fix key');
  }

  const data = await response.json() as { content?: Array<{ type: string; input?: { foods?: ScannedFood[] } }> };
  const toolUse = data.content?.find((b) => b.type === 'tool_use');
  return toolUse?.input?.foods ?? [];
}

function parseDataUrl(imageDataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:(image\/\w+);base64,(.*)$/.exec(imageDataUrl);
  if (!match) throw new Error('Unrecognized image format.');
  return { mediaType: match[1], base64: match[2] };
}

async function scanFoodDirect(imageDataUrl: string, apiKey: string): Promise<ScannedFood[]> {
  const { mediaType, base64 } = parseDataUrl(imageDataUrl);
  return callAnthropicDirect(apiKey, [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
    { type: 'text', text: 'Identify every distinct food item visible in this photo and estimate its nutrition. Use the record_foods tool.' },
  ]);
}

async function describeFoodDirect(description: string, apiKey: string): Promise<ScannedFood[]> {
  return callAnthropicDirect(apiKey, [
    { type: 'text', text: `Estimate the nutrition for this meal description: "${description}". Break it into distinct food items if it describes more than one. Use the record_foods tool.` },
  ]);
}
