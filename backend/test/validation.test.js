import test from 'node:test';
import assert from 'node:assert/strict';

process.env.USERS_TABLE = 'Users';
process.env.CONNECTIONS_TABLE = 'Connections';
process.env.CONVERSATIONS_TABLE = 'Conversations';
process.env.MEMBERS_TABLE = 'Members';
process.env.MESSAGES_TABLE = 'Messages';

const { assertText } = await import('../src/lib/validation.js');

test('assertText trims valid messages', () => {
  assert.equal(assertText(' hello '), 'hello');
});

test('assertText rejects empty messages', () => {
  assert.throws(() => assertText('   '), /Message text is required/);
});
