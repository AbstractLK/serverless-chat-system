import { deleteConnection } from '../lib/db.js';

export async function handler(event) {
  await deleteConnection(event.requestContext.connectionId);
  return { statusCode: 200, body: 'disconnected' };
}
