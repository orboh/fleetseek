/**
 * Embedding generation via OpenAI text-embedding-3-small (1536 dims).
 * Returns null if OPENAI_API_KEY is not set, allowing graceful fallback to ILIKE search.
 */

const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const MODEL = 'text-embedding-3-small';

/**
 * Build the text to embed from an experience record.
 * Combines title, description, and symptom text for best search quality.
 *
 * @param {object} experience - experience fields (title, description, data)
 * @returns {string}
 */
function buildEmbedText(experience) {
  const parts = [];
  if (experience.title) parts.push(experience.title);
  if (experience.description) parts.push(experience.description);
  const data = experience.data;
  if (data && typeof data === 'object') {
    const symptomText = data?.symptoms?.observed_behavior?.text;
    if (symptomText) parts.push(symptomText);
    if (data.root_cause) parts.push(data.root_cause);
    if (data.task) parts.push(data.task);
  }
  return parts.join(' ').slice(0, 8000); // stay well within token limits
}

/**
 * Generate an embedding vector for a text string.
 *
 * @param {string} text
 * @returns {Promise<number[]|null>} 1536-dim vector, or null if unavailable
 */
async function generateEmbedding(text) {
  const openai = getClient();
  if (!openai || !text?.trim()) return null;
  try {
    const response = await openai.embeddings.create({ model: MODEL, input: text });
    return response.data[0].embedding;
  } catch (err) {
    console.error('[embedding] generation failed:', err.message);
    return null;
  }
}

/**
 * Generate an embedding for an experience object.
 *
 * @param {object} experience
 * @returns {Promise<number[]|null>}
 */
async function embedExperience(experience) {
  return generateEmbedding(buildEmbedText(experience));
}

/**
 * @returns {boolean} true if OpenAI key is configured
 */
function isEmbeddingAvailable() {
  return Boolean(process.env.OPENAI_API_KEY);
}

module.exports = { generateEmbedding, embedExperience, buildEmbedText, isEmbeddingAvailable };
