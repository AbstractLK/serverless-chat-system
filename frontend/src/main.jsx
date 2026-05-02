import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, fetchAuthSession, signIn, signOut, signUp, confirmSignUp } from 'aws-amplify/auth';
import './styles.css';

const env = {
  region: import.meta.env.VITE_AWS_REGION,
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  restApiUrl: import.meta.env.VITE_REST_API_URL,
  websocketUrl: import.meta.env.VITE_WEBSOCKET_URL
};

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: env.userPoolId,
      userPoolClientId: env.userPoolClientId
    }
  }
});

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '', code: '' });
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [members, setMembers] = useState('');
  const [events, setEvents] = useState([]);
  const socket = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    connectSocket();
    return () => socket.current?.close();
  }, [user]);

  useEffect(() => {
    activeRef.current = active;
    if (active) loadMessages(active.conversationId);
  }, [active]);

  async function token() {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString();
  }

  async function api(path, options = {}) {
    const jwt = await token();
    const response = await fetch(`${env.restApiUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt}`,
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function loadConversations() {
    const data = await api('/conversations');
    setConversations(data.conversations || []);
  }

  async function loadMessages(conversationId) {
    const data = await api(`/conversations/${conversationId}/messages`);
    setMessages((data.items || []).reverse());
  }

  async function connectSocket() {
    const jwt = await token();
    const ws = new WebSocket(`${env.websocketUrl}?token=${encodeURIComponent(jwt)}`);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      setEvents((items) => [payload, ...items].slice(0, 20));
      if (payload.type === 'message.created' && payload.message?.conversationId === activeRef.current?.conversationId) {
        setMessages((items) => [...items, payload.message]);
      }
      if (payload.type === 'message.created') loadConversations();
    };
    socket.current = ws;
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (authMode === 'signup') {
      await signUp({ username: form.email, password: form.password, options: { userAttributes: { email: form.email } } });
      setAuthMode('confirm');
      return;
    }
    if (authMode === 'confirm') {
      await confirmSignUp({ username: form.email, confirmationCode: form.code });
      setAuthMode('signin');
      return;
    }
    await signIn({ username: form.email, password: form.password });
    setUser(await getCurrentUser());
  }

  async function createChat(type) {
    const memberIds = members.split(',').map((item) => item.trim()).filter(Boolean);
    await api('/conversations', { method: 'POST', body: JSON.stringify({ type, memberIds }) });
    setMembers('');
    await loadConversations();
  }

  function sendMessage() {
    if (!active || !text.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({
      action: 'sendMessage',
      conversationId: active.conversationId,
      clientMessageId: crypto.randomUUID(),
      text
    }));
    setText('');
  }

  const activeTitle = useMemo(() => active ? `${active.type} ${active.conversationId.slice(0, 8)}` : 'Select a conversation', [active]);

  if (!user) {
    return (
      <main className="auth">
        <form onSubmit={submitAuth}>
          <h1>Serverless Chat</h1>
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {authMode === 'confirm' && <input placeholder="Confirmation code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />}
          {authMode !== 'confirm' && <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
          <button>{authMode === 'signup' ? 'Sign up' : authMode === 'confirm' ? 'Confirm' : 'Sign in'}</button>
          <button type="button" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>
            {authMode === 'signin' ? 'Create account' : 'Use existing account'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="app">
      <aside>
        <header>
          <strong>Conversations</strong>
          <button onClick={async () => { await signOut(); setUser(null); }}>Sign out</button>
        </header>
        <div className="creator">
          <input placeholder="Member Cognito sub values, comma-separated" value={members} onChange={(e) => setMembers(e.target.value)} />
          <button onClick={() => createChat('direct')}>New direct</button>
          <button onClick={() => createChat('group')}>New group</button>
        </div>
        {conversations.map((conversation) => (
          <button className="conversation" key={conversation.conversationId} onClick={() => setActive(conversation)}>
            <span>{conversation.type} {conversation.conversationId.slice(0, 8)}</span>
            <b>{conversation.unreadCount || 0}</b>
          </button>
        ))}
      </aside>
      <section className="chat">
        <header>{activeTitle}</header>
        <div className="messages">
          {messages.map((message) => (
            <article key={message.messageId}>
              <small>{message.senderId}</small>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
        <footer>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Write a message" />
          <button onClick={sendMessage}>Send</button>
        </footer>
      </section>
      <aside className="events">
        <strong>Events</strong>
        {events.map((event, index) => <pre key={index}>{JSON.stringify(event, null, 2)}</pre>)}
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
