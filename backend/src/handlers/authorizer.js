import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { config } from '../config.js';

const verifier = CognitoJwtVerifier.create({
  userPoolId: config.cognitoUserPoolId,
  tokenUse: 'id',
  clientId: config.cognitoClientId
});

export async function handler(event) {
  const token = extractToken(event);
  if (!token) return deny('anonymous');

  try {
    const payload = await verifier.verify(token);
    return allow(payload.sub, event.methodArn, { userId: payload.sub, sub: payload.sub });
  } catch {
    return deny('invalid');
  }
}

function extractToken(event) {
  const auth = event.headers?.Authorization || event.headers?.authorization;
  const queryToken = event.queryStringParameters?.token;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return queryToken;
}

function allow(principalId, resource, context) {
  return policy(principalId, 'Allow', resource, context);
}

function deny(principalId) {
  return policy(principalId, 'Deny', '*', {});
}

function policy(principalId, effect, resource, context) {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }]
    },
    context
  };
}
