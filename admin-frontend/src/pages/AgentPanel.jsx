// src/pages/AgentPanel.jsx

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import Loader from '../components/Loader';
import '../styles/AgentPanel.css';

function AgentPanel() {
  const { user, token, logout } = useAuth();
  
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

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = useCallback(async () => {
    setConversationsLoading(true);
    setConversationsError('');
    
    try {
      const data = await apiRequest('/api/conversations', { token });
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
        const botData = await apiRequest(`/api/bots/${botId}`, { token });
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
      const data = await apiRequest(`/api/conversations/${conversationId}/messages`, { token });
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
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    } catch (error) {
      return 'N/A';
    }
  };

  const getLastMessagePreview = (conversation) => {
    if (!conversation.lastMessage) return 'No messages';
    
    const text = conversation.lastMessage.content || conversation.lastMessage.text || '';
    return text.length > 60 ? text.substring(0, 60) + '...' : text;
  };

  const getBotName = (botId) => {
    if (!botId) return 'Unknown Website';
    const bot = bots[botId];
    return bot ? (bot.websiteUrl || bot.name || 'Unknown Website') : 'Loading...';
  };

  const selectedConversation = conversations.find(c => c._id === selectedConversationId);

  return (
    <div className="agent-panel">
      {/* Header */}
      <div className="agent-panel-header">
        <div className="agent-panel-title">
          <h1>Agent Inbox</h1>
          <p className="agent-info">
            Logged in as: <strong>{user?.username || 'Agent'}</strong>
          </p>
        </div>
        <button onClick={logout} className="logout-btn">
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div className="agent-panel-content">
        {/* Left Side: Conversations List */}
        <div className="conversations-panel">
          <div className="conversations-header">
            <h2>Conversations</h2>
            <button onClick={fetchConversations} className="refresh-btn" disabled={conversationsLoading}>
              {conversationsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {conversationsLoading && <Loader message="Loading conversations..." />}
          
          {conversationsError && (
            <div className="error-message">
              <p>{conversationsError}</p>
              <button onClick={fetchConversations}>Retry</button>
            </div>
          )}

          {!conversationsLoading && !conversationsError && (
            <div className="conversations-list">
              {conversations.length === 0 ? (
                <div className="empty-state">
                  <p>No conversations yet</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv._id}
                    className={`conversation-item ${selectedConversationId === conv._id ? 'active' : ''}`}
                    onClick={() => handleConversationClick(conv._id)}
                  >
                    <div className="conversation-header-row">
                      <span className="session-id">Session: {conv.sessionId || conv._id}</span>
                      <span className="conversation-time">{formatTime(conv.lastMessageAt || conv.updatedAt)}</span>
                    </div>
                    <div className="conversation-website">
                      {getBotName(conv.botId)}
                    </div>
                    <div className="conversation-preview">
                      {getLastMessagePreview(conv)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right Side: Messages View */}
        <div className="messages-panel">
          {!selectedConversationId ? (
            <div className="empty-state">
              <p>Select a conversation to view messages</p>
            </div>
          ) : (
            <>
              <div className="messages-header">
                <div>
                  <h2>Conversation Details</h2>
                  {selectedConversation && (
                    <div className="conversation-meta">
                      <p><strong>Session ID:</strong> {selectedConversation.sessionId || selectedConversation._id}</p>
                      <p><strong>Website:</strong> {getBotName(selectedConversation.botId)}</p>
                      <p><strong>Started:</strong> {formatTime(selectedConversation.createdAt)}</p>
                    </div>
                  )}
                </div>
              </div>

              {messagesLoading && <Loader message="Loading messages..." />}

              {messagesError && (
                <div className="error-message">
                  <p>{messagesError}</p>
                  <button onClick={() => fetchMessages(selectedConversationId)}>Retry</button>
                </div>
              )}

              {!messagesLoading && !messagesError && (
                <div className="messages-list">
                  {messages.length === 0 ? (
                    <div className="empty-state">
                      <p>No messages in this conversation</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg._id || msg.id}
                        className={`message-item message-${msg.sender || 'user'}`}
                      >
                        <div className="message-header">
                          <span className="message-sender">
                            {msg.sender === 'user' && '👤 Visitor'}
                            {msg.sender === 'bot' && '🤖 Bot'}
                            {msg.sender === 'agent' && '👨‍💼 Agent'}
                          </span>
                          <span className="message-time">{formatTime(msg.createdAt || msg.timestamp)}</span>
                        </div>
                        <div className="message-content">
                          {msg.content || msg.text || '(empty message)'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentPanel;
