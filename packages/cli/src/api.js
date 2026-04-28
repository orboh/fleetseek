/**
 * Thin HTTP client for the FleetSeek API.
 * Uses the native fetch available in Node.js >= 18.
 */

/**
 * Build common headers for authenticated requests.
 * @param {string} apiKey
 * @returns {Record<string, string>}
 */
function authHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  };
}

/**
 * Perform a GET request.
 * @param {string} baseUrl
 * @param {string} path
 * @param {string} apiKey
 * @returns {Promise<any>}
 */
export async function apiGet(baseUrl, path, apiKey) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: authHeaders(apiKey)
    });
  } catch (err) {
    throw new Error(
      `Cannot connect to FleetSeek API at ${baseUrl}. ` +
        'Make sure the server is running (npm run api:dev).'
    );
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = body?.message || body?.error || response.statusText;
    throw new Error(`API error ${response.status}: ${msg}`);
  }

  return body;
}

/**
 * Perform a POST request.
 * @param {string} baseUrl
 * @param {string} path
 * @param {string|null} apiKey  - pass null for unauthenticated calls
 * @param {Record<string, unknown>} data
 * @returns {Promise<any>}
 */
export async function apiPost(baseUrl, path, apiKey, data) {
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  };

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
  } catch (err) {
    throw new Error(
      `Cannot connect to FleetSeek API at ${baseUrl}. ` +
        'Make sure the server is running (npm run api:dev).'
    );
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = body?.message || body?.error || response.statusText;
    throw new Error(`API error ${response.status}: ${msg}`);
  }

  return body;
}
