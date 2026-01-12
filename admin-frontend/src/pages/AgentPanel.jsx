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
      const data = await apiRequest('/api/conversation', { token });
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
      await apiRequest(`/api/conversations/${selectedConversationId}/reply`, {
        method: 'POST',
        token,
        body: { message: messageText }
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

  const getVisitorName = (conversation) => {
    return conversation?.sessionId || conversation?.userId || `Visitor ${conversation?._id?.slice(-4)}`;
  };

  return (
    <div className="agent-panel-container">
      {/* Left Sidebar - Conversations List */}
      <div className="agent-sidebar">
        <div className="sidebar-header">
          <h2>Ongoing Chats</h2>
          <button onClick={fetchConversations} className="refresh-icon-btn" disabled={conversationsLoading} title="Refresh">
            ↻
          </button>
        </div>

        {conversationsLoading && <Loader message="Loading..." />}
        
        {conversationsError && (
          <div className="sidebar-error">
            <p>{conversationsError}</p>
            <button onClick={fetchConversations}>Retry</button>
          </div>
        )}

        {!conversationsLoading && !conversationsError && (
          <div className="conversations-scrollable">
            {conversations.length === 0 ? (
              <div className="sidebar-empty">
                <p>No active conversations</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv._id}
                  className={`conversation-row ${selectedConversationId === conv._id ? 'active' : ''}`}
                  onClick={() => handleConversationClick(conv._id)}
                >
                  <div className="conversation-visitor-name">
                    {getVisitorName(conv)}
                  </div>
                  <div className="conversation-bot-name">
                    {getBotName(conv.botId)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right Side - Chat Window */}
      <div className="agent-chat-area">
        {!selectedConversationId ? (
          <div className="chat-empty-state">
            <p>Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            {/* Top Header */}
            <div className="chat-header">
              <div className="chat-header-left">
                <div className="chat-header-avatar">
                  <span>👤</span>
                </div>
                <div className="chat-header-info">
                  <div className="chat-header-visitor">{getVisitorName(selectedConversation)}</div>
                  <div className="chat-header-agent">{user?.username || 'Agent'}</div>
                </div>
              </div>
              <button 
                className="chat-close-btn"
                onClick={() => setSelectedConversationId(null)}
                title="Close conversation"
              >
                ✕
              </button>
            </div>

            {/* Messages Area */}
            <div className="chat-messages-container">
              {messagesLoading && <Loader message="Loading messages..." />}

              {messagesError && (
                <div className="chat-error">
                  <p>{messagesError}</p>
                  <button onClick={() => fetchMessages(selectedConversationId)}>Retry</button>
                </div>
              )}

              {!messagesLoading && !messagesError && (
                <div className="chat-messages-scroll">
                  {messages.length === 0 ? (
                    <div className="chat-empty">
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
                            className={`chat-message ${isAgent ? 'message-right' : 'message-left'}`}
                          >
                            <div className="message-avatar">
                              {isAgent ? '👨‍💼' : '👤'}
                            </div>
                            <div className="message-bubble-wrapper">
                              <div className="message-sender-name">{senderName}</div>
                              <div className="message-bubble">
                                {msg.content || msg.text || '(empty message)'}
                              </div>
                              <div className="message-timestamp">
                                {formatTime(msg.createdAt || msg.timestamp)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Conversation Status */}
                      {selectedConversation && (
                        <div className="conversation-status">
                          <p>Conversation Started</p>
                          <p>At {formatTime(selectedConversation.createdAt)}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Message Input */}
            <div className="chat-input-container">
              <input
                type="text"
                className="chat-input"
                placeholder="Type here..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={sendingMessage}
              />
              <button 
                className="chat-send-btn"
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

      {/* Logout Button - Top Right */}
      <button onClick={logout} className="agent-logout-btn" title="Logout">
        Logout
      </button>
    </div>
  );
}

export default AgentPanel;
