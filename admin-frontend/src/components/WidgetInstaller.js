// src/components/WidgetInstaller.js

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import '../styles/WidgetInstaller.css';

const WidgetInstaller = ({ isOpen, onClose, users = null }) => {
  const { user, activeTenant } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [apiTokens, setApiTokens] = useState({});
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokenError, setTokenError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Determine the bots to display
  // If users prop is provided (batch creation), use it as bots
  // Otherwise, use the current user/tenant
  const displayBots = useMemo(() => {
    if (users && Array.isArray(users) && users.length > 0) {
      return users;
    }
    const isUserRole = user?.role === 'user';
    const effectiveUser = isUserRole ? user : activeTenant;
    return effectiveUser ? [effectiveUser] : [];
  }, [users, user, activeTenant]);

  const currentBot = displayBots[activeTab] || null;
  const botId = currentBot?.id || currentBot?._id;

  // Get the widget domain from config (or use current location origin for widget script)
  const widgetDomain = window.location.origin;

  // Fetch API tokens for all bots when modal opens
  useEffect(() => {
    if (isOpen && displayBots.length > 0) {
      fetchAllApiTokens();
    }
  }, [isOpen, displayBots]);

  const fetchAllApiTokens = async () => {
    setLoadingTokens(true);
    setTokenError(null);
    const tokens = {};
    
    try {
      const token = localStorage.getItem('jwt');
      
      for (const bot of displayBots) {
        const botIdToFetch = bot.id || bot._id;
        
        try {
          const endpoint = `${API_BASE_URL}/bot/${botIdToFetch}/api-token`;
          
          const response = await fetch(endpoint, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            tokens[botIdToFetch] = data.apiToken;
          } else {
            const errorData = await response.json();
            console.error(`Failed to fetch token for bot ${bot.name}:`, errorData);
          }
        } catch (error) {
          console.error(`Error fetching API token for bot ${bot.name}:`, error);
        }
      }
      
      setApiTokens(tokens);
    } catch (error) {
      console.error('Error fetching API tokens:', error);
      setTokenError('Network error while fetching API tokens');
    } finally {
      setLoadingTokens(false);
    }
  };
  
  // Generate the installation snippet for current bot
  const installSnippet = useMemo(() => {
    if (!botId || !apiTokens[botId]) return '';
    
    return `<!-- RAG Chatbot Widget -->
<script src="${widgetDomain}/ragChatWidget.js"></script>
<script>
  window.RAGWidget.init({
    apiBase: "${API_BASE_URL}",
    botId: "${botId}",
    authToken: "${apiTokens[botId]}"
  });
</script>`;
  }, [botId, apiTokens, widgetDomain]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = installSnippet;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleTabChange = (index) => {
    setActiveTab(index);
    setCopied(false);
    setShowPreview(false);
  };

  if (!isOpen) return null;

  return (
    <div className="widget-installer-overlay" role="dialog" aria-modal="true">
      <div className="widget-installer-modal">
        <div className="widget-installer-header">
          <h3>🚀 Install Chatbot on Your Site</h3>
          <button 
            className="widget-installer-close" 
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {displayBots.length === 0 ? (
          <div className="widget-installer-error">
            <p>Please create or select a user before installing the widget.</p>
          </div>
        ) : loadingTokens ? (
          <div className="widget-installer-loading">
            <p>🔑 Generating secure authentication tokens...</p>
          </div>
        ) : tokenError ? (
          <div className="widget-installer-error">
            <p>❌ {tokenError}</p>
            <button onClick={fetchAllApiTokens} className="widget-installer-retry-btn">
              🔄 Retry
            </button>
          </div>
        ) : !apiTokens[botId] ? (
          <div className="widget-installer-loading">
            <p>⏳ Loading widget configuration...</p>
          </div>
        ) : (
          <>
            {displayBots.length > 1 && (
              <div className="widget-installer-tabs">
                {displayBots.map((bot, index) => (
                  <button
                    key={bot.id || bot._id}
                    className={`widget-installer-tab ${activeTab === index ? 'active' : ''}`}
                    onClick={() => handleTabChange(index)}
                  >
                    Bot {index + 1}: {bot.name || bot.username}
                  </button>
                ))}
              </div>
            )}

            <div className="widget-installer-content">
              <p className="widget-installer-description">
                Copy the code below and paste it into your website's HTML, just before the closing <code>&lt;/body&gt;</code> tag. 
                This will enable your personalized AI chatbot for all visitors to your site.
              </p>

              <div className="widget-installer-user-info">
                <p><strong>Bot Name:</strong> {currentBot?.name || currentBot?.username}</p>
                <p><strong>Bot ID:</strong> <code>{botId}</code></p>
                {currentBot?.scrapedWebsites && currentBot.scrapedWebsites.length > 0 && (
                  <div style={{ marginTop: '0.8em' }}>
                    <strong>📌 Scraped Websites:</strong>
                    <ul style={{ marginTop: '0.4em', paddingLeft: '1.5em' }}>
                      {currentBot.scrapedWebsites.map((site, idx) => (
                        <li key={idx}>
                          <a href={site} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>
                            {site}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p style={{ marginTop: '0.5em' }}>
                  <strong>Auth Token:</strong> <code style={{fontSize: '0.75em'}}>{apiTokens[botId].substring(0, 16)}...●●●●</code>
                </p>
              </div>

              <div className="widget-installer-snippet-container">
                <pre className="widget-installer-snippet">{installSnippet}</pre>
                <button 
                  className={`widget-installer-copy-btn ${copied ? 'copied' : ''}`}
                  onClick={handleCopy}
                  disabled={!installSnippet}
                >
                  {copied ? '✓ Copied!' : '📋 Copy Code'}
                </button>
              </div>

              <div className="widget-installer-security-notice">
                <p><strong>🔒 Security Note:</strong> Your authentication token is included in this snippet. Keep it secure and don't share it publicly. If compromised, contact your administrator to regenerate it.</p>
              </div>

              <div className="widget-installer-instructions">
                <h4>Installation Instructions:</h4>
                <ol>
                  <li>Copy the code snippet above using the "Copy Code" button.</li>
                  <li>Open your website's HTML file in your editor.</li>
                  <li>Locate the closing <code>&lt;/body&gt;</code> tag near the end of the file.</li>
                  <li>Paste the copied code just before the <code>&lt;/body&gt;</code> tag.</li>
                  <li>Save your HTML file and refresh your website.</li>
                  <li>The chatbot widget will appear in the bottom-right corner of your site!</li>
                </ol>
              </div>

              <div className="widget-installer-features">
                <h4>✨ Widget Features:</h4>
                <ul>
                  <li>✅ Fully functional AI chatbot with your personalized knowledge base</li>
                  <li>✅ Secure authentication with your unique API token</li>
                  <li>✅ Automatic session management for each visitor</li>
                  <li>✅ Context-aware responses based on your scraped content</li>
                  <li>✅ Responsive design that works on all devices</li>
                  <li>✅ Easy to customize and update</li>
                </ul>
              </div>

              <div className="widget-installer-preview-section">
                <button 
                  className="widget-installer-preview-btn"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  {showPreview ? '🙈 Hide Preview' : '👁️ Show Live Preview'}
                </button>
                
                {showPreview && (
                  <div className="widget-installer-preview">
                    <p className="widget-installer-preview-label">
                      Preview of how the widget will appear on your site:
                    </p>
                    <div className="widget-installer-preview-frame">
                      <div className="widget-installer-preview-site">
                        <div className="preview-site-header">Your Website</div>
                        <div className="preview-site-content">
                          <p>Your website content goes here...</p>
                        </div>
                        <div className="preview-widget-placeholder">
                          <div className="preview-widget-icon">💬</div>
                          <div className="preview-widget-text">Chat with AI</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="widget-installer-notes">
                <h4>📝 Important Notes:</h4>
                <ul>
                  <li><strong>No functionality changes:</strong> The widget uses the same bot logic and features as your dashboard chatbot.</li>
                  <li><strong>Secure:</strong> All requests are authenticated using your unique user ID.</li>
                  <li><strong>Data context:</strong> The widget automatically uses your knowledge base and trained data.</li>
                  <li><strong>Customization:</strong> Contact support if you need to customize colors or positioning.</li>
                </ul>
              </div>
            </div>

            <div className="widget-installer-actions">
              <button 
                className="widget-installer-btn-neutral"
                onClick={onClose}
              >
                Close
              </button>
              <button 
                className="widget-installer-btn-primary"
                onClick={handleCopy}
              >
                {copied ? '✓ Copied to Clipboard' : '📋 Copy Installation Code'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WidgetInstaller;
