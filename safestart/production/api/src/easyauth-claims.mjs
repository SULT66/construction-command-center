function claimMap(principal) {
  const out = new Map();
  for (const item of principal?.claims || []) {
    if (!item?.typ) continue;
    if (!out.has(item.typ)) out.set(item.typ, item.val);
  }
  return out;
}

function first(map, names) {
  for (const name of names) {
    if (map.has(name)) return map.get(name);
  }
  return null;
}

export function verifiedClaimsFromEasyAuthHeaders(headers) {
  const encoded = headers['x-ms-client-principal'];
  if (!encoded) {
    throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  }

  let principal;
  try {
    principal = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid authenticated principal'), { statusCode: 401 });
  }

  const claims = claimMap(principal);
  const issuer = first(claims, ['iss', 'http://schemas.microsoft.com/identity/claims/issuer']);
  const subject = first(claims, ['sub', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier', 'http://schemas.microsoft.com/identity/claims/objectidentifier']);
  const email = first(claims, ['email', 'preferred_username', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']);
  const name = first(claims, ['name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name']);

  if (!issuer || !subject) {
    throw Object.assign(new Error('Authenticated principal is missing issuer or subject'), { statusCode: 401 });
  }

  return {
    iss: issuer,
    sub: subject,
    email,
    preferred_username: email,
    name: name || email || principal.userId || 'SafeStart User',
    provider: principal.auth_typ || null
  };
}
