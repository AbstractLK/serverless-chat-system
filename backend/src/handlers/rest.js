import { v4 as uuidv4 } from 'uuid';
import {
  createConversation,
  listMessages,
  listUserConversations,
  requireMember
} from '../lib/db.js';
import { getUserId, json, parseJson } from '../lib/http.js';
import { assertString, badRequest } from '../lib/validation.js';
import { getUserById, getUsersByIds, searchUserByEmail } from '../lib/cognito.js';

export async function handler(event) {
  try {
    if (event.requestContext?.http?.method === 'OPTIONS') return json(204, {});
    const userId = getUserId(event);
    if (!userId) return json(401, { message: 'Unauthorized' });

    const method = event.requestContext.http.method;
    const routeKey = event.routeKey;

    if (method === 'GET' && routeKey === 'GET /conversations') {
      return json(200, { conversations: await listUserConversations(userId) });
    }

    if (method === 'POST' && routeKey === 'POST /conversations') {
      const body = parseJson(event);
      const type = body.type === 'group' ? 'group' : 'direct';
      const memberIds = [...new Set([userId, ...(body.memberIds || []).map(String)])];
      if (type === 'direct' && memberIds.length !== 2) throw badRequest('Direct conversations require exactly two members');
      if (type === 'group' && memberIds.length < 2) throw badRequest('Group conversations require at least two members');

      const conversationId = uuidv4();
      await createConversation({ conversationId, type, memberIds, createdAt: new Date().toISOString() });
      return json(201, { conversationId, type, memberIds });
    }

    if (method === 'GET' && routeKey === 'GET /conversations/{conversationId}/messages') {
      const conversationId = assertString(event.pathParameters?.conversationId, 'conversationId');
      await requireMember(conversationId, userId);
      return json(200, await listMessages(conversationId, event.queryStringParameters?.cursor));
    }

    if (method === 'GET' && routeKey === 'GET /users/search') {
      const email = event.queryStringParameters?.email;
      if (!email) throw badRequest('email query parameter is required');
      const user = await searchUserByEmail(email);
      if (!user) return json(404, { message: 'User not found' });
      return json(200, { user });
    }

    if (method === 'GET' && routeKey === 'GET /users/{userId}') {
      const targetUserId = assertString(event.pathParameters?.userId, 'userId');
      const user = await getUserById(targetUserId);
      if (!user) return json(404, { message: 'User not found' });
      return json(200, { user });
    }

    if (method === 'POST' && routeKey === 'POST /users/batch') {
      const body = parseJson(event);
      const userIds = body.userIds;
      if (!Array.isArray(userIds) || userIds.length === 0) throw badRequest('userIds array is required');
      if (userIds.length > 25) throw badRequest('Maximum 25 user IDs per request');
      const users = await getUsersByIds(userIds);
      return json(200, { users });
    }

    return json(404, { message: 'Not found' });
  } catch (error) {
    return json(error.statusCode || 500, { message: error.message || 'Unexpected error' });
  }
}
