export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

export function parseJson(event) {
  if (!event.body) return {};
  return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
}

export function getUserId(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || event.requestContext?.authorizer || {};
  return claims.sub || claims.userId || claims.principalId;
}
