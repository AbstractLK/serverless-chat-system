import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import {
  findMessageByClientId,
  getConversation,
  markRead,
  requireMember,
  saveMessage
} from '../lib/db.js';
import { getUserId, parseJson } from '../lib/http.js';
import { postToConnection, postToUsers, publishChatEvent } from '../lib/realtime.js';
import { assertString, assertText, badRequest } from '../lib/validation.js';

export async function handler(event) {
  const userId = getUserId(event);
  const connectionId = event.requestContext.connectionId;
  const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;

  try {
    const payload = parseJson(event);
    const action = payload.action || event.requestContext.routeKey;

    if (action === 'sendMessage') await sendMessage({ payload, userId, connectionId, endpoint });
    else if (action === 'typing') await typing({ payload, userId, endpoint });
    else if (action === 'readReceipt') await readReceipt({ payload, userId, endpoint });
    else await postToConnection(connectionId, { type: 'error', message: 'Unsupported action' }, endpoint);

    return { statusCode: 200 };
  } catch (error) {
    await postToConnection(connectionId, { type: 'error', message: error.message || 'Unexpected error' }, endpoint);
    return { statusCode: error.statusCode || 500 };
  }
}

async function sendMessage({ payload, userId, connectionId, endpoint }) {
  const conversationId = assertString(payload.conversationId, 'conversationId');
  const clientMessageId = assertString(payload.clientMessageId, 'clientMessageId');
  const text = assertText(payload.text);

  await requireMember(conversationId, userId);
  const conversation = await getConversation(conversationId);
  if (!conversation) throw badRequest('Conversation not found');

  const existing = await findMessageByClientId(conversationId, userId, clientMessageId);
  if (existing) {
    await postToConnection(connectionId, { type: 'message.ack', messageId: existing.messageId, clientMessageId }, endpoint);
    return;
  }

  const createdAt = new Date().toISOString();
  const messageId = uuidv4();
  const message = {
    conversationId,
    messageId,
    senderId: userId,
    text,
    createdAt,
    clientMessageKey: `${conversationId}#${userId}#${clientMessageId}`
  };

  await saveMessage({ message, clientMessageId });

  const recipientIds = conversation.memberIds || [];
  await postToConnection(connectionId, { type: 'message.ack', messageId, clientMessageId }, endpoint);
  await postToUsers(recipientIds, { type: 'message.created', message }, endpoint);
  await publishChatEvent({
    type: 'MESSAGE_CREATED',
    messageId,
    conversationId,
    senderId: userId,
    recipientIds,
    createdAt
  });
}

async function typing({ payload, userId, endpoint }) {
  const conversationId = assertString(payload.conversationId, 'conversationId');
  await requireMember(conversationId, userId);
  const conversation = await getConversation(conversationId);
  await postToUsers(conversation.memberIds.filter((id) => id !== userId), {
    type: 'typing.updated',
    conversationId,
    userId,
    isTyping: Boolean(payload.isTyping)
  }, endpoint);
}

async function readReceipt({ payload, userId, endpoint }) {
  const conversationId = assertString(payload.conversationId, 'conversationId');
  const messageId = assertString(payload.messageId, 'messageId');
  await requireMember(conversationId, userId);
  await markRead({ conversationId, userId, messageId, updatedAt: new Date().toISOString() });
  const conversation = await getConversation(conversationId);
  await postToUsers(conversation.memberIds, { type: 'receipt.updated', conversationId, userId, messageId }, endpoint);
}
