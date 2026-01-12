// src/pages/AgentPanel.jsx

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import { API_BASE_URL } from '../config';
import Loader from '../components/Loader';
import '../styles/AgentPanel.css';

function AgentPanel() {
  const { user, token, logout } = useAuth();
  // Helper to call backend mounted at exact '/agents' path.
  const getBackendBase = () => API_BASE_URL.replace(/\/api\/?$/i, '');

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

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = useCallback(async () => {
    setConversationsLoading(true);
    setConversationsError('');
    
    try {
      const data = await agentApiRequest('/agents/conversations', { method: 'GET', token });
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
  }, [token]);

  const fetchBotDetails = async (botIds) => {
    const botMap = {};
    
    for (const botId of botIds) {
      try {
        const botData = await apiRequest(`/bots/${botId}`, { token });
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
      const data = await agentApiRequest(`/agents/conversations/${conversationId}/messages`, { method: 'GET', token });
      setMessages(data.messages || data || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setMessagesError(error.message || 'Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  }, [token]);

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
      await agentApiRequest(`/agents/conversations/${selectedConversationId}/reply`, {
        method: 'POST',
        token,
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
            <span className="user-name">{user?.username || 'Agent'}</span>
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
            {conversations.length === 0 ? (
              <div className="chat-list-empty">
                <p>No active conversations</p>
              </div>
            ) : (
              conversations.map((conv) => (
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
                    </div>
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
                  <div className="chat-window-agent">{user?.username || 'Agent'}</div>
                </div>
              </div>
              <button 
                className="chat-window-close"
                onClick={() => setSelectedConversationId(null)}
                title="Close conversation"
              >
                ✕
              </button>
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
                        const senderName = isAgent ? (user?.username || 'Agent') : (isUser ? getVisitorName(selectedConversation) : 'Bot');
                        
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
