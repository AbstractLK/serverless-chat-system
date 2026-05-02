import { getUserId, json } from '../lib/http.js';
import { putConnection } from '../lib/db.js';

export async function handler(event) {
  const userId = getUserId(event);
  if (!userId) return json(401, { message: 'Unauthorized' });

  await putConnection({
    connectionId: event.requestContext.connectionId,
    userId,
    connectedAt: new Date().toISOString()
  });

  return { statusCode: 200, body: 'connected' };
}
