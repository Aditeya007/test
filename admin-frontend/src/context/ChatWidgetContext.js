// src/context/ChatWidgetContext.js

import React, { createContext, useContext, useState } from 'react';

const ChatWidgetContext = createContext();

export const useChatWidget = () => {
  const context = useContext(ChatWidgetContext);
  if (!context) {
    throw new Error('useChatWidget must be used within ChatWidgetProvider');
  }
  return context;
};

export const ChatWidgetProvider = ({ children }) => {
  const [isWidgetActive, setIsWidgetActive] = useState(false);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState(null);

  /**
   * Activate and open the widget with a specific bot
   * CRITICAL: botId is REQUIRED - widget cannot function without it
   * @param {string} botId - The bot ID to use for chat queries (REQUIRED)
   */
  const activateWidget = (botId) => {
    // DEFENSIVE GUARD: Prevent widget activation without botId
    if (!botId) {
      console.error('❌ ChatWidget: Cannot activate widget without botId');
      return;
    }

    setSelectedBotId(botId);
    setIsWidgetActive(true);
    setIsWidgetOpen(true);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ ChatWidget activated with botId:', botId);
    }
  };

  /**
   * Close the widget (hide from view)
   * IMPORTANT: Does NOT clear selectedBotId - bot selection persists
   */
  const closeWidget = () => {
    setIsWidgetOpen(false);
    // selectedBotId is intentionally preserved
  };

  /**
   * Open the widget (show it)
   * IMPORTANT: Does NOT modify selectedBotId - only controls visibility
   * Widget should already be activated with activateWidget(botId) first
   */
  const openWidget = () => {
    // DEFENSIVE GUARD: Log warning if opening without botId
    if (!selectedBotId) {
      console.warn('⚠️ ChatWidget: Opening widget without selectedBotId - chat will fail');
    }
    setIsWidgetOpen(true);
  };

  /**
   * Toggle widget visibility
   * IMPORTANT: Does NOT modify selectedBotId - only controls visibility
   */
  const toggleWidget = () => {
    // DEFENSIVE GUARD: Warn if toggling open without botId
    if (!isWidgetOpen && !selectedBotId) {
      console.warn('⚠️ ChatWidget: Toggling widget open without selectedBotId - chat will fail');
    }
    setIsWidgetOpen(prev => !prev);
  };

  /**
   * Explicitly change the selected bot
   * Use this when switching between bots in a multi-bot session
   * @param {string} botId - The new bot ID to use (REQUIRED)
   */
  const switchBot = (botId) => {
    if (!botId) {
      console.error('❌ ChatWidget: Cannot switch to invalid botId');
      return;
    }
    setSelectedBotId(botId);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 ChatWidget switched to botId:', botId);
    }
  };

  return (
    <ChatWidgetContext.Provider
      value={{
        isWidgetActive,
        isWidgetOpen,
        selectedBotId,
        activateWidget,
        closeWidget,
        openWidget,
        toggleWidget,
        switchBot,
      }}
    >
      {children}
    </ChatWidgetContext.Provider>
  );
};
