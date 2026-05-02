import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { config } from '../config.js';
import { deleteConnection, listConnectionsForUser } from './db.js';

const sqs = new SQSClient({ region: config.awsRegion });

export async function postToUser(userId, event, endpoint = config.websocketEndpoint) {
  const connections = await listConnectionsForUser(userId);
  await Promise.all(connections.map((connection) => postToConnection(connection.connectionId, event, endpoint)));
}

export async function postToUsers(userIds, event, endpoint = config.websocketEndpoint) {
  await Promise.all([...new Set(userIds)].map((userId) => postToUser(userId, event, endpoint)));
}

export async function postToConnection(connectionId, event, endpoint = config.websocketEndpoint) {
  if (!endpoint) return;
  const client = new ApiGatewayManagementApiClient({
    region: config.awsRegion,
    endpoint
  });

  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(event))
    }));
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 410) {
      await deleteConnection(connectionId);
      return;
    }
    throw error;
  }
}

export async function publishChatEvent(event) {
  if (!config.chatEventsQueueUrl) return;
  await sqs.send(new SendMessageCommand({
    QueueUrl: config.chatEventsQueueUrl,
    MessageBody: JSON.stringify(event)
  }));
}
