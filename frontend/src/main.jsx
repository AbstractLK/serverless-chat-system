import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/* ─── Avatar Colors ─── */
const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'
];

function getAvatarColor(id) {
  if (!id) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function Avatar({ name, id, small }) {
  return (
    <div className={`avatar${small ? ' small' : ''}`} style={{ background: getAvatarColor(id) }}>
      {getInitials(name)}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '', code: '', name: '' });
  const [authErrors, setAuthErrors] = useState({ email: '', password: '', code: '', name: '', form: '' });
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [events, setEvents] = useState([]);
  const socket = useRef(null);
  const activeRef = useRef(null);
  const messagesEndRef = useRef(null);

  // User name cache: userId -> { name, email, userId }
  const userCacheRef = useRef({});
  const [userCacheVersion, setUserCacheVersion] = useState(0);

  // Current user profile
  const [currentUserProfile, setCurrentUserProfile] = useState(null);

  // Search state
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);

  // Group chat builder
  const [groupMembers, setGroupMembers] = useState([]);

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    connectSocket();
    loadCurrentUserProfile();
    return () => socket.current?.close();
  }, [user]);

  useEffect(() => {
    activeRef.current = active;
    if (active) loadMessages(active.conversationId);
  }, [active]);

  useEffect(() => {
    setAuthErrors({ email: '', password: '', code: '', name: '', form: '' });
  }, [authMode]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function updateAuthField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setAuthErrors((current) => ({ ...current, [field]: '', form: '' }));
  }

  function mapAuthError(error, mode) {
    const name = error?.name || '';
    const message = error?.message || 'Unable to authenticate. Please try again.';

    if (mode === 'confirm') {
      if (name === 'CodeMismatchException' || name === 'ExpiredCodeException') {
        return { field: 'code', message };
      }
    }

    switch (name) {
      case 'UserNotFoundException':
      case 'UsernameExistsException':
      case 'InvalidParameterException':
        return { field: 'email', message };
      case 'InvalidPasswordException':
      case 'NotAuthorizedException':
        return { field: 'password', message };
      case 'TooManyRequestsException':
      case 'LimitExceededException':
        return { field: 'form', message };
      default:
        return { field: '', message };
    }
  }

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

  /* ─── User Name Resolution ─── */

  async function loadCurrentUserProfile() {
    try {
      const currentUser = await getCurrentUser();
      const userId = currentUser.userId;
      const data = await api(`/users/${userId}`);
      if (data.user) {
        setCurrentUserProfile(data.user);
        userCacheRef.current[userId] = data.user;
        setUserCacheVersion((v) => v + 1);
      }
    } catch {
      // Fallback — profile will show user ID
    }
  }

  const resolveUser = useCallback(async (userId) => {
    if (userCacheRef.current[userId]) return userCacheRef.current[userId];
    try {
      const data = await api(`/users/${userId}`);
      if (data.user) {
        userCacheRef.current[userId] = data.user;
        setUserCacheVersion((v) => v + 1);
        return data.user;
      }
    } catch {
      // Cache a fallback so we don't retry constantly
      userCacheRef.current[userId] = { userId, name: userId.slice(0, 8), email: '' };
      setUserCacheVersion((v) => v + 1);
    }
    return userCacheRef.current[userId];
  }, []);

  async function resolveUsers(userIds) {
    const toResolve = userIds.filter((id) => !userCacheRef.current[id]);
    if (toResolve.length === 0) return;

    try {
      const data = await api('/users/batch', {
        method: 'POST',
        body: JSON.stringify({ userIds: toResolve })
      });
      if (data.users) {
        for (const [id, profile] of Object.entries(data.users)) {
          userCacheRef.current[id] = profile;
        }
        // Fallback for users not found in batch
        for (const id of toResolve) {
          if (!userCacheRef.current[id]) {
            userCacheRef.current[id] = { userId: id, name: id.slice(0, 8), email: '' };
          }
        }
        setUserCacheVersion((v) => v + 1);
      }
    } catch {
      // Individual fallback
      for (const id of toResolve) {
        if (!userCacheRef.current[id]) {
          resolveUser(id);
        }
      }
    }
  }

  function getCachedName(userId) {
    return userCacheRef.current[userId]?.name || userId?.slice(0, 8) || '...';
  }

  /* ─── Data Loading ─── */

  async function loadConversations() {
    const data = await api('/conversations');
    const convs = data.conversations || [];
    setConversations(convs);

    // Resolve all member names
    const allMemberIds = [...new Set(convs.flatMap((c) => c.memberIds || []))];
    resolveUsers(allMemberIds);
  }

  async function loadMessages(conversationId) {
    const data = await api(`/conversations/${conversationId}/messages`);
    const msgs = (data.items || []).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    setMessages(msgs);

    // Resolve sender names
    const senderIds = [...new Set(msgs.map((m) => m.senderId).filter(Boolean))];
    resolveUsers(senderIds);
  }

  async function connectSocket() {
    const jwt = await token();
    const ws = new WebSocket(`${env.websocketUrl}?token=${encodeURIComponent(jwt)}`);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      setEvents((items) => [payload, ...items].slice(0, 20));
      if (payload.type === 'message.created' && payload.message?.conversationId === activeRef.current?.conversationId) {
        setMessages((items) => [...items, payload.message]);
        // Resolve sender name if new
        if (payload.message.senderId && !userCacheRef.current[payload.message.senderId]) {
          resolveUser(payload.message.senderId);
        }
      }
      if (payload.type === 'message.created') loadConversations();
    };
    socket.current = ws;
  }

  /* ─── Auth ─── */

  async function submitAuth(event) {
    event.preventDefault();
    setAuthErrors({ email: '', password: '', code: '', name: '', form: '' });
    try {
      if (authMode === 'signup') {
        if (!form.name.trim()) {
          setAuthErrors((current) => ({ ...current, name: 'Full name is required.' }));
          return;
        }
        await signUp({ username: form.email, password: form.password, options: { userAttributes: { email: form.email, name: form.name } } });
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
    } catch (error) {
      const mapped = mapAuthError(error, authMode);
      if (mapped.field) {
        setAuthErrors((current) => ({ ...current, [mapped.field]: mapped.message }));
      } else {
        setAuthErrors((current) => ({ ...current, form: mapped.message }));
      }
    }
  }

  /* ─── User Search & Chat Creation ─── */

  async function searchUser() {
    if (!searchEmail.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setSearchError('');
    try {
      const data = await api(`/users/search?email=${encodeURIComponent(searchEmail.trim())}`);
      setSearchResult(data.user);
    } catch {
      setSearchError('User not found with that email.');
    } finally {
      setSearching(false);
    }
  }

  async function startDirectChat(targetUserId) {
    try {
      await api('/conversations', {
        method: 'POST',
        body: JSON.stringify({ type: 'direct', memberIds: [targetUserId] })
      });
      setSearchEmail('');
      setSearchResult(null);
      setSearchError('');
      await loadConversations();
    } catch (error) {
      const msg = error.message || '';
      setSearchError(msg.includes('already') ? 'Conversation already exists.' : 'Could not create conversation.');
      await loadConversations();
    }
  }

  function addToGroup(user) {
    if (groupMembers.some((m) => m.userId === user.userId)) return;
    setGroupMembers((prev) => [...prev, user]);
    setSearchResult(null);
    setSearchEmail('');
  }

  function removeFromGroup(userId) {
    setGroupMembers((prev) => prev.filter((m) => m.userId !== userId));
  }

  async function createGroupChat() {
    if (groupMembers.length < 1) return;
    try {
      const memberIds = groupMembers.map((m) => m.userId);
      await api('/conversations', {
        method: 'POST',
        body: JSON.stringify({ type: 'group', memberIds })
      });
      setGroupMembers([]);
      setSearchEmail('');
      setSearchResult(null);
      setSearchError('');
      await loadConversations();
    } catch (error) {
      setSearchError(error.message || 'Could not create group.');
    }
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

  /* ─── Derived Data ─── */

  const currentUserId = user?.userId || '';

  function getConversationName(conversation) {
    if (!conversation) return '';
    const otherMembers = (conversation.memberIds || []).filter((id) => id !== currentUserId);
    if (otherMembers.length === 0) return getCachedName(currentUserId);
    return otherMembers.map((id) => getCachedName(id)).join(', ');
  }

  function getConversationAvatar(conversation) {
    if (!conversation) return { name: '', id: '' };
    const otherMembers = (conversation.memberIds || []).filter((id) => id !== currentUserId);
    const firstOther = otherMembers[0] || currentUserId;
    return { name: getCachedName(firstOther), id: firstOther };
  }

  /* ─── Group messages by sender ─── */
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentGroup = null;

    for (const msg of messages) {
      if (!currentGroup || currentGroup.senderId !== msg.senderId) {
        currentGroup = { senderId: msg.senderId, messages: [msg], isOwn: msg.senderId === currentUserId };
        groups.push(currentGroup);
      } else {
        currentGroup.messages.push(msg);
      }
    }

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, currentUserId, userCacheVersion]);

  /* ─── Render: Auth ─── */

  if (!user) {
    return (
      <main className="auth">
        <form onSubmit={submitAuth}>
          <h1>Serverless Chat</h1>
          {authMode === 'signup' && (
            <>
              <input placeholder="Full name" value={form.name} onChange={(e) => updateAuthField('name', e.target.value)} required />
              {authErrors.name && <span className="field-error">{authErrors.name}</span>}
            </>
          )}
          <input placeholder="Email" value={form.email} onChange={(e) => updateAuthField('email', e.target.value)} />
          {authErrors.email && <span className="field-error">{authErrors.email}</span>}
          {authMode === 'confirm' && (
            <>
              <input placeholder="Confirmation code" value={form.code} onChange={(e) => updateAuthField('code', e.target.value)} />
              {authErrors.code && <span className="field-error">{authErrors.code}</span>}
            </>
          )}
          {authMode !== 'confirm' && (
            <>
              <input placeholder="Password" type="password" value={form.password} onChange={(e) => updateAuthField('password', e.target.value)} />
              {authErrors.password && <span className="field-error">{authErrors.password}</span>}
            </>
          )}
          <button type="submit">{authMode === 'signup' ? 'Sign up' : authMode === 'confirm' ? 'Confirm' : 'Sign in'}</button>
          {authErrors.form && <div className="form-error">{authErrors.form}</div>}
          <button type="button" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>
            {authMode === 'signin' ? 'Create account' : 'Use existing account'}
          </button>
        </form>
      </main>
    );
  }

  /* ─── Render: Main App ─── */

  const activeName = active ? getConversationName(active) : '';
  const activeAvatar = active ? getConversationAvatar(active) : null;

  return (
    <main className="app">
      {/* ─── Sidebar ─── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="user-info">
            {currentUserProfile && <Avatar name={currentUserProfile.name} id={currentUserId} small />}
            <strong>{currentUserProfile?.name || 'Chat'}</strong>
          </div>
          <button className="btn-signout" onClick={async () => { await signOut(); setUser(null); }}>Sign out</button>
        </div>

        {/* ─── Search / New Chat ─── */}
        <div className="new-chat-panel">
          <div className="search-row">
            <input
              placeholder="Search user by email..."
              value={searchEmail}
              onChange={(e) => { setSearchEmail(e.target.value); setSearchError(''); setSearchResult(null); }}
              onKeyDown={(e) => e.key === 'Enter' && searchUser()}
            />
            <button className="btn-search" onClick={searchUser} disabled={searching || !searchEmail.trim()}>
              {searching ? <span className="loading-dots"><span /><span /><span /></span> : 'Search'}
            </button>
          </div>

          {searchResult && (
            <div className="search-result">
              <Avatar name={searchResult.name} id={searchResult.userId} small />
              <div className="search-result-info">
                <div className="name">{searchResult.name}</div>
                <div className="email">{searchResult.email}</div>
              </div>
              <div className="search-result-actions">
                <button className="btn-start-chat" onClick={() => startDirectChat(searchResult.userId)}>Direct</button>
                <button className="btn-add-group" onClick={() => addToGroup(searchResult)}>+ Group</button>
              </div>
            </div>
          )}

          {groupMembers.length > 0 && (
            <div className="group-builder">
              <div className="group-members-list">
                {groupMembers.map((member) => (
                  <span className="group-chip" key={member.userId}>
                    {member.name}
                    <button className="chip-remove" onClick={() => removeFromGroup(member.userId)}>×</button>
                  </span>
                ))}
              </div>
              <button className="btn-create-group" onClick={createGroupChat}>
                Create Group ({groupMembers.length + 1})
              </button>
            </div>
          )}

          {searchError && <div className="search-error">{searchError}</div>}
        </div>

        {/* ─── Conversation List ─── */}
        <div className="conversation-list">
          {conversations.length === 0 && (
            <div className="no-conversations">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <p>No conversations yet.<br />Search a user to start chatting!</p>
            </div>
          )}
          {conversations.map((conversation) => {
            const convName = getConversationName(conversation);
            const convAvatar = getConversationAvatar(conversation);
            const isActive = active?.conversationId === conversation.conversationId;

            return (
              <button
                className={`conversation-item${isActive ? ' active' : ''}`}
                key={conversation.conversationId}
                onClick={() => setActive(conversation)}
              >
                <Avatar name={convAvatar.name} id={convAvatar.id} />
                <div className="conv-info">
                  <span className="conv-name">{convName}</span>
                  <span className="conv-type">{conversation.type === 'group' ? 'Group' : 'Direct'}</span>
                </div>
                {(conversation.unreadCount || 0) > 0 && (
                  <span className="unread-badge">{conversation.unreadCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ─── Chat Area ─── */}
      <section className="chat">
        {active ? (
          <>
            <header className="chat-header">
              <Avatar name={activeAvatar.name} id={activeAvatar.id} />
              <div className="chat-header-info">
                <div className="chat-name">{activeName}</div>
                <div className="chat-type">{active.type === 'group' ? 'Group conversation' : 'Direct message'}</div>
              </div>
            </header>

            <div className="messages">
              {groupedMessages.map((group, groupIndex) => (
                <div className={`message-group ${group.isOwn ? 'own' : 'other'}`} key={groupIndex}>
                  <span className="message-sender">{getCachedName(group.senderId)}</span>
                  {group.messages.map((message) => (
                    <div key={message.messageId}>
                      <div className="message-bubble">{message.text}</div>
                      <div className="message-time">
                        {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <footer className="chat-footer">
              <div className="chat-footer-inner">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                />
                <button className="btn-send" onClick={sendMessage} disabled={!text.trim()}>
                  Send
                </button>
              </div>
            </footer>
          </>
        ) : (
          <>
            <header className="chat-header">
              <div className="chat-header-info">
                <div className="chat-name">Serverless Chat</div>
                <div className="chat-type">Select a conversation to start messaging</div>
              </div>
            </header>
            <div className="chat-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <p>Select a conversation</p>
            </div>
            <div />
          </>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
