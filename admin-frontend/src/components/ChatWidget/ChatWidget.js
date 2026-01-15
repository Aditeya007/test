// src/components/ChatWidget/ChatWidget.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useChatWidget } from '../../context/ChatWidgetContext';
import useApi from '../../hooks/useApi';
import io from 'socket.io-client';
import './ChatWidget.css';

// Helper component for the close icon in the header
const HeaderCloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

const ChatWidget = ({ toggleChatbot, onSessionIdUpdate }) => {
    const { user, activeTenant } = useAuth();
    const { execute, loading } = useApi();
    const { selectedBotId } = useChatWidget();
    
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [conversationId, setConversationId] = useState(null);
    const messagesEndRef = useRef(null);
    const socketRef = useRef(null);

    const isUser = user?.role === 'user';
    const activeTenantId = activeTenant?.id || activeTenant?._id || null;
    const effectiveTenantId = isUser ? (user?.id || user?._id) : activeTenantId;

    // Close session and deliver lead data
    const closeSession = useCallback(() => {
        if (!sessionId || !selectedBotId) {
            return;
        }

        const payload = {
            session_id: sessionId,
            resource_id: selectedBotId
        };

        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const url = `${apiUrl}/api/chat/session/close`;

        // Prefer sendBeacon for reliability during page unload
        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
            console.log('ChatWidget: Session close sent via sendBeacon');
        } else {
            // Fallback to fetch with keepalive
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(err => {
                console.error('ChatWidget: Failed to close session:', err);
            });
            console.log('ChatWidget: Session close sent via fetch with keepalive');
        }
    }, [sessionId, selectedBotId]);

    // CRITICAL FIX #1: Validate botId on mount
    useEffect(() => {
        if (!selectedBotId) {
            console.warn('⚠️ ChatWidget mounted without selectedBotId');
        }
    }, [selectedBotId]);

    // Initialize the chat with a welcome message
    useEffect(() => {
        const newSessionId = `widget_session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        setSessionId(newSessionId);
        
        // Notify parent wrapper of sessionId for close handling
        if (onSessionIdUpdate) {
            onSessionIdUpdate(newSessionId);
        }
        
        // CRITICAL FIX #2: Show appropriate welcome based on botId presence
        if (!selectedBotId) {
            setMessages([{
                text: "Please select a website from your dashboard to start chatting.",
                sender: 'bot',
                isError: true,
                id: `welcome_${Date.now()}`
            }]);
        } else {
            setMessages([{
                text: "Hello! I'm an AI assistant. How can I help you today?",
                sender: 'bot',
                id: `welcome_${Date.now()}`
            }]);
        }
    }, [selectedBotId, onSessionIdUpdate]);

    // Automatically scroll to the latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth"
        });
    }, [messages]);

    // Socket.IO connection effect - listen for real-time messages
    useEffect(() => {
        if (!conversationId) {
            // No conversation yet, can't connect
            return;
        }

        // Initialize socket connection to backend
        const socketUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        socketRef.current = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        socketRef.current.on('connect', () => {
            console.log('ChatWidget: Socket connected:', socketRef.current.id);
            // Join the conversation room
            socketRef.current.emit('join:conversation', conversationId);
        });

        socketRef.current.on('disconnect', (reason) => {
            console.log('ChatWidget: Socket disconnected:', reason);
        });

        // Listen for new messages
        socketRef.current.on('message:new', (message) => {
            console.log('ChatWidget: Received real-time message:', message);
            
            // Check if message is for this conversation
            if (message.conversationId === conversationId) {
                setMessages(prev => {
                    // Check if message already exists to prevent duplicates
                    const exists = prev.some(msg => 
                        msg.id === message._id || 
                        msg.id === message.id ||
                        (msg.text === message.text && msg.sender === message.sender && 
                         Math.abs(new Date(msg.createdAt || Date.now()) - new Date(message.createdAt)) < 1000)
                    );
                    
                    if (exists) {
                        console.log('ChatWidget: Skipping duplicate message');
                        return prev;
                    }
                    
                    // Add new message
                    return [...prev, {
                        id: message._id || message.id || `msg_${Date.now()}`,
                        text: message.text || message.content,
                        sender: message.sender,
                        createdAt: message.createdAt
                    }];
                });
            }
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('ChatWidget: Socket connection error:', error);
        });

        // Cleanup on unmount or when conversationId changes
        return () => {
            if (socketRef.current) {
                console.log('ChatWidget: Disconnecting socket');
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [conversationId]);

    // Handle page unload and component unmount - close session
    useEffect(() => {
        const handleBeforeUnload = () => {
            closeSession();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            // Call on unmount
            closeSession();
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [closeSession]);

    // This is the function that sends the request to the backend.
    const handleSend = useCallback(async () => {
        if (input.trim() === '' || loading) return;

        // CRITICAL FIX #1: Validate effectiveTenantId
        if (!effectiveTenantId) {
            const errorMessage = user?.role === 'admin' 
                ? 'Please create or select a user before interacting with the bot.'
                : 'Your account is not fully set up. Please contact your administrator.';
            
            setMessages(prev => [...prev, {
                text: errorMessage,
                sender: 'bot',
                isError: true,
                id: `error_${Date.now()}`
            }]);
            return;
        }

        // CRITICAL FIX #1: Validate botId BEFORE adding user message
        if (!selectedBotId) {
            setMessages(prev => [...prev, {
                text: 'No website selected. Please select a website from your dashboard to activate the chatbot.',
                sender: 'bot',
                isError: true,
                id: `error_${Date.now()}`
            }]);
            return;
        }

        const userMessage = { 
            text: input, 
            sender: 'user',
            id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        };
        setMessages(prev => [...prev, userMessage]);
        const currentInput = input;
        setInput('');

        // Call the backend API with botId (already validated above)
        const result = await execute('/bot/run', {
            method: 'POST',
            data: { 
                input: currentInput, 
                sessionId, 
                tenantUserId: effectiveTenantId,
                botId: selectedBotId
            },
        });

        if (result.success && result.data?.answer) {
            if (result.data.session_id) {
                setSessionId(result.data.session_id);
                // Update parent wrapper with new sessionId
                if (onSessionIdUpdate) {
                    onSessionIdUpdate(result.data.session_id);
                }
            }

            // Extract and store conversationId for socket connection
            if (result.data.conversationId || result.data.conversation?._id) {
                const convId = result.data.conversationId || result.data.conversation._id;
                setConversationId(convId);
            }

            setMessages(prev => [...prev, { 
                text: result.data.answer, 
                sender: 'bot',
                id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
            }]);

            // Add sources if available - DEFENSIVE: Check array and length
            if (Array.isArray(result.data.sources) && result.data.sources.length > 0) {
                setMessages(prev => [...prev, {
                    text: `Sources:\\n${result.data.sources.map((src, index) => `${index + 1}. ${src || 'Unknown source'}`).join('\\n')}`,
                    sender: 'bot',
                    id: `sources_${Date.now()}`
                }]);
            }
        } else {
            const errorMessage = result.error || 'Bot service is unavailable right now.';
            setMessages(prev => [...prev, {
                text: errorMessage,
                sender: 'bot',
                isError: true,
                id: `error_${Date.now()}`
            }]);
        }
    }, [input, loading, effectiveTenantId, sessionId, selectedBotId, execute, user]);

    // Allows sending message with the Enter key
    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !loading) {
            handleSend();
        }
    };

    // Handle close button click
    const handleClose = () => {
        closeSession();
        toggleChatbot();
    };

    return ( 
        <div className="rag-chatbot-container">
            <div className="chatbot-header">
                <h3>AI Assistant</h3>
                <button onClick={handleClose} className="close-chatbot-btn" aria-label="Close Chatbot">
                   <HeaderCloseIcon />
                </button>
            </div>

            <div className="chatbot-messages">
                {messages.map((msg) => (
                    <div key={msg.id} className={`message ${msg.sender} ${msg.isError ? 'error' : ''}`}>
                        {msg.text.split('\n').map((line, index) => (
                            <p key={`${msg.id}-line-${index}`}>{line}</p>
                        ))}
                    </div>
                ))} 
                {loading && (
                    <div className="message bot">
                        <div className="typing-indicator">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="chatbot-input-area">
                <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask a question..."
                    disabled={loading}
                />
                <button onClick={handleSend} disabled={loading || input.trim() === ''}>
                    {loading ? 'Sending…' : 'Send'}
                </button> 
            </div> 
        </div>
    );
};

export default ChatWidget;
