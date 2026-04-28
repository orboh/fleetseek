/**
 * fleetseek search <query> [--type debug_note|skill]
 *
 * Searches experiences via POST /api/v1/experiences/search and renders
 * results in a fixed-width table.
 */

import { readConfig } from '../config.js';
import { apiPost } from '../api.js';

/**
 * Truncate a string to maxLen characters, appending "..." if truncated.
 * @param {string|null|undefined} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str) return '—';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Pad a string to exactly width characters (left-aligned).
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function pad(str, width) {
  return str.padEnd(width, ' ');
}

/**
 * Render experiences as an ASCII table.
 * Columns: id (24), title (40), trust_score (11), status (16)
 * @param {Array<Record<string, unknown>>} experiences
 */
function renderTable(experiences) {
  const COL = { id: 24, title: 40, score: 11, status: 16 };
  const sep = '─'.repeat(COL.id + COL.title + COL.score + COL.status + 7);

  const header =
    '│ ' +
    pad('ID', COL.id) +
    ' │ ' +
    pad('Title', COL.title) +
    ' │ ' +
    pad('trust_score', COL.score) +
    ' │ ' +
    pad('status', COL.status) +
    ' │';

  console.log('┌' + sep + '┐');
  console.log(header);
  console.log('├' + sep + '┤');

  if (experiences.length === 0) {
    const emptyMsg = 'No results found.';
    const totalWidth = COL.id + COL.title + COL.score + COL.status + 7;
    console.log('│ ' + emptyMsg.padEnd(totalWidth - 2, ' ') + ' │');
  } else {
    for (const exp of experiences) {
      const id = truncate(String(exp.id || ''), COL.id);
      const title = truncate(String(exp.title || ''), COL.title);
      const score =
        exp.trust_score != null ? String(Math.round(Number(exp.trust_score))) : '—';
      const status = truncate(String(exp.status || ''), COL.status);

      const row =
        '│ ' +
        pad(id, COL.id) +
        ' │ ' +
        pad(title, COL.title) +
        ' │ ' +
        pad(score, COL.score) +
        ' │ ' +
        pad(status, COL.status) +
        ' │';
      console.log(row);
    }
  }

  console.log('└' + sep + '┘');
}

/**
 * `fleetseek search <query>`
 *
 * @param {string} query
 * @param {{ type?: string }} options
 */
export async function searchExperiences(query, options) {
  const { api_url } = readConfig();

  const baseUrl = api_url || process.env.FLEETSEEK_API_URL || 'http://localhost:3001';

  if (options.type && !['debug_note', 'skill'].includes(options.type)) {
    console.error('Error: --type must be "debug_note" or "skill".');
    process.exit(1);
  }

  const payload = {
    query: query || undefined,
    type: options.type || undefined,
    limit: 20
  };

  console.log('');
  console.log(`Searching FleetSeek experiences for: "${query || '(all)'}"`);
  if (options.type) {
    console.log(`  filter: type = ${options.type}`);
  }
  console.log('');

  let experiences;
  try {
    const data = await apiPost(baseUrl, '/api/v1/experiences/search', null, payload);
    experiences = data.experiences || [];
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  renderTable(experiences);
  console.log('');
  console.log(`${experiences.length} result(s) found.`);
}
