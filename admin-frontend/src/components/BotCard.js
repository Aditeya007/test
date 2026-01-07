// src/components/BotCard.js

import React, { useState, useEffect, useCallback } from 'react';
import { updateBot, apiRequest } from '../api';

function BotCard({ bot, token, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(bot.scrapedWebsites?.[0] || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Bot-scoped scraping state
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [scrapeError, setScrapeError] = useState('');
  
  // Bot-scoped scheduler state
  const [schedulerStatus, setSchedulerStatus] = useState('inactive');
  const [schedulerConfig, setSchedulerConfig] = useState(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerError, setSchedulerError] = useState('');

  const botId = bot._id || bot.id;

  // Fetch scrape status
  const fetchScrapeStatus = useCallback(async () => {
    if (!token || !botId) return;
    
    try {
      const response = await apiRequest(`/bot/${botId}/scrape/status`, {
        method: 'GET',
        token
      });
      
      if (response.success) {
        setScrapeStatus(response.status);
        if (response.status === 'running') {
          setIsScraping(true);
        } else if (response.status === 'completed') {
          setIsScraping(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch scrape status:', err);
    }
  }, [token, botId]);

  // Fetch scheduler status
  const fetchSchedulerStatus = useCallback(async () => {
    if (!token || !botId) return;
    
    try {
      const response = await apiRequest(`/bot/${botId}/scheduler/status`, {
        method: 'GET',
        token
      });
      
      if (response.success) {
        setSchedulerStatus(response.schedulerStatus || 'inactive');
        setSchedulerConfig(response.schedulerConfig);
      }
    } catch (err) {
      console.error('Failed to fetch scheduler status:', err);
    }
  }, [token, botId]);

  // Poll scrape status when scraping
  useEffect(() => {
    if (!isScraping) return;
    
    const interval = setInterval(fetchScrapeStatus, 8000);
    return () => clearInterval(interval);
  }, [isScraping, fetchScrapeStatus]);

  // Fetch initial status on mount
  useEffect(() => {
    fetchScrapeStatus();
    fetchSchedulerStatus();
    
    // Poll scheduler status every 30 seconds
    const interval = setInterval(fetchSchedulerStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchScrapeStatus, fetchSchedulerStatus]);

  // Run scrape for this bot
  const handleRunScrape = async () => {
    const website = bot.scrapedWebsites?.[0];
    if (!website) {
      setScrapeError('No website configured for this bot');
      return;
    }

    setScrapeError('');
    setScrapeStatus(null);
    setIsScraping(true);

    try {
      const response = await apiRequest(`/bot/${botId}/scrape`, {
        method: 'POST',
        token,
        data: { startUrl: website }
      });

      if (response.success) {
        setScrapeStatus('running');
      } else {
        throw new Error(response.error || 'Failed to start scrape');
      }
    } catch (err) {
      setScrapeError(err.message || 'Failed to start scrape');
      setIsScraping(false);
    }
  };

  // Start scheduler for this bot
  const handleStartScheduler = async () => {
    const website = bot.scrapedWebsites?.[0];
    if (!website) {
      setSchedulerError('No website configured for this bot');
      return;
    }

    setSchedulerLoading(true);
    setSchedulerError('');

    try {
      const response = await apiRequest(`/bot/${botId}/scheduler/start`, {
        method: 'POST',
        token,
        data: { startUrl: website }
      });

      if (response.success) {
        setSchedulerStatus('active');
        setSchedulerConfig(response.schedulerConfig);
      } else {
        throw new Error(response.error || 'Failed to start scheduler');
      }
    } catch (err) {
      setSchedulerError(err.message || 'Failed to start scheduler');
    } finally {
      setSchedulerLoading(false);
    }
  };

  // Stop scheduler for this bot
  const handleStopScheduler = async () => {
    setSchedulerLoading(true);
    setSchedulerError('');

    try {
      const response = await apiRequest(`/bot/${botId}/scheduler/stop`, {
        method: 'POST',
        token
      });

      if (response.success) {
        setSchedulerStatus('inactive');
        fetchSchedulerStatus();
      } else {
        throw new Error(response.error || 'Failed to stop scheduler');
      }
    } catch (err) {
      setSchedulerError(err.message || 'Failed to stop scheduler');
    } finally {
      setSchedulerLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setError('');
    setSuccess(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setWebsiteUrl(bot.scrapedWebsites?.[0] || '');
    setError('');
    setSuccess(false);
  };

  const handleSave = async () => {
    if (!websiteUrl.trim()) {
      setError('Website URL cannot be empty');
      return;
    }

    // Validate URL format
    if (!/^https?:\/\//i.test(websiteUrl.trim())) {
      setError('URL must begin with http:// or https://');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess(false);

    try {
      const response = await updateBot(
        bot._id || bot.id,
        { scrapedWebsites: [websiteUrl.trim()] },
        token
      );

      if (response.success) {
        setSuccess(true);
        setIsEditing(false);
        // Notify parent component to refresh data
        if (onUpdate) {
          onUpdate(response.bot);
        }
        // Auto-hide success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(response.error || 'Failed to update bot');
      }
    } catch (err) {
      setError(err.message || 'Failed to update bot');
    } finally {
      setIsSaving(false);
    }
  };

  const displayUrl = bot.scrapedWebsites?.[0] || 'No website configured';

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem',
      background: '#ffffff'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '0.75rem'
      }}>
        <h4 style={{ margin: 0, color: '#1f2937', fontSize: '1.125rem' }}>
          {bot.name}
        </h4>
        {!isEditing && (
          <button
            onClick={handleEdit}
            style={{
              padding: '0.375rem 0.75rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#374151',
              fontWeight: '500'
            }}
          >
            ✏️ Edit
          </button>
        )}
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <strong style={{ fontSize: '0.875rem', color: '#6b7280' }}>Website:</strong>
        {isEditing ? (
          <>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={isSaving}
              style={{
                width: '100%',
                padding: '0.5rem',
                marginTop: '0.25rem',
                marginBottom: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: isSaving ? 0.6 : 1
                }}
              >
                {isSaving ? 'Saving...' : '💾 Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  opacity: isSaving ? 0.6 : 1
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <p style={{
            margin: '0.25rem 0 0 0',
            fontSize: '0.875rem',
            color: displayUrl === 'No website configured' ? '#9ca3af' : '#1f2937',
            fontStyle: displayUrl === 'No website configured' ? 'italic' : 'normal'
          }}>
            {displayUrl}
          </p>
        )}
      </div>

      {error && (
        <p style={{
          color: '#ef4444',
          fontSize: '0.875rem',
          margin: '0.5rem 0 0 0'
        }}>
          {error}
        </p>
      )}

      {success && (
        <p style={{
          color: '#10b981',
          fontSize: '0.875rem',
          margin: '0.5rem 0 0 0',
          fontWeight: '500'
        }}>
          ✅ Website updated successfully!
        </p>
      )}

      {/* Scraping Section */}
      <div style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #e5e7eb'
      }}>
        <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#374151' }}>
          🧹 Scraping
        </h5>
        
        {scrapeError && (
          <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0' }}>
            {scrapeError}
          </p>
        )}
        
        {isScraping ? (
          <div style={{
            padding: '0.5rem',
            background: '#dbeafe',
            border: '1px solid #3b82f6',
            borderRadius: '4px',
            fontSize: '0.75rem',
            color: '#1e40af'
          }}>
            🔄 Scraping in progress...
          </div>
        ) : scrapeStatus === 'completed' ? (
          <div style={{
            padding: '0.5rem',
            background: '#d1fae5',
            border: '1px solid #10b981',
            borderRadius: '4px',
            fontSize: '0.75rem',
            color: '#065f46'
          }}>
            ✅ Last scrape completed
          </div>
        ) : (
          <button
            onClick={handleRunScrape}
            disabled={!bot.scrapedWebsites?.[0] || isEditing}
            style={{
              padding: '0.5rem 0.75rem',
              background: bot.scrapedWebsites?.[0] ? '#10b981' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: bot.scrapedWebsites?.[0] && !isEditing ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              fontWeight: '500'
            }}
          >
            ▶️ Run Scrape
          </button>
        )}
      </div>

      {/* Scheduler Section */}
      <div style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #e5e7eb'
      }}>
        <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#374151' }}>
          📅 Scheduler
          {schedulerStatus === 'active' && (
            <span style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.375rem',
              background: '#10b981',
              color: 'white',
              borderRadius: '1rem',
              fontSize: '0.625rem',
              fontWeight: '500'
            }}>
              🟢 ACTIVE
            </span>
          )}
        </h5>
        
        {schedulerError && (
          <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0' }}>
            {schedulerError}
          </p>
        )}
        
        {schedulerStatus === 'active' ? (
          <div>
            {schedulerConfig?.intervalMinutes && (
              <p style={{ margin: '0.25rem 0', fontSize: '0.75rem', color: '#6b7280' }}>
                Interval: Every {schedulerConfig.intervalMinutes} minutes
              </p>
            )}
            {schedulerConfig?.lastScrapeCompleted && (
              <p style={{ margin: '0.25rem 0', fontSize: '0.75rem', color: '#059669' }}>
                Last run: {new Date(schedulerConfig.lastScrapeCompleted).toLocaleString()}
              </p>
            )}
            <button
              onClick={handleStopScheduler}
              disabled={schedulerLoading}
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: schedulerLoading ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '500',
                opacity: schedulerLoading ? 0.6 : 1
              }}
            >
              {schedulerLoading ? 'Stopping...' : '🛑 Stop Scheduler'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartScheduler}
            disabled={schedulerLoading || !bot.scrapedWebsites?.[0] || isEditing}
            style={{
              padding: '0.5rem 0.75rem',
              background: bot.scrapedWebsites?.[0] ? '#3b82f6' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: bot.scrapedWebsites?.[0] && !isEditing && !schedulerLoading ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem',
              fontWeight: '500',
              opacity: schedulerLoading ? 0.6 : 1
            }}
          >
            {schedulerLoading ? 'Starting...' : '▶️ Start Scheduler'}
          </button>
        )}
      </div>

      <div style={{
        marginTop: '0.75rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid #f3f4f6',
        fontSize: '0.75rem',
        color: '#9ca3af'
      }}>
        <div>Bot ID: {bot._id || bot.id}</div>
        {bot.createdAt && (
          <div>Created: {new Date(bot.createdAt).toLocaleDateString()}</div>
        )}
      </div>
    </div>
  );
}

export default BotCard;
