// src/pages/DashboardPage.js

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChatWidget } from '../context/ChatWidgetContext';
import { apiRequest, getUserBots, getUserOwnBots, createBot, startBotScheduler, stopBotScheduler } from '../api';
import UserForm from '../components/users/UserForm';
import Loader from '../components/Loader';
import WidgetInstaller from '../components/WidgetInstaller';
import BotCard from '../components/BotCard';

import '../styles/index.css';

function DashboardPage() {
  const { user, token, logout, activeTenant, setActiveTenant } = useAuth();
  const { selectedBotId, switchBot } = useChatWidget();
  const navigate = useNavigate();

  const [tenantDetails, setTenantDetails] = useState(activeTenant);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [isWidgetInstallerOpen, setWidgetInstallerOpen] = useState(false);
  
  // Website Actions panel state - separate from chatbot visibility
  const [showWebsiteActionsPanel, setShowWebsiteActionsPanel] = useState(false);

  // Bots state
  const [bots, setBots] = useState([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [botsError, setBotsError] = useState('');
  
  // Derive selectedBot from context - SINGLE SOURCE OF TRUTH
  const selectedBot = useMemo(() => {
    return bots.find(b => (b._id || b.id) === selectedBotId) || null;
  }, [bots, selectedBotId]);
  
  // Add website modal state
  const [addWebsiteModalOpen, setAddWebsiteModalOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [addWebsiteLoading, setAddWebsiteLoading] = useState(false);
  const [addWebsiteError, setAddWebsiteError] = useState('');
  
  // Run crawl state
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
  const [scrapeSuccess, setScrapeSuccess] = useState('');
  
  // Crawl history state
  const [scrapeHistory, setScrapeHistory] = useState([]);
  const [scrapeHistoryLoading, setScrapeHistoryLoading] = useState(false);
  
  // Polling state for crawl completion tracking
  const [pollingIntervalId, setPollingIntervalId] = useState(null);
  
  // Scheduler state (UI only - NO source of truth state)
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerError, setSchedulerError] = useState('');
  
  // Derive scheduler state from selectedBot - SINGLE SOURCE OF TRUTH
  const schedulerStatus = selectedBot?.schedulerStatus ?? 'inactive';
  const schedulerConfig = selectedBot?.schedulerConfig ?? null;

  const activeTenantId = useMemo(() => {
    if (!activeTenant) {
      return null;
    }
    return activeTenant.id || activeTenant._id || null;
  }, [activeTenant]);

  // Auto-set activeTenant for regular users on login
  useEffect(() => {
    if (user && user.role === 'user' && !activeTenant) {
      // Regular users should have themselves as the active tenant
      setActiveTenant(user);
      setTenantDetails(user);
    }
  }, [user, activeTenant, setActiveTenant]);

  // Keep tenantDetails in sync with activeTenant (important when admin switches tenants)
  useEffect(() => {
    if (activeTenant) {
      setTenantDetails(activeTenant);
    }
  }, [activeTenant]);

  // Fetch bots for the current tenant
  const fetchBots = useCallback(async () => {
    // Only fetch bots for authenticated users with valid tenant details
    if (!token || !user || !tenantDetails) return;
    
    // For regular users, ensure tenantDetails matches the logged-in user
    if (user.role === 'user') {
      const userId = user.id || user._id;
      const tenantId = tenantDetails.id || tenantDetails._id;
      if (userId !== tenantId) return; // Not ready yet
    }
    
    setBotsLoading(true);
    setBotsError('');
    
    try {
      let response;
      
      if (user.role === 'user') {
        // Regular users: Use /api/bot endpoint (no userId needed)
        response = await getUserOwnBots(token);
      } else {
        // Admins: Use /api/users/:id/bots endpoint
        const tenantUserId = tenantDetails.id || tenantDetails._id;
        response = await getUserBots(tenantUserId, token);
      }
      
      if (response.bots) {
        setBots(response.bots);
      }
    } catch (err) {
      console.error('Failed to fetch bots:', err);
      setBotsError(err.message || 'Failed to load bots');
    } finally {
      setBotsLoading(false);
    }
  }, [token, user, tenantDetails]);

  // Fetch bots when tenant details change
  useEffect(() => {
    // Fetch bots for both admins viewing users and regular users viewing their own bots
    if (user && tenantDetails) {
      fetchBots();
    }
  }, [fetchBots, user, tenantDetails]);
  
  // Cleanup polling interval on unmount or when selected bot changes
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [pollingIntervalId]);
  
  // Check if scrape has completed and stop polling
  useEffect(() => {
    if (!pollingIntervalId || !selectedBot) return;
    
    // Check if scrape has completed or failed
    const scrapeStatus = selectedBot.schedulerConfig?.status;
    
    if (scrapeStatus === 'completed' || scrapeStatus === 'failed') {
      // Stop polling
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
      console.log(`Crawl ${scrapeStatus} - polling stopped`);
    }
  }, [bots, selectedBot, pollingIntervalId]);

  useEffect(() => {
    if (!token) {
      setTenantDetails(null);
      setTenantError('');
      return;
    }

    // For regular users, use their own data from context
    if (user && user.role === 'user') {
      setTenantDetails(user);
      setTenantLoading(false);
      return;
    }

    // For admins, fetch the selected user's data
    if (!activeTenantId) {
      setTenantDetails(null);
      setTenantError('');
      return;
    }

    let isCancelled = false;

    async function fetchTenant() {
      setTenantLoading(true);
      setTenantError('');
      try {
        const response = await apiRequest(`/users/${activeTenantId}`, {
          method: 'GET',
          token
        });
        if (!isCancelled) {
          setTenantDetails(response.user);
          setActiveTenant(response.user);
        }
      } catch (err) {
        if (!isCancelled) {
          setTenantDetails(null);
          setTenantError(err.message || 'Unable to load the selected user.');
          setActiveTenant(null);
        }
      } finally {
        if (!isCancelled) {
          setTenantLoading(false);
        }
      }
    }

    fetchTenant();

    return () => {
      isCancelled = true;
    };
  }, [activeTenantId, setActiveTenant, token, user]);

  useEffect(() => {
    if (!createSuccess) {
      return undefined;
    }
    const timeout = window.setTimeout(() => setCreateSuccess(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [createSuccess]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function openCreateModal() {
    setCreateError('');
    setCreateSuccess('');
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (createLoading) {
      return;
    }
    setCreateModalOpen(false);
  }

  function handleBotUpdate(updatedBot) {
    // Update the bot in the local state
    setBots(prevBots =>
      prevBots.map(bot =>
        (bot._id || bot.id) === (updatedBot._id || updatedBot.id) ? updatedBot : bot
      )
    );
  }

  function handleBotSelect(bot) {
    const botId = bot?._id || bot?.id;
    if (botId) {
      // Set the selected bot ID via context (for data access)
      // This does NOT open the chatbot - only selects it for the Website Actions panel
      switchBot(botId);
      // Show the Website Actions panel
      setShowWebsiteActionsPanel(true);
      // DO NOT call activateWidget - chatbot opens only via explicit user action
    }
  }

  async function handleAddWebsite() {
    if (!websiteUrl.trim()) {
      setAddWebsiteError('Please enter a website URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(websiteUrl.trim());
    } catch {
      setAddWebsiteError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setAddWebsiteLoading(true);
    setAddWebsiteError('');

    try {
      const response = await createBot(
        { scrapedWebsites: [websiteUrl.trim()] },
        token
      );
      
      setCreateSuccess('Website added successfully! You can now configure crawling.');
      setAddWebsiteModalOpen(false);
      setWebsiteUrl('');
      
      // Refetch bots from backend to get authoritative list
      await fetchBots();
      
      // Select the newly created bot and show Website Actions panel
      if (response.bot) {
        const botId = response.bot._id || response.bot.id;
        if (botId) {
          switchBot(botId);
          setShowWebsiteActionsPanel(true);
        }
      }
    } catch (err) {
      setAddWebsiteError(err.message || 'Failed to add website');
    } finally {
      setAddWebsiteLoading(false);
    }
  }

  async function handleCreateUser(values) {
    if (!token) {
      setCreateError('Session expired. Please log in again.');
      return;
    }

    setCreateError('');
    setCreateSuccess('');
    setCreateLoading(true);

    // Ensure maxBots is always a valid number, default to 1 if invalid
    const safeMaxBots = Number.isInteger(Number(values.maxBots)) && Number(values.maxBots) > 0
      ? Number(values.maxBots)
      : 1;

    try {
      const response = await apiRequest('/users', {
        method: 'POST',
        token,
        data: {
          name: values.name.trim(),
          email: values.email.trim(),
          username: values.username.trim(),
          password: values.password,
          maxBots: safeMaxBots
        }
      });

      setActiveTenant(response.user);
      setTenantDetails(response.user);
      setCreateSuccess('User created and provisioned successfully.');
      setCreateModalOpen(false);
    } catch (err) {
      setCreateError(err.message || 'Failed to create user.');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleRunScrape() {
    if (!selectedBot || !token) return;
    
    setScrapeLoading(true);
    setScrapeError('');
    setScrapeSuccess('');
    
    const botId = selectedBot._id || selectedBot.id;
    
    try {
      await apiRequest(`/bot/${botId}/scrape`, {
        method: 'POST',
        token
      });
      setScrapeSuccess('Crawl job started successfully!');
      
      // Refetch all bots from backend to get updated status
      await fetchBots();
      
      // Clear success message after a delay
      setTimeout(() => setScrapeSuccess(''), 3000);
      
      // Start polling for crawl completion
      startPollingForScrapeCompletion(botId);
    } catch (err) {
      setScrapeError(err.message || 'Failed to start crawl');
      setTimeout(() => setScrapeError(''), 5000);
    } finally {
      setScrapeLoading(false);
    }
  }
  
  function startPollingForScrapeCompletion(botId) {
    // Clear any existing polling interval
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }
    
    // Poll every 5 seconds
    const intervalId = setInterval(async () => {
      try {
        // Refetch all bots from backend
        await fetchBots();
        
        // Refetch crawl history to show new entries
        await fetchScrapeHistory();
        
        // Check if crawl has completed by looking at the updated bots state
        // This will be checked in the next useEffect that watches the bots state
      } catch (err) {
        console.error('Polling error:', err);
        // Continue polling even on error
      }
    }, 5000);
    
    setPollingIntervalId(intervalId);
  }
  
  // Handle scheduler toggle
  async function handleSchedulerToggle(enable) {
    if (!selectedBot || !token || schedulerLoading) return;
    
    setSchedulerLoading(true);
    setSchedulerError('');
    
    const botId = selectedBot._id || selectedBot.id;
    
    try {
      if (enable) {
        // Start scheduler
        await startBotScheduler(botId, token);
      } else {
        // Stop scheduler
        await stopBotScheduler(botId, token);
      }
      
      // Refetch bots to get updated state from backend
      await fetchBots();
    } catch (err) {
      setSchedulerError(err.message || 'Failed to toggle scheduler');
      setTimeout(() => setSchedulerError(''), 5000);
    } finally {
      setSchedulerLoading(false);
    }
  }

  // Fetch scrape history for selected bot
  const fetchScrapeHistory = useCallback(async () => {
    if (!selectedBot || !token) {
      console.log('fetchScrapeHistory: Skipped - No bot or token', { 
        hasSelectedBot: !!selectedBot, 
        hasToken: !!token,
        tokenLength: token?.length 
      });
      setScrapeHistory([]);
      return;
    }
    
    const botId = selectedBot._id || selectedBot.id;
    console.log('fetchScrapeHistory: Fetching for bot', { 
      botId, 
      botName: selectedBot.name,
      tokenPresent: !!token,
      tokenPreview: token.substring(0, 20) + '...'
    });
    setScrapeHistoryLoading(true);
    
    try {
      const response = await apiRequest(`/bot/${botId}/scrape-history`, {
        method: 'GET',
        token
      });
      
      console.log('fetchScrapeHistory: Response received', { 
        success: response.success, 
        historyCount: response.history?.length || 0,
        response 
      });
      
      if (response.success && response.history) {
        console.log('fetchScrapeHistory: Setting history -', response.history.length, 'entries');
        setScrapeHistory(response.history);
      } else {
        console.log('fetchScrapeHistory: No history in response or not successful');
        setScrapeHistory([]);
      }
    } catch (err) {
      console.error('fetchScrapeHistory: Error occurred', { 
        error: err.message, 
        botId,
        hasToken: !!token 
      });
      setScrapeHistory([]);
    } finally {
      setScrapeHistoryLoading(false);
    }
  }, [selectedBot, token]);

  // Fetch scrape history when selected bot changes
  useEffect(() => {
    fetchScrapeHistory();
  }, [fetchScrapeHistory]);

  const hasProvisionedTenant = Boolean(tenantDetails);

  const isAdmin = user?.role === 'admin';
  const isUser = user?.role === 'user';

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h2>Welcome, {user?.name || user?.username || 'User'}!</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {user?.role && (
            <span style={{ 
              padding: '0.25rem 0.75rem', 
              background: isAdmin ? '#4f46e5' : '#059669',
              color: 'white',
              borderRadius: '1rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}>
              {isAdmin ? 'Admin' : 'User'}
            </span>
          )}
          <button className="dashboard-logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {isAdmin && (
        <section className="dashboard-actions">
          <button className="dashboard-action-btn" onClick={openCreateModal}>
            ➕ Create User
          </button>
          <button
            className="dashboard-action-btn"
            onClick={() => navigate('/admin/users')}
          >
            📋 Manage Users
          </button>
        </section>
      )}

      {isUser && !hasProvisionedTenant && (
        <div className="dashboard-alert dashboard-alert--info" style={{ marginTop: '1rem' }}>
          <strong>Welcome!</strong> Your administrator has set up your account. 
          You can now interact with your personalized chatbot.
        </div>
      )}

      {createSuccess && (
        <div className="dashboard-alert dashboard-alert--success">{createSuccess}</div>
      )}

      {tenantError && (
        <div className="dashboard-alert dashboard-alert--error">{tenantError}</div>
      )}

      {tenantLoading ? (
        <Loader message="Loading your resources..." />
      ) : hasProvisionedTenant ? (
        <>
          {/* Admin View - Minimal Info Only */}
          {isAdmin && (
            <section className="dashboard-info">
              <h3>User: {tenantDetails.name || tenantDetails.username}</h3>
              <div style={{
                padding: '1.5rem',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                marginTop: '1rem'
              }}>
                <p style={{ margin: 0, fontSize: '1rem', color: '#374151' }}>
                  <strong>Email:</strong> {tenantDetails.email}
                </p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', color: '#374151' }}>
                  <strong>Capacity:</strong> {tenantDetails.maxBots} chatbot{tenantDetails.maxBots > 1 ? 's' : ''} allowed
                </p>
              </div>
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                color: '#92400e',
                fontSize: '0.875rem'
              }}>
                ℹ️ Users manage their own websites and chatbots. Select a different user from the Users page.
              </div>
            </section>
          )}
          
          {/* User View - Full Bot Management */}
          {isUser && (
            <section className="dashboard-info">
              <h3>Your Chatbots</h3>
              <p className="dashboard-subtitle">
                Manage your chatbot websites and configurations.
              </p>
              
              {/* Capacity Display */}
              <div style={{
                padding: '1rem 1.5rem',
                background: '#eff6ff',
                border: '2px solid #3b82f6',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '1rem'
              }}>
                <strong>You can create up to {tenantDetails?.maxBots} chatbot{tenantDetails?.maxBots > 1 ? 's' : ''}</strong>
                {bots.length > 0 && (
                  <span style={{ marginLeft: '0.5rem', color: '#1e40af' }}>
                    ({bots.length} / {tenantDetails?.maxBots} created)
                  </span>
                )}
              </div>
              
              {botsLoading && <Loader message="Loading websites..." size="small" />}
              
              {botsError && bots.length > 0 && (
                <div style={{
                  padding: '1rem',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                  color: '#991b1b',
                  marginBottom: '1rem'
                }}>
                  {botsError}
                </div>
              )}
              
              {!botsLoading && !botsError && (
                <>
                  {/* Add Website Button */}
                  {bots.length < tenantDetails?.maxBots && (
                    <div style={{ marginBottom: '1rem' }}>
                      <button
                        className="dashboard-action-btn"
                        onClick={() => setAddWebsiteModalOpen(true)}
                        style={{
                          padding: '0.75rem 1.5rem',
                          fontSize: '1rem',
                          width: '100%',
                          maxWidth: '300px'
                        }}
                      >
                        ➕ Add Website
                      </button>
                    </div>
                  )}

                  {/* Website List */}
                  {bots.length === 0 ? (
                    <div style={{
                      padding: '2rem',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      textAlign: 'center',
                      color: '#6b7280'
                    }}>
                      <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No websites added yet</p>
                      <p style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>
                        Click "Add Website" to create your first chatbot
                      </p>
                    </div>
                  ) : (
                    <div>
                      <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#6b7280', fontWeight: '500', textTransform: 'uppercase' }}>Your Websites</h4>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        marginBottom: '1.5rem'
                      }}>
                        {bots.map(bot => (
                          <div
                            key={bot._id || bot.id}
                            onClick={() => handleBotSelect(bot)}
                            style={{
                              padding: '1rem 1.25rem',
                              background: selectedBot && (selectedBot._id || selectedBot.id) === (bot._id || bot.id) ? '#eff6ff' : 'white',
                              border: selectedBot && (selectedBot._id || selectedBot.id) === (bot._id || bot.id) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              {bot.scrapedWebsites && bot.scrapedWebsites.length > 0 && bot.scrapedWebsites[0] ? (
                                <a
                                  href={bot.scrapedWebsites[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    fontSize: '1rem',
                                    color: selectedBot && (selectedBot._id || selectedBot.id) === (bot._id || bot.id) ? '#1e40af' : '#3b82f6',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                    wordBreak: 'break-all'
                                  }}
                                >
                                  {bot.scrapedWebsites[0]}
                                </a>
                              ) : (
                                <span style={{ fontSize: '1rem', color: '#9ca3af', fontStyle: 'italic' }}>
                                  No website configured
                                </span>
                              )}
                            </div>
                            {selectedBot && (selectedBot._id || selectedBot.id) === (bot._id || bot.id) && (
                              <span style={{ marginLeft: '1rem', color: '#3b82f6', fontSize: '1.25rem' }}>✓</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions - Only show when panel is explicitly shown and a website is selected */}
                  {showWebsiteActionsPanel && selectedBot && (
                    <div style={{
                      padding: '1.5rem',
                      background: '#f0f9ff',
                      border: '2px solid #3b82f6',
                      borderRadius: '8px',
                      marginTop: '1.5rem',
                      position: 'relative'
                    }}>
                      {/* Close Button - Only closes Website Actions panel, selection persists in context */}
                      <button
                        onClick={() => {
                          // Close the Website Actions panel - that's all we need to do
                          // The selected bot remains in context (no chat widget logic invoked)
                          setShowWebsiteActionsPanel(false);
                        }}
                        style={{
                          position: 'absolute',
                          top: '1rem',
                          right: '1rem',
                          background: 'transparent',
                          border: 'none',
                          fontSize: '1.5rem',
                          cursor: 'pointer',
                          color: '#64748b',
                          lineHeight: 1,
                          padding: '0.25rem',
                          width: '2rem',
                          height: '2rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e2e8f0';
                          e.currentTarget.style.color = '#334155';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#64748b';
                        }}
                        title="Close actions panel"
                      >
                        ✕
                      </button>

                      <h4 style={{ margin: '0 2rem 0.5rem 0', color: '#0c4a6e', fontSize: '1.125rem' }}>
                        Website Actions
                      </h4>
                      <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#475569' }}>
                        Manage chatbot for: <strong>{(selectedBot.scrapedWebsites && selectedBot.scrapedWebsites[0]) ? selectedBot.scrapedWebsites[0] : 'this website'}</strong>
                      </p>

                      {/* Crawl Status & Metadata Display */}
                      <div style={{
                        padding: '1rem',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        marginBottom: '1rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#334155' }}>Crawl Status</span>
                          {selectedBot.schedulerConfig?.status === 'running' && (
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#dbeafe',
                              color: '#1e40af',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></span>
                              Crawl in progress
                            </span>
                          )}
                          {selectedBot.schedulerConfig?.status === 'completed' && (
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#d1fae5',
                              color: '#065f46',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '12px'
                            }}>
                              ✓ Completed
                            </span>
                          )}
                          {selectedBot.schedulerConfig?.status === 'failed' && (
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#fee2e2',
                              color: '#991b1b',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '12px'
                            }}>
                              ✗ Failed
                            </span>
                          )}
                          {!selectedBot.schedulerConfig?.status && (
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#f3f4f6',
                              color: '#6b7280',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '12px'
                            }}>
                              Not started
                            </span>
                          )}
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.8125rem' }}>
                          <div>
                            <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Last Crawl</div>
                            <div style={{ color: '#1e293b', fontWeight: '500' }}>
                              {selectedBot.lastScrapeAt
                                ? new Date(selectedBot.lastScrapeAt).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : 'Never'}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Bot Status</div>
                            <div style={{ color: '#1e293b', fontWeight: '500' }}>
                              {selectedBot.botReady
                                ? <span style={{ color: '#059669' }}>✓ Ready</span>
                                : <span style={{ color: '#dc2626' }}>Not Ready</span>}
                            </div>
                          </div>
                        </div>

                        {selectedBot.schedulerConfig?.totalDocuments !== undefined && selectedBot.schedulerConfig.totalDocuments > 0 && (
                          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Documents Crawled</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0ea5e9', marginTop: '0.25rem' }}>
                              {selectedBot.schedulerConfig.totalDocuments.toLocaleString()}
                            </div>
                          </div>
                        )}

                        {/* Crawl History */}
                        {scrapeHistory.length > 0 && (
                          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: '600' }}>
                              Crawl History
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                              {scrapeHistory.map((entry, index) => (
                                <div
                                  key={entry._id || index}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.5rem',
                                    background: '#f8fafc',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                    <div style={{ color: '#1e293b', fontWeight: '500' }}>
                                      {new Date(entry.completedAt).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </div>
                                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                      {entry.trigger === 'scheduler' ? 'Scheduled' : 'Manual'}
                                    </div>
                                  </div>
                                  <div>
                                    {entry.success ? (
                                      <span style={{ color: '#059669', fontSize: '1rem' }}>✓</span>
                                    ) : (
                                      <span style={{ color: '#dc2626', fontSize: '1rem' }}>✗</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {scrapeHistoryLoading && (
                          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Loading history...</div>
                          </div>
                        )}
                      </div>
                    
                    {scrapeSuccess && (
                      <div style={{
                        padding: '0.75rem',
                        background: '#d1fae5',
                        border: '1px solid #10b981',
                        borderRadius: '4px',
                        color: '#065f46',
                        marginBottom: '1rem',
                        fontSize: '0.875rem'
                      }}>
                        {scrapeSuccess}
                      </div>
                    )}
                    
                    {scrapeError && (
                      <div style={{
                        padding: '0.75rem',
                        background: '#fee2e2',
                        border: '1px solid #ef4444',
                        borderRadius: '4px',
                        color: '#991b1b',
                        marginBottom: '1rem',
                        fontSize: '0.875rem'
                      }}>
                        {scrapeError}
                      </div>
                    )}
                      
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                          className="dashboard-action-btn"
                          onClick={handleRunScrape}
                          disabled={scrapeLoading || selectedBot.schedulerConfig?.status === 'running'}
                          style={{
                            opacity: (scrapeLoading || selectedBot.schedulerConfig?.status === 'running') ? 0.6 : 1,
                            cursor: (scrapeLoading || selectedBot.schedulerConfig?.status === 'running') ? 'not-allowed' : 'pointer',
                            flex: '1 1 200px'
                          }}
                        >
                          {scrapeLoading ? '⏳ Running...' : selectedBot.schedulerConfig?.status === 'running' ? '⏳ Crawling...' : '🔄 Run Crawl'}
                        </button>
                        <button
                          className="dashboard-action-btn"
                          onClick={() => {
                            const botId = selectedBot._id || selectedBot.id;
                            navigate(`/bot/${botId}`);
                          }}
                          style={{ flex: '1 1 200px' }}
                        >
                          💬 Open Chatbot
                        </button>
                        <button
                          className="dashboard-action-btn dashboard-action-btn--widget"
                          onClick={() => setWidgetInstallerOpen(true)}
                          style={{ flex: '1 1 200px' }}
                        >
                          🚀 Install Widget
                        </button>
                      </div>
                      <div style={{
                        marginTop: '1rem',
                        padding: '0.75rem',
                        background: '#e0f2fe',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        color: '#0c4a6e'
                      }}>
                        ℹ️ <strong>Run Crawl</strong> adds website content to your chatbot's knowledge base.
                      </div>
                      
                      {/* Scheduler Section */}
                      <div style={{
                        marginTop: '1.5rem',
                        paddingTop: '1.5rem',
                        borderTop: '2px solid #e2e8f0'
                      }}>
                        <h5 style={{ 
                          margin: '0 0 1rem 0', 
                          fontSize: '1rem', 
                          color: '#0f172a',
                          fontWeight: '600'
                        }}>
                          ⏱️ Scheduled Crawling
                        </h5>
                        
                        {schedulerError && (
                          <div style={{
                            padding: '0.75rem',
                            background: '#fee2e2',
                            border: '1px solid #ef4444',
                            borderRadius: '4px',
                            color: '#991b1b',
                            marginBottom: '1rem',
                            fontSize: '0.875rem'
                          }}>
                            {schedulerError}
                          </div>
                        )}
                        
                        {/* Scheduler Toggle */}
                        <div style={{
                          padding: '1rem',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          marginBottom: '1rem'
                        }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            marginBottom: '0.75rem'
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ 
                                fontSize: '0.875rem', 
                                fontWeight: '600', 
                                color: '#334155',
                                marginBottom: '0.25rem'
                              }}>
                                Enable Scheduled Crawling
                              </div>
                              <div style={{ 
                                fontSize: '0.75rem', 
                                color: '#64748b'
                              }}>
                                Automatically crawl website every 10 minutes
                              </div>
                            </div>
                            
                            <label style={{
                              position: 'relative',
                              display: 'inline-block',
                              width: '52px',
                              height: '28px',
                              cursor: schedulerLoading ? 'not-allowed' : 'pointer',
                              opacity: schedulerLoading ? 0.6 : 1
                            }}>
                              <input
                                type="checkbox"
                                checked={schedulerStatus === 'active'}
                                onChange={(e) => handleSchedulerToggle(e.target.checked)}
                                disabled={schedulerLoading}
                                style={{ opacity: 0, width: 0, height: 0 }}
                              />
                              <span style={{
                                position: 'absolute',
                                cursor: schedulerLoading ? 'not-allowed' : 'pointer',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: schedulerStatus === 'active' ? '#10b981' : '#cbd5e1',
                                transition: '0.4s',
                                borderRadius: '28px'
                              }}>
                                <span style={{
                                  position: 'absolute',
                                  content: '""',
                                  height: '20px',
                                  width: '20px',
                                  left: schedulerStatus === 'active' ? '28px' : '4px',
                                  bottom: '4px',
                                  backgroundColor: 'white',
                                  transition: '0.4s',
                                  borderRadius: '50%'
                                }}></span>
                              </span>
                            </label>
                          </div>
                          
                          {/* Scheduler Status Display */}
                          <div style={{
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #e2e8f0',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '0.75rem',
                            fontSize: '0.8125rem'
                          }}>
                            <div>
                              <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Scheduler Status</div>
                              <div style={{ fontWeight: '600' }}>
                                {schedulerLoading ? (
                                  <span style={{ color: '#6b7280' }}>⏳ Updating...</span>
                                ) : schedulerStatus === 'active' ? (
                                  <span style={{ color: '#059669' }}>✓ Active</span>
                                ) : (
                                  <span style={{ color: '#64748b' }}>○ Inactive</span>
                                )}
                              </div>
                            </div>
                            
                            <div>
                              <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Last Scheduled Crawl</div>
                              <div style={{ fontWeight: '500', color: '#1e293b' }}>
                                {schedulerConfig?.lastScrapeCompleted
                                  ? new Date(schedulerConfig.lastScrapeCompleted).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : 'Never'}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div style={{
                          padding: '0.75rem',
                          background: '#fef3c7',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          color: '#78350f'
                        }}>
                          ℹ️ When enabled, the scheduler will automatically crawl your website every 10 minutes and automatically updates chatbot knowledge.
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="dashboard-empty">
          <p>
            {isAdmin 
              ? 'Create a user or select one from the Users page to view their details.'
              : 'Your account is being set up. Please contact your administrator if this persists.'
            }
          </p>
        </section>
      )}

      {createModalOpen && (
        <div className="scrape-modal-overlay" role="dialog" aria-modal="true">
          <div className="scrape-modal">
            <h3>Create User</h3>
            <p className="scrape-modal-subtitle">
              Enter the user details. Provisioning runs immediately after submission.
            </p>

            {createError && <p className="scrape-error">{createError}</p>}

            <UserForm
              mode="create"
              loading={createLoading}
              onSubmit={handleCreateUser}
            />

            <div className="scrape-modal-actions">
              <button
                type="button"
                className="scrape-btn-neutral"
                onClick={closeCreateModal}
                disabled={createLoading}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Widget Installer Modal */}
      <WidgetInstaller 
        isOpen={isWidgetInstallerOpen}
        onClose={() => setWidgetInstallerOpen(false)}
        bots={selectedBot ? [selectedBot] : []}
      />

      {/* Add Website Modal */}
      {addWebsiteModalOpen && (
        <div className="scrape-modal-overlay" role="dialog" aria-modal="true">
          <div className="scrape-modal">
            <h3>Add Website</h3>
            <p className="scrape-modal-subtitle">
              Enter the website URL you want to create a chatbot for.
            </p>

            {addWebsiteError && <p className="scrape-error">{addWebsiteError}</p>}

            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="website-url" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Website URL
              </label>
              <input
                id="website-url"
                type="url"
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={addWebsiteLoading}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '1rem'
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddWebsite();
                  }
                }}
              />
            </div>

            <div className="scrape-modal-actions">
              <button
                type="button"
                className="scrape-btn-neutral"
                onClick={() => {
                  setAddWebsiteModalOpen(false);
                  setWebsiteUrl('');
                  setAddWebsiteError('');
                }}
                disabled={addWebsiteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="scrape-btn-primary"
                onClick={handleAddWebsite}
                disabled={addWebsiteLoading}
              >
                {addWebsiteLoading ? '⏳ Adding...' : '➕ Add Website'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
