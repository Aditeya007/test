// src/pages/AgentChatsPage.jsx

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import Loader from '../components/Loader';
import '../styles/AgentPanel.css';

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
  const messagesScrollRef = useRef(null);

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

              // Auto-scroll to bottom (handled by useEffect)
              if (messagesScrollRef.current) {
                requestAnimationFrame(() => {
                  if (messagesScrollRef.current) {
                    messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
                  }
                });
              }
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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && !messagesLoading && messagesScrollRef.current) {
      // Use requestAnimationFrame for smoother, more efficient scrolling
      requestAnimationFrame(() => {
        if (messagesScrollRef.current) {
          messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages.length, messagesLoading]);

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
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      return 'N/A';
    }
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const badges = {
      bot: '🤖 Bot',
      waiting: '⏳ Waiting',
      active: '✅ Active',
      queued: '⏳ Queued',
      assigned: '✅ Assigned',
      closed: '🔒 Closed',
      ai: '🤖 AI',
      human: '👤 Human',
    };
    return badges[status] || status;
  };

  // Get visitor name
  const getVisitorName = (conversation) => {
    // Use the visitorName from the conversation if available (fetched from Lead collection)
    if (conversation?.visitorName) {
      return conversation.visitorName;
    }
    // Fallback to a generic visitor label
    return `Visitor ${conversation?._id?.slice(-4) || 'Unknown'}`;
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
    <div className="agent-panel-3col">
      {/* LEFT COLUMN: Chat List Panel */}
      <div className="chat-list-panel">
        <div className="chats-header">
          <h2 className="chats-title">Agent Chats</h2>
          <p className="chats-subtitle">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
          <button
            type="button"
            className="back-to-agents-btn"
            onClick={() => navigate('/agents')}
          >
            ← BACK TO AGENTS
          </button>
        </div>

        {conversationsLoading && (
          <div className="chat-list-loading">
            <Loader message="Loading conversations..." />
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
                <div className="empty-state-icon">💬</div>
                <p>No conversations for this agent</p>
                <span className="empty-state-subtitle">
                  Conversations will appear here
                </span>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv._id}
                  className={`chat-list-item ${
                    selectedConversationId === conv._id ? 'active' : ''
                  }`}
                  onClick={() => handleConversationClick(conv._id)}
                >
                  <div className="chat-list-item-main">
                    <span className="chat-visitor-icon">👤</span>
                    <div className="chat-list-item-content">
                      <div className="chat-list-visitor">
                        {getVisitorName(conv)}
                      </div>
                      <div className="chat-list-bot">
                        {getBotName(conv.botId)}
                      </div>
                      <div className="chat-list-status">
                        {getStatusBadge(conv.status)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Chat Window Panel */}
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
                  <div className="chat-window-visitor">
                    {getVisitorName(selectedConversation)}
                  </div>
                  <div className="chat-window-agent">
                    {getBotName(selectedConversation?.botId)}
                  </div>
                </div>
              </div>
              <div className="chat-window-header-actions">
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
                  <button
                    onClick={() => fetchMessages(selectedConversationId)}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!messagesLoading && !messagesError && (
                <div className="messages-scroll-area" ref={messagesScrollRef}>
                  {messages.length === 0 ? (
                    <div className="messages-empty">
                      <p>No messages yet</p>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, index) => {
                        const isAgent = msg.sender === 'agent';
                        const isUser = msg.sender === 'user';
                        const senderName = isAgent
                          ? 'Agent'
                          : isUser
                          ? getVisitorName(selectedConversation)
                          : 'Bot';

                        return (
                          <div key={msg._id || msg.id}>
                            <div
                              className={`message-row ${
                                isAgent ? 'message-right' : 'message-left'
                              }`}
                            >
                              <div className="message-avatar-circle">
                                {isAgent ? '👨‍💼' : '👤'}
                              </div>
                              <div className="message-content-wrapper">
                                <div className="message-sender-label">
                                  {senderName}
                                </div>
                                <div className="message-text-bubble">
                                  {msg.content ||
                                    msg.text ||
                                    '(empty message)'}
                                </div>
                                <div className="message-time-label">
                                  {formatTime(msg.createdAt || msg.timestamp)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AgentChatsPage;
