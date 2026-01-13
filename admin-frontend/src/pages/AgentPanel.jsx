// src/pages/AgentPanel.jsx

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { API_BASE_URL } from '../config';
import Loader from '../components/Loader';
import '../styles/AgentPanel.css';

// Helper to decode JWT token
function decodeToken(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

function AgentPanel() {
  const { user, logout: authLogout } = useAuth();
  // Read agent token from localStorage (stored by AgentLoginPage)
  const agentToken = localStorage.getItem('agentToken');
  
  // Decode agent token to get agentId and tenantId
  const decodedToken = agentToken ? decodeToken(agentToken) : null;
  const agentId = decodedToken?.agentId;
  const tenantId = decodedToken?.tenantId;
  
  // Get agent data from localStorage
  const agentDataString = localStorage.getItem('agentData');
  const agentData = agentDataString ? JSON.parse(agentDataString) : null;
  const agentUsername = agentData?.username || decodedToken?.username || 'Agent';
  
  // Helper to call backend mounted at exact '/agents' path.
  const getBackendBase = () => API_BASE_URL.replace(/\/api\/?$/, '');


  const agentApiRequest = async (path, { method = 'GET', token: reqToken, data, params, ...custom } = {}) => {
    const base = getBackendBase();
    const urlBase = `${base}${path}`;

    let url = urlBase;
    if (params && typeof params === 'object') {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(reqToken && { Authorization: `Bearer ${reqToken}` }),
    };

    const options = {
      method,
      headers,
      ...(data ? { body: JSON.stringify(data) } : {}),
      ...custom,
    };

    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type');
    let result;
    if (contentType && contentType.includes('application/json')) {
      result = await res.json();
    } else {
      result = { message: await res.text() };
    }

    if (!res.ok) {
      const errorMessage = result.error || result.message || `API error: ${res.status}`;
      throw new Error(errorMessage);
    }

    return result;  
  };
  
  // Conversations state
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState('');
  
  // Selected conversation state
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  
  // Bots mapping (for website names)
  const [bots, setBots] = useState({});
  
  // Message input state
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'queued', 'assigned'

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = useCallback(async () => {
    setConversationsLoading(true);
    setConversationsError('');
    
    try {
      const data = await agentApiRequest('/api/agent/conversations', { method: 'GET', token: agentToken });
      setConversations(data.conversations || data || []);
      
      // Extract unique bot IDs and fetch bot details
      const botIds = [...new Set((data.conversations || data || []).map(c => c.botId).filter(Boolean))];
      await fetchBotDetails(botIds);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      setConversationsError(error.message || 'Failed to load conversations');
    } finally {
      setConversationsLoading(false);
    }
  }, [agentToken]);

  const fetchBotDetails = async (botIds) => {
    const botMap = {};
    
    for (const botId of botIds) {
      try {
        const botData = await apiRequest(`/bots/${botId}`, { token: agentToken });
        botMap[botId] = botData.bot || botData;
      } catch (error) {
        console.error(`Failed to fetch bot ${botId}:`, error);
        botMap[botId] = { name: 'Unknown Bot' };
      }
    }
    
    setBots(botMap);
  };

  const fetchMessages = useCallback(async (conversationId) => {
    setMessagesLoading(true);
    setMessagesError('');
    
    try {
      const data = await agentApiRequest(`/api/agent/conversations/${conversationId}/messages`, { method: 'GET', token: agentToken });
      setMessages(data.messages || data || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setMessagesError(error.message || 'Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  }, [agentToken]);

  const handleConversationClick = (conversationId) => {
    setSelectedConversationId(conversationId);
    fetchMessages(conversationId);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      return 'N/A';
    }
  };

  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedConversationId || sendingMessage) return;
    
    setSendingMessage(true);
    const messageText = messageInput.trim();
    setMessageInput('');
    
    try {
      // Optimistically add message to UI
      const tempMessage = {
        _id: `temp-${Date.now()}`,
        content: messageText,
        sender: 'agent',
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, tempMessage]);
      
      // Send to API
      await agentApiRequest(`/api/agent/conversations/${selectedConversationId}/reply`, {
        method: 'POST',
        token: agentToken,
        data: { message: messageText }
      });
      
      // Refresh messages to get the actual message from server
      await fetchMessages(selectedConversationId);
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message: ' + (error.message || 'Unknown error'));
      // Restore input on error
      setMessageInput(messageText);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getBotName = (botId) => {
    if (!botId) return 'Unknown Website';
    const bot = bots[botId];
    return bot ? (bot.websiteUrl || bot.name || 'Unknown Website') : 'Loading...';
  };

  const selectedConversation = conversations.find(c => c._id === selectedConversationId);

  const getVisitorName = (conversation) => {
    return conversation?.sessionId || conversation?.userId || `Visitor ${conversation?._id?.slice(-4)}`;
  };

  const handleAcceptChat = async (conversationId, e) => {
    e.stopPropagation(); // Prevent opening the chat when clicking accept
    
    try {
      await agentApiRequest(`/api/agent/conversations/${conversationId}/accept`, {
        method: 'POST',
        token: agentToken
      });
      
      // Refresh conversations to update the list
      await fetchConversations();
      
      // If this conversation is selected, refresh its messages
      if (selectedConversationId === conversationId) {
        await fetchMessages(conversationId);
      }
    } catch (error) {
      console.error('Failed to accept chat:', error);
      alert('Failed to accept chat: ' + (error.message || 'Unknown error'));
    }
  };

  const handleCloseChat = async (conversationId) => {
    if (!confirm('Are you sure you want to close this conversation?')) return;
    
    try {
      await agentApiRequest(`/api/agent/conversations/${conversationId}/close`, {
        method: 'POST',
        token: agentToken
      });
      
      // Refresh conversations and clear selection if this was selected
      await fetchConversations();
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to close chat:', error);
      alert('Failed to close chat: ' + (error.message || 'Unknown error'));
    }
  };

  const logout = async () => {
    try {
      // Call backend logout to mark agent as offline
      await agentApiRequest('/api/agent/logout', {
        method: 'POST',
        token: agentToken
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with frontend logout even if backend call fails
    } finally {
      // Clear agent-specific storage
      localStorage.removeItem('agentToken');
      localStorage.removeItem('agentData');
      localStorage.removeItem('isAgent');
      localStorage.removeItem('agentTenant');
      authLogout();
    }
  };

  // Filter conversations based on status
  const filteredConversations = conversations.filter(conv => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'queued') return conv.status === 'queued' || conv.status === 'waiting';
    if (filterStatus === 'assigned') return (conv.status === 'assigned' || conv.status === 'active') && (conv.assignedAgent === agentId || conv.agentId === agentId);
    return true;
  });

  const getStatusBadge = (status) => {
    const badges = {
      'bot': '🤖 Bot',
      'waiting': '⏳ Waiting',
      'active': '✅ Active',
      'queued': '⏳ Queued',
      'assigned': '✅ Assigned',
      'closed': '🔒 Closed',
      'ai': '🤖 AI',
      'human': '👤 Human'
    };
    return badges[status] || status;
  };

  return (
    <div className="agent-panel-3col">
      {/* LEFT COLUMN: Dark Sidebar with Navigation */}
      <div className="dark-sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">📋</span>
          <span className="brand-text">Admin Panel</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-item" onClick={() => alert('Dashboard navigation not implemented yet')}>
            <span className="nav-icon">📊</span>
            <span className="nav-text">Dashboard</span>
          </div>
          <div className="nav-item active">
            <span className="nav-icon">💬</span>
            <span className="nav-text">Chat</span>
          </div>
          <div className="nav-subitem" onClick={() => fetchConversations()}>My Open Chats</div>
          <div className="nav-subitem" onClick={() => alert('Completed Chats not implemented yet')}>Completed Chats</div>
          <div className="nav-item" onClick={() => alert('Users navigation not implemented yet')}>
            <span className="nav-icon">👥</span>
            <span className="nav-text">Users</span>
          </div>
          <div className="nav-item" onClick={() => alert('Site Settings navigation not implemented yet')}>
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">Site Settings</span>
          </div>
          <div className="nav-item" onClick={() => alert('View Logs navigation not implemented yet')}>
            <span className="nav-icon">📜</span>
            <span className="nav-text">View Logs</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{agentUsername}</span>
          </div>
          <button onClick={logout} className="sidebar-logout-btn">Logout</button>
        </div>
      </div>

      {/* CENTER COLUMN: Chat List Panel */}
      <div className="chat-list-panel">
        <div className="chat-list-header">
          <h2>Ongoing Chats</h2>
          <button onClick={fetchConversations} className="refresh-icon-btn" disabled={conversationsLoading} title="Refresh">
            ↻
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="chat-filter-tabs">
          <button 
            className={`filter-tab ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All ({conversations.length})
          </button>
          <button 
            className={`filter-tab ${filterStatus === 'queued' ? 'active' : ''}`}
            onClick={() => setFilterStatus('queued')}
          >
            Queued ({conversations.filter(c => c.status === 'queued' || c.status === 'waiting').length})
          </button>
          <button 
            className={`filter-tab ${filterStatus === 'assigned' ? 'active' : ''}`}
            onClick={() => setFilterStatus('assigned')}
          >
            My Chats ({conversations.filter(c => (c.status === 'assigned' || c.status === 'active') && (c.assignedAgent === agentId || c.agentId === agentId)).length})
          </button>
        </div>

        {conversationsLoading && (
          <div className="chat-list-loading">
            <Loader message="Loading..." />
          </div>
        )}
        
        {conversationsError && (
          <div className="chat-list-error">
            <p>{conversationsError}</p>
            <button onClick={fetchConversations}>Retry</button>
          </div>
        )}

        {!conversationsLoading && !conversationsError && (
          <div className="chat-list-scroll">
            {filteredConversations.length === 0 ? (
              <div className="chat-list-empty">
                <p>No conversations matching filter</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv._id}
                  className={`chat-list-item ${selectedConversationId === conv._id ? 'active' : ''}`}
                  onClick={() => handleConversationClick(conv._id)}
                >
                  <div className="chat-list-item-main">
                    <span className="chat-visitor-icon">👤</span>
                    <div className="chat-list-item-content">
                      <div className="chat-list-visitor">{getVisitorName(conv)}</div>
                      <div className="chat-list-bot">{getBotName(conv.botId)}</div>
                      <div className="chat-list-status">{getStatusBadge(conv.status)}</div>
                    </div>
                    {(conv.status === 'queued' || conv.status === 'waiting') && (
                      <button 
                        className="accept-chat-btn"
                        onClick={(e) => handleAcceptChat(conv._id, e)}
                        title="Accept this chat"
                      >
                        Accept
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Chat Window */}
      <div className="chat-window-panel">
        {!selectedConversationId ? (
          <div className="chat-empty-state">
            <p>Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="chat-window-header">
              <div className="chat-window-header-left">
                <div className="chat-window-avatar">
                  <span>👤</span>
                </div>
                <div className="chat-window-info">
                  <div className="chat-window-visitor">{getVisitorName(selectedConversation)}</div>
                  <div className="chat-window-agent">{agentUsername}</div>
                </div>
              </div>
              <div className="chat-window-header-actions">
                {(selectedConversation?.status === 'assigned' || selectedConversation?.status === 'active') && (
                  <button 
                    className="close-conversation-btn"
                    onClick={() => handleCloseChat(selectedConversationId)}
                    title="Close conversation"
                  >
                    Close Chat
                  </button>
                )}
                <button 
                  className="chat-window-close"
                  onClick={() => setSelectedConversationId(null)}
                  title="Close window"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="chat-window-messages">
              {messagesLoading && (
                <div className="messages-loading">
                  <Loader message="Loading messages..." />
                </div>
              )}

              {messagesError && (
                <div className="messages-error">
                  <p>{messagesError}</p>
                  <button onClick={() => fetchMessages(selectedConversationId)}>Retry</button>
                </div>
              )}

              {!messagesLoading && !messagesError && (
                <div className="messages-scroll-area">
                  {messages.length === 0 ? (
                    <div className="messages-empty">
                      <p>No messages yet</p>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg) => {
                        const isAgent = msg.sender === 'agent';
                        const isUser = msg.sender === 'user';
                        const senderName = isAgent ? agentUsername : (isUser ? getVisitorName(selectedConversation) : 'Bot');
                        
                        return (
                          <div
                            key={msg._id || msg.id}
                            className={`message-row ${isAgent ? 'message-right' : 'message-left'}`}
                          >
                            <div className="message-avatar-circle">
                              {isAgent ? '👨‍💼' : '👤'}
                            </div>
                            <div className="message-content-wrapper">
                              <div className="message-sender-label">{senderName}</div>
                              <div className="message-text-bubble">
                                {msg.content || msg.text || '(empty message)'}
                              </div>
                              <div className="message-time-label">
                                {formatTime(msg.createdAt || msg.timestamp)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Conversation Status */}
                      {selectedConversation && (
                        <div className="conversation-end-status">
                          <p>Conversation Started</p>
                          <p>At {formatTime(selectedConversation.createdAt)}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Message Input Box */}
            <div className="chat-window-input">
              <input
                type="text"
                className="message-input-field"
                placeholder="Type here..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={sendingMessage}
              />
              <button 
                className="message-send-button"
                onClick={sendMessage}
                disabled={!messageInput.trim() || sendingMessage}
                title="Send message"
              >
                <span className="send-icon">➤</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AgentPanel;
