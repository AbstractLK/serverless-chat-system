import { applyMessageSummary } from '../lib/db.js';

export async function handler(event) {
  for (const record of event.Records || []) {
    const body = JSON.parse(record.body);
    if (body.type !== 'MESSAGE_CREATED') continue;
    await applyMessageSummary(body);
  }
}
