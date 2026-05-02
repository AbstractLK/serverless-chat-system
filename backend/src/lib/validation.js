import { config } from '../config.js';

export function assertText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw badRequest('Message text is required');
  }
  if (text.length > config.maxMessageLength) {
    throw badRequest(`Message text cannot exceed ${config.maxMessageLength} characters`);
  }
  return text.trim();
}

export function assertString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw badRequest(`${name} is required`);
  }
  return value.trim();
}

export function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
