import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';

const client = new DynamoDBClient({ region: config.awsRegion });
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

export async function putConnection({ connectionId, userId, connectedAt }) {
  const ttl = Math.floor(Date.now() / 1000) + 86400;
  await ddb.send(new PutCommand({
    TableName: config.connectionsTable,
    Item: { connectionId, userId, connectedAt, lastSeenAt: connectedAt, ttl }
  }));
}

export async function deleteConnection(connectionId) {
  await ddb.send(new DeleteCommand({
    TableName: config.connectionsTable,
    Key: { connectionId }
  }));
}

export async function getConversation(conversationId) {
  const result = await ddb.send(new GetCommand({
    TableName: config.conversationsTable,
    Key: { conversationId }
  }));
  return result.Item;
}

export async function getMember(conversationId, userId) {
  const result = await ddb.send(new GetCommand({
    TableName: config.membersTable,
    Key: { conversationId, userId }
  }));
  return result.Item;
}

export async function requireMember(conversationId, userId) {
  const member = await getMember(conversationId, userId);
  if (!member) {
    const error = new Error('User is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }
  return member;
}

export async function listUserConversations(userId) {
  const memberships = await ddb.send(new QueryCommand({
    TableName: config.membersTable,
    IndexName: 'byUser',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId },
    ScanIndexForward: false
  }));

  const conversations = [];
  for (const membership of memberships.Items || []) {
    const conversation = await getConversation(membership.conversationId);
    if (conversation) conversations.push({ ...conversation, unreadCount: membership.unreadCount || 0 });
  }
  return conversations.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function createConversation({ conversationId, type, memberIds, createdAt }) {
  const writes = [
    {
      Put: {
        TableName: config.conversationsTable,
        Item: { conversationId, type, memberIds, createdAt, updatedAt: createdAt },
        ConditionExpression: 'attribute_not_exists(conversationId)'
      }
    },
    ...memberIds.map((userId) => ({
      Put: {
        TableName: config.membersTable,
        Item: { conversationId, userId, role: 'member', unreadCount: 0, createdAt, updatedAt: createdAt }
      }
    }))
  ];

  await ddb.send(new TransactWriteCommand({ TransactItems: writes }));
}

export async function saveMessage({ message, clientMessageId }) {
  await ddb.send(new PutCommand({
    TableName: config.messagesTable,
    Item: { ...message, clientMessageId },
    ConditionExpression: 'attribute_not_exists(conversationId) AND attribute_not_exists(messageId)'
  }));
}

export async function findMessageByClientId(conversationId, senderId, clientMessageId) {
  const result = await ddb.send(new QueryCommand({
    TableName: config.messagesTable,
    IndexName: 'byClientMessage',
    KeyConditionExpression: 'clientMessageKey = :key',
    ExpressionAttributeValues: { ':key': `${conversationId}#${senderId}#${clientMessageId}` },
    Limit: 1
  }));
  return result.Items?.[0];
}

export async function listMessages(conversationId, cursor) {
  const result = await ddb.send(new QueryCommand({
    TableName: config.messagesTable,
    KeyConditionExpression: 'conversationId = :conversationId',
    ExpressionAttributeValues: { ':conversationId': conversationId },
    ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined,
    ScanIndexForward: false,
    Limit: 50
  }));
  return {
    items: result.Items || [],
    nextCursor: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
      : null
  };
}

export async function listConnectionsForUser(userId) {
  const result = await ddb.send(new QueryCommand({
    TableName: config.connectionsTable,
    IndexName: 'byUser',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId }
  }));
  return result.Items || [];
}

export async function markRead({ conversationId, userId, messageId, updatedAt }) {
  await ddb.send(new UpdateCommand({
    TableName: config.membersTable,
    Key: { conversationId, userId },
    UpdateExpression: 'SET lastReadMessageId = :messageId, unreadCount = :zero, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messageId': messageId, ':zero': 0, ':updatedAt': updatedAt }
  }));
}

export async function applyMessageSummary({ conversationId, senderId, recipientIds, messageId, createdAt }) {
  await ddb.send(new UpdateCommand({
    TableName: config.conversationsTable,
    Key: { conversationId },
    UpdateExpression: 'SET latestMessageId = :messageId, updatedAt = :createdAt',
    ExpressionAttributeValues: { ':messageId': messageId, ':createdAt': createdAt }
  }));

  for (const userId of recipientIds.filter((id) => id !== senderId)) {
    await ddb.send(new UpdateCommand({
      TableName: config.membersTable,
      Key: { conversationId, userId },
      UpdateExpression: 'ADD unreadCount :one SET updatedAt = :createdAt',
      ExpressionAttributeValues: { ':one': 1, ':createdAt': createdAt }
    }));
  }
}
