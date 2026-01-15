// src/components/ChatWidget/ChatWidgetWrapper.js

import React, { useRef } from 'react';
import ChatWidget from './ChatWidget';
import { useChatWidget } from '../../context/ChatWidgetContext';
import './ChatWidgetWrapper.css';

// Using inline SVGs is a great practice for widgets as it avoids extra file requests.
// This is the icon for the launcher button when the chat is closed.
const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

// This is the 'X' icon for the launcher button when the chat is open.
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

function ChatWidgetWrapper() {
  const { isWidgetActive, isWidgetOpen, selectedBotId, toggleWidget } = useChatWidget();
  const sessionIdRef = useRef(null);

  // Close session and hide widget - guarantees lead delivery
  const handleToggleWidget = () => {
    if (isWidgetOpen && sessionIdRef.current && selectedBotId) {
      // Widget is closing - send session close IMMEDIATELY
      const payload = {
        session_id: sessionIdRef.current,
        resource_id: selectedBotId
      };

      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const url = `${apiUrl}/api/chat/session/close`;

      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(() => {});
      }
    }

    // Then toggle widget visibility
    toggleWidget();
  };

  // Expose sessionId setter to ChatWidget
  const handleSessionIdUpdate = (sessionId) => {
    sessionIdRef.current = sessionId;
  };

  // CRITICAL FIX #2: Don't render anything if widget hasn't been activated
  if (!isWidgetActive) {
    return null;
  }

  // CRITICAL FIX #2: Show message if no bot selected but widget is activated
  const hasValidBot = Boolean(selectedBotId);

  return (
    // This is the "force field" ID. All our styles will be scoped to this.
    <div id="rag-widget-root">
      
      {/* The Chatbot Window Container */}
      {/* It's always in the DOM, but its visibility and position are controlled by the 'open' class. */}
      <div className={`chatbot-window-container ${isWidgetOpen ? 'open' : ''}`}>
        {/* We pass the toggle function down so the chatbot can close itself. */}
        {hasValidBot ? (
          <ChatWidget 
            toggleChatbot={handleToggleWidget} 
            onSessionIdUpdate={handleSessionIdUpdate}
          />
        ) : (
          <div className="rag-chatbot-container">
            <div className="chatbot-header">
              <h3>AI Assistant</h3>
              <button onClick={handleToggleWidget} className="close-chatbot-btn" aria-label="Close Chatbot">
                <HeaderCloseIcon />
              </button>
            </div>
            <div className="chatbot-messages" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No website selected</p>
              <p style={{ fontSize: '0.875rem' }}>Please select a website from your dashboard to start chatting.</p>
            </div>
          </div>
        )}
      </div>

      {/* The Launcher Button */}
      {/* This is the entry point for the user. It floats on the page. */}
      <button className="chatbot-launcher-button" onClick={handleToggleWidget} aria-label="Toggle Chatbot">
        {/* We conditionally render the icon based on the 'isOpen' state. */}
        {isWidgetOpen ? <CloseIcon /> : <ChatIcon />}
      </button>

    </div>
  );
}

export default ChatWidgetWrapper;
