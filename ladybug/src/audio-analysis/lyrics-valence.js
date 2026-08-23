/**
 * Optional lyrics_valence feature (see docs/mood-visual-mapping.md §1).
 * Entirely opt-in: only runs if the user pastes lyrics AND supplies their
 * own Anthropic API key (stored in localStorage only, never sent anywhere
 * but https://api.anthropic.com). This is the project's one paid dependency
 * and it costs fractions of a cent per song (a few hundred input tokens).
 */

const STORAGE_KEY = 'mvg_anthropic_api_key';
const MODEL = 'claude-haiku-4-5-20251001';

export function getStoredApiKey() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setStoredApiKey(key) {
  if (key) localStorage.setItem(STORAGE_KEY, key);
  else localStorage.removeItem(STORAGE_KEY);
}

/**
 * @param {string} lyrics
 * @param {string} apiKey
 * @returns {Promise<number>} valence in [-1, 1]
 */
export async function analyzeLyricsValence(lyrics, apiKey) {
  if (!lyrics || !lyrics.trim()) throw new Error('Söz metni boş.');
  if (!apiKey) throw new Error('Anthropic API anahtarı gerekli.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16,
      messages: [
        {
          role: 'user',
          content:
            'Aşağıdaki şarkı sözünün genel duygu tonunu -1.0 (çok negatif/hüzünlü) ile +1.0 (çok pozitif/neşeli) arasında bir ondalık sayı olarak değerlendir. SADECE sayıyı yaz, başka hiçbir şey yazma.\n\n---\n' +
            lyrics.slice(0, 6000),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Anthropic API hatası (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text?.trim() ?? '';
  const value = parseFloat(text);
  if (Number.isNaN(value)) throw new Error(`Beklenmeyen model yanıtı: "${text}"`);
  return Math.max(-1, Math.min(1, value));
}
