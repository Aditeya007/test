// src/pages/BotPage.js

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChatWidget } from '../context/ChatWidgetContext';

import '../styles/index.css';

// Chat icon SVG
const ChatIconLarge = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

function BotPage() {
  const navigate = useNavigate();
  const { botId } = useParams();
  const { user, activeTenant } = useAuth();
  const { isWidgetActive, activateWidget, openWidget } = useChatWidget();

  const isUser = user?.role === 'user';
  const activeTenantId = activeTenant?.id || activeTenant?._id || null;
  const effectiveTenantId = isUser ? user?.id : activeTenantId;

  const handleOpenChat = () => {
    if (!isWidgetActive) {
      // First time - activate the widget with botId
      activateWidget(botId);
    } else {
      // Widget already exists, just open it
      openWidget();
    }
  };

  return (
    <div className="bot-container">
      <header className="bot-header">
        <h2 className="bot-heading">🤖 {isUser ? 'My AI Assistant' : 'AI Assistant'}</h2>
        <div className="bot-header-actions">
          <button className="bot-back-btn" onClick={() => navigate('/dashboard')}>
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="bot-widget-info">
        {!effectiveTenantId ? (
          <div className="bot-error-banner">
            <strong>No tenant selected</strong>
            <span>
              {user?.role === 'admin' 
                ? 'Create a user on the dashboard and set it as active before using the bot.'
                : 'Your account is not fully set up. Please contact your administrator.'
              }
            </span>
          </div>
        ) : (
          <>
            <div className="widget-icon">
              <ChatIconLarge />
            </div>
            <h1>AI Chat Widget</h1>
            <p className="widget-subtitle">
              Your AI assistant is now available as a floating widget
            </p>

            <div className="widget-instructions">
              <div className="instruction-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h3>Look for the Chat Button</h3>
                  <p>Find the orange floating button at the bottom-right corner of your screen</p>
                </div>
              </div>

              <div className="instruction-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h3>Click to Open</h3>
                  <p>Click the button to open the chat widget and start a conversation</p>
                </div>
              </div>

              <div className="instruction-step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h3>Chat Anywhere</h3>
                  <p>The widget stays accessible across all pages - chat while you work!</p>
                </div>
              </div>
            </div>

            <div className="widget-features">
              <h3>Widget Features</h3>
              <ul>
                <li>✨ Always accessible from any page</li>
                <li>💬 Persistent chat sessions</li>
                <li>🎯 Context-aware responses</li>
                <li>📱 Mobile-friendly design</li>
                <li>🔒 Secure tenant isolation</li>
              </ul>
            </div>

            <div className="widget-cta">
              <p>Ready to get started?</p>
              <button className="open-widget-btn" onClick={handleOpenChat}>
                💬 Open Chat Widget
              </button>
              {isWidgetActive && (
                <div className="cta-hint" style={{ marginTop: '1.5em' }}>
                  👉 The chat widget is now available! Look at the bottom-right corner to access it anytime.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default BotPage;
