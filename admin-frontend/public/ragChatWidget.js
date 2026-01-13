/**
 * RAG Chatbot Widget - Standalone Embeddable Widget
 * 
 * This script creates a fully functional chatbot widget that can be embedded
 * on any website. It maintains the same functionality as the dashboard chatbot.
 * 
 * Usage:
 * <script src="https://yourdomain.com/ragChatWidget.js"></script>
 * <script>
 *   window.RAGWidget.init({
 *     apiBase: "https://yourdomain.com/api",
 *     botId: "BOT_ID",
 *     authToken: "YOUR_API_TOKEN"
 *   });
 * </script>
 */

(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.RAGWidget && window.RAGWidget._initialized) {
    console.warn('RAG Widget already initialized');
    return;
  }

  // Widget configuration
  let config = {
    apiBase: '',
    botId: '', // Bot ID for multi-bot support
    authToken: '', // API token for authentication
    position: 'bottom-right', // bottom-right, bottom-left
    theme: 'default'
  };

  // Widget state
  let state = {
    isOpen: false,
    messages: [],
    sessionId: '',
    loading: false
  };

  // Generate unique session ID
  function generateSessionId() {
    return `widget_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get or create session ID from localStorage (scoped per bot)
  function getOrCreateSessionId(botId) {
    const storageKey = `chat_conversation_id_${botId}`;
    
    // Try to retrieve existing session ID from localStorage
    const existingSessionId = localStorage.getItem(storageKey);
    
    if (existingSessionId) {
      console.log('RAG Widget: Resuming existing conversation');
      return existingSessionId;
    }
    
    // Create new session ID
    const newSessionId = generateSessionId();
    localStorage.setItem(storageKey, newSessionId);
    console.log('RAG Widget: Starting new conversation');
    return newSessionId;
  }

  // Load conversation history from backend
  async function loadConversationHistory() {
    try {
      const response = await fetch(
        `${config.apiBase}/conversation/${state.sessionId}/messages?botId=${config.botId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        console.warn('RAG Widget: Failed to load conversation history');
        return;
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
        console.log(`RAG Widget: Loaded ${data.messages.length} messages from history`);
        
        // Clear any existing messages
        state.messages = [];
        const messagesContainer = document.getElementById('rag-widget-messages');
        if (messagesContainer) {
          messagesContainer.innerHTML = '';
        }

        // Render each message from history
        data.messages.forEach(msg => {
          addMessage(msg.text, msg.sender, false, msg.sources);
        });

        // Scroll to bottom
        scrollToBottom();
      } else {
        console.log('RAG Widget: No previous conversation history');
        // Add welcome message for new conversations
        addMessage("Hello! I'm an AI assistant. How can I help you today?", 'bot');
      }
    } catch (err) {
      console.error('RAG Widget: Error loading conversation history:', err);
      // Add welcome message as fallback
      addMessage("Hello! I'm an AI assistant. How can I help you today?", 'bot');
    }
  }

  // Start or resume conversation with backend
  async function startConversation() {
    try {
      const response = await fetch(`${config.apiBase}/conversation/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          botId: config.botId,
          sessionId: state.sessionId
        })
      });

      if (!response.ok) {
        console.warn('RAG Widget: Failed to start conversation');
        return;
      }

      const data = await response.json();

      if (data.success) {
        console.log(`RAG Widget: Conversation ${data.conversation.status === 'ai' ? 'started' : 'resumed'}`);
      }
    } catch (err) {
      console.error('RAG Widget: Error starting conversation:', err);
    }
  }

  // Create widget HTML structure
  function createWidgetHTML() {
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'rag-widget-container';
    widgetContainer.className = 'rag-widget-container';
    
    widgetContainer.innerHTML = `
      <!-- Widget Toggle Button -->
      <div id="rag-widget-toggle" class="rag-widget-toggle">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>

      <!-- Widget Chat Window -->
      <div id="rag-widget-window" class="rag-widget-window" style="display: none;">
        <div class="rag-widget-header">
          <h3>AI Assistant</h3>
          <button id="rag-widget-close" class="rag-widget-close" aria-label="Close Chat">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div id="rag-widget-messages" class="rag-widget-messages"></div>
        
        <div class="rag-widget-input-area">
          <input 
            type="text" 
            id="rag-widget-input" 
            placeholder="Ask a question..." 
            autocomplete="off"
          />
          <button id="rag-widget-send" class="rag-widget-send-btn">Send</button>
          <button id="rag-widget-request-agent" class="rag-widget-request-agent-btn">Talk to Human</button>
        </div>
      </div>
    `;

    return widgetContainer;
  }

  // Inject widget styles
  function injectStyles() {
    const styleId = 'rag-widget-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* RAG Widget Styles */
      .rag-widget-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }

      .rag-widget-toggle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #FF8307, #e67506);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(255, 131, 7, 0.4);
        transition: all 0.3s ease;
      }

      .rag-widget-toggle:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(255, 131, 7, 0.6);
      }

      .rag-widget-toggle.hidden {
        display: none;
      }

      .rag-widget-window {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 380px;
        max-width: calc(100vw - 40px);
        height: 550px;
        max-height: calc(100vh - 120px);
        background: #20293c;
        border-radius: 18px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .rag-widget-header {
        background: linear-gradient(135deg, #FF8307, #e67506);
        color: white;
        padding: 1.2em 1.5em;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-radius: 18px 18px 0 0;
      }

      .rag-widget-header h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
      }

      .rag-widget-close {
        background: transparent;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s ease;
      }

      .rag-widget-close:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .rag-widget-messages {
        flex: 1;
        overflow-y: auto;
        padding: 1.2em;
        background: #181f2a;
      }

      .rag-widget-message {
        margin-bottom: 1em;
        display: flex;
        flex-direction: column;
      }

      .rag-widget-message.user {
        align-items: flex-end;
      }

      .rag-widget-message.bot,
      .rag-widget-message.agent {
        align-items: flex-start;
      }

      .rag-widget-message-bubble {
        max-width: 80%;
        padding: 0.8em 1em;
        border-radius: 12px;
        line-height: 1.5;
        word-wrap: break-word;
      }

      .rag-widget-message.user .rag-widget-message-bubble {
        background: #FF8307;
        color: white;
      }

      .rag-widget-message.bot .rag-widget-message-bubble,
      .rag-widget-message.agent .rag-widget-message-bubble {
        background: #2b3547;
        color: #e0e5ec;
      }

      .rag-widget-message.bot.error .rag-widget-message-bubble {
        background: rgba(255, 74, 85, 0.15);
        color: #ff9999;
        border: 1px solid rgba(255, 74, 85, 0.3);
      }

      .rag-widget-typing {
        display: flex;
        gap: 4px;
        padding: 0.8em 1em;
        background: #2b3547;
        border-radius: 12px;
        max-width: 60px;
      }

      .rag-widget-typing span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #FF8307;
        animation: typing 1.4s infinite;
      }

      .rag-widget-typing span:nth-child(2) {
        animation-delay: 0.2s;
      }

      .rag-widget-typing span:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes typing {
        0%, 60%, 100% {
          opacity: 0.3;
          transform: translateY(0);
        }
        30% {
          opacity: 1;
          transform: translateY(-4px);
        }
      }

      .rag-widget-input-area {
        display: flex;
        gap: 0.5em;
        padding: 1em;
        background: #20293c;
        border-top: 1px solid rgba(255, 131, 7, 0.2);
      }

      .rag-widget-input-area input {
        flex: 1;
        padding: 0.8em;
        border: 1px solid rgba(255, 131, 7, 0.3);
        border-radius: 8px;
        background: #181f2a;
        color: #e0e5ec;
        font-size: 0.95rem;
        outline: none;
      }

      .rag-widget-input-area input:focus {
        border-color: #FF8307;
      }

      .rag-widget-send-btn {
        padding: 0.8em 1.5em;
        background: #FF8307;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .rag-widget-send-btn:hover:not(:disabled) {
        background: #e67506;
        transform: translateY(-1px);
      }

      .rag-widget-send-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .rag-widget-request-agent-btn {
        padding: 0.8em 1.2em;
        background: #28a745;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }

      .rag-widget-request-agent-btn:hover:not(:disabled) {
        background: #218838;
        transform: translateY(-1px);
      }

      .rag-widget-request-agent-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        background: #6c757d;
      }

      /* Mobile Responsive */
      @media (max-width: 480px) {
        .rag-widget-window {
          width: calc(100vw - 40px);
          height: calc(100vh - 120px);
          bottom: 80px;
          right: 20px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // Add a message to the chat
  function addMessage(text, sender, isError = false, sources = null) {
    const messagesContainer = document.getElementById('rag-widget-messages');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `rag-widget-message ${sender}${isError ? ' error' : ''}`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'rag-widget-message-bubble';
    
    // Handle multi-line messages
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const p = document.createElement('p');
      p.textContent = line;
      p.style.margin = '0';
      if (index < lines.length - 1) {
        p.style.marginBottom = '0.5em';
      }
      bubbleDiv.appendChild(p);
    });
    
    messageDiv.appendChild(bubbleDiv);

    // Add sources if provided
    if (sources && Array.isArray(sources) && sources.length > 0) {
      const sourcesDiv = document.createElement('div');
      sourcesDiv.className = 'rag-widget-message-bubble';
      sourcesDiv.style.marginTop = '0.5em';
      sourcesDiv.style.fontSize = '0.85em';
      sourcesDiv.style.opacity = '0.8';
      
      const sourcesTitle = document.createElement('p');
      sourcesTitle.textContent = 'Sources:';
      sourcesTitle.style.margin = '0 0 0.3em 0';
      sourcesTitle.style.fontWeight = '600';
      sourcesDiv.appendChild(sourcesTitle);
      
      sources.forEach((src, idx) => {
        const srcP = document.createElement('p');
        srcP.textContent = `${idx + 1}. ${src}`;
        srcP.style.margin = '0';
        if (idx < sources.length - 1) {
          srcP.style.marginBottom = '0.2em';
        }
        sourcesDiv.appendChild(srcP);
      });
      
      messageDiv.appendChild(sourcesDiv);
    }
    
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    scrollToBottom();

    // Store in state
    state.messages.push({ text, sender, isError, sources, id: Date.now() });
  }

  // Scroll messages container to bottom
  function scrollToBottom() {
    const messagesContainer = document.getElementById('rag-widget-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // Show typing indicator
  function showTyping() {
    const messagesContainer = document.getElementById('rag-widget-messages');
    if (!messagesContainer) return;

    const typingDiv = document.createElement('div');
    typingDiv.id = 'rag-widget-typing-indicator';
    typingDiv.className = 'rag-widget-message bot';
    typingDiv.innerHTML = `
      <div class="rag-widget-typing">
        <span></span><span></span><span></span>
      </div>
    `;
    
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Hide typing indicator
  function hideTyping() {
    const typingIndicator = document.getElementById('rag-widget-typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  // Request human agent
  async function requestAgent() {
    if (state.loading) return;
    if (!config.botId) {
      addMessage('Widget not configured properly. Missing bot ID.', 'bot', true);
      return;
    }
    if (!config.authToken) {
      addMessage('Widget not configured properly. Missing authentication token.', 'bot', true);
      return;
    }

    // Disable the request agent button
    const requestAgentBtn = document.getElementById('rag-widget-request-agent');
    if (requestAgentBtn) {
      requestAgentBtn.disabled = true;
      requestAgentBtn.textContent = 'Requesting...';
    }

    try {
      const response = await fetch(`${config.apiBase}/chat/request-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.authToken}`
        },
        body: JSON.stringify({
          sessionId: state.sessionId,
          botId: config.botId
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Handle new state-based responses
        if (data.state === 'offline') {
          addMessage('No agents are currently available.', 'bot');
          // Re-enable button on offline
          if (requestAgentBtn) {
            requestAgentBtn.disabled = false;
            requestAgentBtn.textContent = 'Talk to Human';
          }
          return;
        }

        if (data.state === 'busy') {
          addMessage('All agents are busy. Please wait while we connect you.', 'bot');
          // Keep button disabled
          return;
        }

        if (data.state === 'available') {
          addMessage('Connecting you to a human agent…', 'bot');
          // Keep button disabled
          return;
        }

        // Fallback for old response format
        if (data.success) {
          addMessage('Connecting you to a human agent... Please wait.', 'bot');
          // Keep button disabled
          return;
        }
      }

      // Handle errors
      addMessage(data.error || data.message || 'Failed to request agent.', 'bot', true);
      // Re-enable button on error
      if (requestAgentBtn) {
        requestAgentBtn.disabled = false;
        requestAgentBtn.textContent = 'Talk to Human';
      }
    } catch (err) {
      console.error('RAG Widget: Error requesting agent:', err);
      addMessage('Network error: Unable to request agent. Please check your connection.', 'bot', true);
      // Re-enable button on error
      if (requestAgentBtn) {
        requestAgentBtn.disabled = false;
        requestAgentBtn.textContent = 'Talk to Human';
      }
    }
  }

  // Send message to API
  async function sendMessage(message) {
    if (!message.trim() || state.loading) return;
    if (!config.botId) {
      addMessage('Widget not configured properly. Missing bot ID.', 'bot', true);
      return;
    }
    if (!config.authToken) {
      addMessage('Widget not configured properly. Missing authentication token.', 'bot', true);
      return;
    }

    // Add user message
    addMessage(message, 'user');
    
    // Clear input
    const input = document.getElementById('rag-widget-input');
    if (input) input.value = '';

    // Set loading state
    state.loading = true;
    const sendBtn = document.getElementById('rag-widget-send');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }

    showTyping();

    try {
      const response = await fetch(`${config.apiBase}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.authToken}`
        },
        body: JSON.stringify({
          botId: config.botId,
          sessionId: state.sessionId,
          message: message
        })
      });

      const data = await response.json();

      hideTyping();

      if (response.ok && data.success && data.reply) {
        // Add bot/agent response
        addMessage(data.reply.text, data.reply.sender, false, data.reply.sources);
      } else {
        // Handle specific widget errors
        if (data.widgetError) {
          if (data.error && data.error.includes('No authorization header')) {
            addMessage('Authentication failed. Please check your widget configuration.', 'bot', true);
          } else if (data.error && data.error.includes('Invalid token')) {
            addMessage('Your authentication token is invalid or expired. Please contact the site administrator.', 'bot', true);
          } else {
            addMessage(data.error || data.message || 'Unable to process your request.', 'bot', true);
          }
        } else {
          const errorMessage = data.error || data.message || 'Bot service is unavailable right now.';
          addMessage(errorMessage, 'bot', true);
        }
      }
    } catch (err) {
      hideTyping();
      console.error('RAG Widget: Network error:', err);
      addMessage('Network error: Unable to reach the bot service. Please check your connection.', 'bot', true);
    } finally {
      // Reset loading state
      state.loading = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
      }
    }
  }

  // Toggle widget visibility
  function toggleWidget() {
    const widgetWindow = document.getElementById('rag-widget-window');
    const widgetToggle = document.getElementById('rag-widget-toggle');
    
    if (!widgetWindow || !widgetToggle) return;

    state.isOpen = !state.isOpen;
    
    if (state.isOpen) {
      widgetWindow.style.display = 'flex';
      widgetToggle.classList.add('hidden');
      
      // Focus on input
      setTimeout(() => {
        const input = document.getElementById('rag-widget-input');
        if (input) input.focus();
      }, 100);
    } else {
      widgetWindow.style.display = 'none';
      widgetToggle.classList.remove('hidden');
    }
  }

  // Initialize widget
  function init(options) {
    if (!options || !options.apiBase || !options.botId) {
      console.error('RAG Widget: Missing required configuration (apiBase and botId)');
      return;
    }

    if (!options.authToken) {
      console.error('RAG Widget: Missing required authentication token (authToken)');
      console.warn('RAG Widget: The widget requires an authToken for secure API access. Please update your installation code.');
      return;
    }

    // Merge config
    config = { ...config, ...options };

    // Get or create session ID from sessionStorage (scoped per bot)
    state.sessionId = getOrCreateSessionId(config.botId);

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initWidget);
    } else {
      initWidget();
    }
  }

  function initWidget() {
    // Inject styles
    injectStyles();

    // Create and inject widget HTML
    const widget = createWidgetHTML();
    document.body.appendChild(widget);

    // Start conversation and load history
    (async () => {
      await startConversation();
      await loadConversationHistory();
    })();

    // Attach event listeners
    const toggleBtn = document.getElementById('rag-widget-toggle');
    const closeBtn = document.getElementById('rag-widget-close');
    const sendBtn = document.getElementById('rag-widget-send');
    const input = document.getElementById('rag-widget-input');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleWidget);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', toggleWidget);
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const inputEl = document.getElementById('rag-widget-input');
        if (inputEl) {
          sendMessage(inputEl.value);
        }
      });
    }

    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !state.loading) {
          sendMessage(input.value);
        }
      });
    }

    // Attach request agent button listener
    const requestAgentBtn = document.getElementById('rag-widget-request-agent');
    if (requestAgentBtn) {
      requestAgentBtn.addEventListener('click', requestAgent);
    }

    // Handle widget unload - end session
    window.addEventListener('beforeunload', async () => {
      try {
        // Use sendBeacon for reliable delivery during page unload
        const blob = new Blob(
          [JSON.stringify({ sessionId: state.sessionId, botId: config.botId })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(`${config.apiBase}/chat/end-session`, blob);
      } catch (err) {
        console.error('RAG Widget: Error ending session:', err);
      }
    });

    window.RAGWidget._initialized = true;
  }

  // Expose public API
  window.RAGWidget = {
    init: init,
    _initialized: false
  };

})();
