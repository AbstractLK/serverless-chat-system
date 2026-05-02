export const config = {
  awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-1',
  environment: process.env.ENVIRONMENT || 'dev',
  usersTable: must('USERS_TABLE'),
  connectionsTable: must('CONNECTIONS_TABLE'),
  conversationsTable: must('CONVERSATIONS_TABLE'),
  membersTable: must('MEMBERS_TABLE'),
  messagesTable: must('MESSAGES_TABLE'),
  chatEventsQueueUrl: process.env.CHAT_EVENTS_QUEUE_URL,
  websocketEndpoint: process.env.WEBSOCKET_ENDPOINT,
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
  cognitoClientId: process.env.COGNITO_CLIENT_ID,
  maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH || 2000)
};

function must(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
