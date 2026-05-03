import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminGetUserCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { config } from '../config.js';

const client = new CognitoIdentityProviderClient({ region: config.awsRegion });

function extractAttributes(attributes) {
  const map = {};
  for (const attr of attributes || []) {
    map[attr.Name] = attr.Value;
  }
  return map;
}

export async function searchUserByEmail(email) {
  const result = await client.send(new ListUsersCommand({
    UserPoolId: config.cognitoUserPoolId,
    Filter: `email = "${email}"`,
    Limit: 1
  }));

  const user = result.Users?.[0];
  if (!user) return null;

  const attrs = extractAttributes(user.Attributes);
  return {
    userId: attrs.sub,
    email: attrs.email,
    name: attrs.name || attrs.email
  };
}

export async function getUserById(userId) {
  try {
    const result = await client.send(new AdminGetUserCommand({
      UserPoolId: config.cognitoUserPoolId,
      Username: userId
    }));

    const attrs = extractAttributes(result.UserAttributes);
    return {
      userId: attrs.sub,
      email: attrs.email,
      name: attrs.name || attrs.email
    };
  } catch (error) {
    if (error.name === 'UserNotFoundException') return null;
    throw error;
  }
}

export async function getUsersByIds(userIds) {
  const results = await Promise.allSettled(
    [...new Set(userIds)].map((id) => getUserById(id))
  );
  const users = {};
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      users[result.value.userId] = result.value;
    }
  }
  return users;
}
