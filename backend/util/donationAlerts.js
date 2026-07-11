const DA_BASE = 'https://www.donationalerts.com';

// The OAuth app credentials (client_id/client_secret/redirect_uri) are
// static config, set once when the admin registers an app at
// donationalerts.com/application/clients. The resulting access/refresh
// tokens are per-account and stored in Firestore (see models.js), since they
// rotate and env vars can't be updated at runtime.
function isAppConfigured() {
  return !!(
    process.env.DONATIONALERTS_CLIENT_ID &&
    process.env.DONATIONALERTS_CLIENT_SECRET &&
    process.env.DONATIONALERTS_REDIRECT_URI
  );
}

function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.DONATIONALERTS_CLIENT_ID,
    redirect_uri: process.env.DONATIONALERTS_REDIRECT_URI,
    response_type: 'code',
    scope: 'oauth-donation-index',
    state: state || '',
  });
  return `${DA_BASE}/oauth/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const res = await fetch(`${DA_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.DONATIONALERTS_CLIENT_ID,
      client_secret: process.env.DONATIONALERTS_CLIENT_SECRET,
      redirect_uri: process.env.DONATIONALERTS_REDIRECT_URI,
      code,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `Ошибка авторизации DonationAlerts (код ${res.status})`);
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(refreshTokenValue) {
  const res = await fetch(`${DA_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.DONATIONALERTS_CLIENT_ID,
      client_secret: process.env.DONATIONALERTS_CLIENT_SECRET,
      refresh_token: refreshTokenValue,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `Ошибка обновления токена DonationAlerts (код ${res.status})`);
  return data;
}

// Returns the most recent page of the account's donations (newest first).
async function listDonations(accessToken, page = 1) {
  const res = await fetch(`${DA_BASE}/api/v1/alerts/donations?page=${page}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Ошибка запроса донатов DonationAlerts (код ${res.status})`);
  return data.data || [];
}

module.exports = { isAppConfigured, getAuthorizeUrl, exchangeCode, refreshAccessToken, listDonations };
