// src/pages/DashboardPage.js

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest, getUserBots, createBot } from '../api';
import UserForm from '../components/users/UserForm';
import Loader from '../components/Loader';
import WidgetInstaller from '../components/WidgetInstaller';
import BotCard from '../components/BotCard';

import '../styles/index.css';

function DashboardPage() {
  const { user, token, logout, activeTenant, setActiveTenant } = useAuth();
  const navigate = useNavigate();

  const [tenantDetails, setTenantDetails] = useState(activeTenant);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [isWidgetInstallerOpen, setWidgetInstallerOpen] = useState(false);

  // Bots state
  const [bots, setBots] = useState([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [botsError, setBotsError] = useState('');
  const [selectedBot, setSelectedBot] = useState(null);
  
  // Add website modal state
  const [addWebsiteModalOpen, setAddWebsiteModalOpen] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [addWebsiteLoading, setAddWebsiteLoading] = useState(false);
  const [addWebsiteError, setAddWebsiteError] = useState('');

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
    if (!token || !tenantDetails) return;
    
    setBotsLoading(true);
    setBotsError('');
    
    try {
      const tenantUserId = tenantDetails.id || tenantDetails._id;
      const response = await getUserBots(tenantUserId, token);
      
      if (response.bots) {
        setBots(response.bots);
      }
    } catch (err) {
      console.error('Failed to fetch bots:', err);
      setBotsError(err.message || 'Failed to load bots');
    } finally {
      setBotsLoading(false);
    }
  }, [token, tenantDetails]);

  // Fetch bots when tenant details change
  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

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
    setSelectedBot(bot);
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
      
      setCreateSuccess('Website added successfully! You can now configure scraping.');
      setAddWebsiteModalOpen(false);
      setWebsiteUrl('');
      
      // Refresh bot list
      await fetchBots();
      
      // Auto-select the new bot
      if (response.bot) {
        setSelectedBot(response.bot);
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

    try {
      const response = await apiRequest('/users', {
        method: 'POST',
        token,
        data: {
          name: values.name.trim(),
          email: values.email.trim(),
          username: values.username.trim(),
          password: values.password
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
          <section className="dashboard-info">
            <h3>
              {isAdmin ? `Bots for ${tenantDetails.name}` : 'Your Chatbots'}
            </h3>
            <p className="dashboard-subtitle">
              {isAdmin 
                ? 'Manage bots for this user.'
                : 'Manage your chatbot websites and configurations.'
              }
            </p>
            
            {botsLoading && <Loader message="Loading bots..." size="small" />}
            
            {botsError && (
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
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  padding: '0.75rem 1rem',
                  background: '#f9fafb',
                  borderRadius: '4px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div>
                    <strong>Bots: </strong>{bots.length} / {tenantDetails.maxBots || 1}
                  </div>
                  {isUser && bots.length < (tenantDetails.maxBots || 1) && (
                    <button
                      className="dashboard-action-btn"
                      onClick={() => setAddWebsiteModalOpen(true)}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem'
                      }}
                    >
                      ➕ Add Website
                    </button>
                  )}
                </div>

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
                      {isUser ? 'Click "Add Website" to create your first chatbot' : 'User has not created any bots yet'}
                    </p>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.5rem'
                  }}>
                    {bots.map(bot => (
                      <div
                        key={bot._id || bot.id}
                        onClick={() => handleBotSelect(bot)}
                        style={{
                          padding: '1rem',
                          background: selectedBot && (selectedBot._id || selectedBot.id) === (bot._id || bot.id) ? '#eff6ff' : 'white',
                          border: selectedBot && (selectedBot._id || selectedBot.id) === (bot._id || bot.id) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#1f2937' }}>
                          {bot.name || 'Untitled Bot'}
                        </h4>
                        {bot.scrapedWebsites && bot.scrapedWebsites.length > 0 ? (
                          <a
                            href={bot.scrapedWebsites[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: '0.875rem',
                              color: '#3b82f6',
                              textDecoration: 'none',
                              wordBreak: 'break-all'
                            }}
                          >
                            {bot.scrapedWebsites[0]}
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                            No website configured
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {selectedBot && (
                  <div style={{
                    padding: '1.5rem',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '8px',
                    marginTop: '1.5rem'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#0c4a6e' }}>
                      Actions for {selectedBot.name || 'Selected Bot'}
                    </h4>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        className="dashboard-action-btn"
                        onClick={() => navigate('/bot')}
                      >
                        💬 Open Chatbot
                      </button>
                      <button
                        className="dashboard-action-btn dashboard-action-btn--widget"
                        onClick={() => setWidgetInstallerOpen(true)}
                      >
                        🚀 Install Widget
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <section className="dashboard-empty">
          <p>
            {isAdmin 
              ? 'Create a user to provision dedicated endpoints for the RAG system.'
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
