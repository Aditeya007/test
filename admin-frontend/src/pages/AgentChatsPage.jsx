// src/pages/AgentChatsPage.jsx

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Loader from '../components/Loader';
import '../styles/ChatsPage.css';

function AgentChatsPage() {
  const { user, token } = useAuth();
  const { agentId } = useParams();
  const navigate = useNavigate();
  
  // Conversations state (filtered to only this agent)
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState('');
  
  // Selected conversation and messages
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  
  // Bot mapping
  const [bots, setBots] = useState({});
  
  // Agent info
  const [agentInfo, setAgentInfo] = useState(null);
  
  // Socket.IO ref
  const socketRef = useRef(null);
  const selectedConversationRef = useRef(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    // Dynamically load Socket.IO client library
    const loadSocketIO = async () => {
      if (window.io) {
        initializeSocket();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        console.log('Agent Chats Page: Socket.IO client library loaded');
        initializeSocket();
      };
      script.onerror = () => {
        console.error('Agent Chats Page: Failed to load Socket.IO client library');
      };
      document.head.appendChild(script);
    };

    const initializeSocket = () => {
      if (socketRef.current?.connected) {
        console.log('Agent Chats Page: Socket.IO already connected');
        return;
      }

      try {
        const socketUrl = window.location.origin;
        socketRef.current = window.io(socketUrl, {
          auth: { token },
          transports: ['websocket', 'polling']
        });

        socketRef.current.on('connect', () => {
          console.log('Agent Chats Page: Socket.IO connected');
          // Join tenant-wide room for real-time updates
          if (user && user._id) {
            const tenantId = user._id || user.id;
            socketRef.current.emit('join:tenant', tenantId);
            console.log(`Agent Chats Page: Joined tenant room: tenant:${tenantId}`);
          }
        });

        socketRef.current.on('message:new', (data) => {
          console.log('Agent Chats Page: Received message:new:', data);
          
          // Only update if this message is for the selected conversation AND from the selected agent
          if (data.conversationId === selectedConversationRef.current) {
            // Find the conversation to check if it belongs to this agent
            const conversation = conversations.find(c => c._id === data.conversationId);
            if (conversation && conversation.assignedAgent === agentId) {
              setMessages(prev => {
                // Check if message already exists
                if (prev.find(m => m._id === data._id)) {
                  return prev;
                }
                return [...prev, {
                  _id: data._id,
                  sender: data.sender,
                  text: data.text,
                  createdAt: data.createdAt,
                  sources: data.sources,
                  metadata: data.metadata
                }];
              });

              // Auto-scroll to bottom after a brief delay
              setTimeout(() => {
                const messagesArea = document.querySelector('.messages-scroll-area');
                if (messagesArea) {
                  messagesArea.scrollTop = messagesArea.scrollHeight;
                }
              }, 100);
            }
          }

          // Update conversation list - only for this agent's conversations
          const conversation = conversations.find(c => c._id === data.conversationId);
          if (conversation && conversation.assignedAgent === agentId) {
            setConversations(prev => prev.map(conv =>
              conv._id === data.conversationId
                ? { ...conv, lastActiveAt: data.createdAt }
                : conv
            ).sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt)));
          }
        });

        socketRef.current.on('conversation:closed', (data) => {
          console.log('Agent Chats Page: Received conversation:closed:', data);
          const conversationId = data.conversationId || data._id;
          
          // Only update if this conversation belongs to this agent
          const conversation = conversations.find(c => c._id === conversationId);
          if (conversation && conversation.assignedAgent === agentId) {
            setConversations(prev =>
              prev.map(c =>
                c._id === conversationId
                  ? { ...c, status: 'closed' }
                  : c
              )
            );
            if (selectedConversationRef.current === conversationId) {
              setSelectedConversationId(null);
              setMessages([]);
            }
          }
        });

        socketRef.current.on('connect_error', (error) => {
          console.error('Agent Chats Page: Socket.IO connection error:', error);
        });

      } catch (error) {
        console.error('Agent Chats Page: Failed to initialize Socket.IO:', error);
      }
    };

    loadSocketIO();

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        console.log('Agent Chats Page: Disconnecting Socket.IO');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [token, user, agentId, conversations]);

  // Update selected conversation ref
  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // Fetch conversations for this specific agent
  const fetchConversations = useCallback(async () => {
    if (!token || !user || !agentId) return;

    setConversationsLoading(true);
    setConversationsError('');

    try {
      const response = await apiRequest(`/user/agents/${agentId}/conversations`, {
        method: 'GET',
        token
      });

      if (response.conversations) {
        // Sort by most recent activity
        const sorted = response.conversations.sort((a, b) =>
          new Date(b.lastActiveAt) - new Date(a.lastActiveAt)
        );
        setConversations(sorted);

        // Fetch bot details
        const botIds = [...new Set(sorted.map(c => c.botId).filter(Boolean))];
        if (botIds.length > 0) {
          await fetchBotDetails(botIds);
        }
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      setConversationsError(error.message || 'Failed to load conversations');
    } finally {
      setConversationsLoading(false);
    }
  }, [token, user, agentId]);

  // Fetch bot details
  const fetchBotDetails = async (botIds) => {
    const botMap = {};
    for (const botId of botIds) {
      try {
        const response = await apiRequest(`/bot/${botId}`, {
          method: 'GET',
          token
        });
        botMap[botId] = response.bot || response;
      } catch (error) {
        console.error(`Failed to fetch bot ${botId}:`, error);
        botMap[botId] = { name: 'Unknown Website' };
      }
    }
    setBots(botMap);
  };

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (conversationId) => {
    if (!token || !conversationId) return;

    setMessagesLoading(true);
    setMessagesError('');

    try {
      const response = await apiRequest(`/user/conversations/${conversationId}/messages`, {
        method: 'GET',
        token
      });

      if (response.messages) {
        setMessages(response.messages);

        // Auto-scroll to bottom
        setTimeout(() => {
          const messagesArea = document.querySelector('.messages-scroll-area');
          if (messagesArea) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
          }
        }, 100);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setMessagesError(error.message || 'Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  }, [token]);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Handle conversation selection
  const handleConversationClick = (conversationId) => {
    setSelectedConversationId(conversationId);
    fetchMessages(conversationId);
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'N/A';
    }
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const statusMap = {
      'waiting': { label: 'Waiting', class: 'status-waiting' },
      'active': { label: 'Active', class: 'status-active' },
      'queued': { label: 'Queued', class: 'status-queued' },
      'assigned': { label: 'Assigned', class: 'status-assigned' },
      'closed': { label: 'Closed', class: 'status-closed' },
      'bot': { label: 'AI Chat', class: 'status-bot' },
      'ai': { label: 'AI Chat', class: 'status-bot' },
      'human': { label: 'Waiting Human', class: 'status-waiting' }
    };

    const statusInfo = statusMap[status] || { label: status, class: 'status-unknown' };
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.label}</span>;
  };

  // Get message sender class and label
  const getMessageClass = (sender) => {
    return `message message-${sender}`;
  };

  const getMessageSenderLabel = (sender) => {
    const senderMap = {
      'user': 'Client',
      'bot': 'AI',
      'agent': 'Agent'
    };
    return senderMap[sender] || sender;
  };

  // Get bot name
  const getBotName = (botId) => {
    if (!botId) return 'Unknown Website';
    const bot = bots[botId];
    return bot ? (bot.websiteUrl || bot.name || 'Unknown Website') : 'Loading...';
  };

  const selectedConversation = conversations.find(c => c._id === selectedConversationId);

  if (conversationsLoading && conversations.length === 0) {
    return (
      <div className="chats-page-loader">
        <Loader />
        <p>Loading conversations...</p>
      </div>
    );
  }

  return (
    <div className="chats-page">
      {/* Left Panel - Conversations List */}
      <div className="chats-left-panel">
        <div className="chats-header">
          <h2 className="chats-title">Agent Chats</h2>
          <p className="chats-subtitle">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate('/agents')}
            style={{ marginTop: '10px', fontSize: '0.85rem' }}
          >
            ← Back to Agents
          </button>
        </div>

        <div className="chats-list">
          {conversationsError && (
            <div className="error-message">{conversationsError}</div>
          )}

          {conversations.length === 0 && !conversationsError && (
            <div className="empty-state">
              <p className="empty-icon">💬</p>
              <p className="empty-text">No conversations for this agent</p>
            </div>
          )}

          {conversations.map((conversation) => (
            <div
              key={conversation._id}
              className={`conversation-item ${
                selectedConversationId === conversation._id ? 'active' : ''
              }`}
              onClick={() => handleConversationClick(conversation._id)}
            >
              <div className="conversation-info">
                <div className="conversation-header">
                  <h3 className="conversation-agent">
                    {conversation.sessionId || `Session ${conversation._id?.slice(-4)}`}
                  </h3>
                  <span className="conversation-time">
                    {formatTime(conversation.lastActiveAt)}
                  </span>
                </div>

                <div className="conversation-footer">
                  <span className="conversation-bot">
                    {getBotName(conversation.botId)}
                  </span>
                  {getStatusBadge(conversation.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Messages */}
      <div className="chats-right-panel">
        {!selectedConversationId ? (
          <div className="empty-chat">
            <p className="empty-icon">👈</p>
            <p className="empty-text">Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            {/* Messages Header */}
            <div className="messages-header">
              <div className="messages-header-info">
                {selectedConversation && (
                  <>
                    <h3 className="messages-title">
                      {selectedConversation.sessionId || `Session ${selectedConversation._id?.slice(-4)}`}
                    </h3>
                    <p className="messages-subtitle">
                      {getBotName(selectedConversation.botId)}
                    </p>
                  </>
                )}
              </div>
              <div className="messages-header-status">
                {selectedConversation && getStatusBadge(selectedConversation.status)}
              </div>
            </div>

            {/* Messages Area */}
            <div className="messages-scroll-area">
              {messagesError && (
                <div className="error-message">{messagesError}</div>
              )}

              {messagesLoading && (
                <div className="messages-loader">
                  <Loader />
                </div>
              )}

              {!messagesLoading && messages.length === 0 && !messagesError && (
                <div className="empty-messages">
                  <p className="empty-icon">📭</p>
                  <p className="empty-text">No messages in this conversation</p>
                </div>
              )}

              {messages.map((message) => (
                <div key={message._id} className={getMessageClass(message.sender)}>
                  <div className="message-bubble">
                    <div className="message-sender">
                      {getMessageSenderLabel(message.sender)}
                    </div>
                    <div className="message-text">{message.text}</div>
                    {message.sources && message.sources.length > 0 && (
                      <div className="message-sources">
                        <div className="sources-label">Sources:</div>
                        {message.sources.map((source, idx) => (
                          <div key={idx} className="source-item">{source}</div>
                        ))}
                      </div>
                    )}
                    <div className="message-time">
                      {formatTime(message.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Read-Only Notice */}
            <div className="messages-footer">
              <p className="read-only-notice">
                <span className="lock-icon">🔒</span>
                Read-only chat view. Messages are displayed live.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AgentChatsPage;
