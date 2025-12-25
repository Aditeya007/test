// src/pages/DashboardPage.js

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api';
import UserForm from '../components/users/UserForm';
import Loader from '../components/Loader';
import WidgetInstaller from '../components/WidgetInstaller';

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
  const [isScrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [startUrl, setStartUrl] = useState('');
  const [isProcessing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [scrapeError, setScrapeError] = useState('');
  const [jobResult, setJobResult] = useState(null);
  const [isWidgetInstallerOpen, setWidgetInstallerOpen] = useState(false);

  // Scheduler state
  const [useScheduler, setUseScheduler] = useState(false); // Toggle for immediate vs scheduled
  const [schedulerStatus, setSchedulerStatus] = useState('inactive');
  const [schedulerConfig, setSchedulerConfig] = useState(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerError, setSchedulerError] = useState('');

  const summaryJobId = jobResult?.summary
    ? jobResult.summary.jobId || jobResult.jobId || null
    : null;
  const summaryResourceId = jobResult?.summary
    ? jobResult.summary.resource_id || jobResult.summary.resourceId || jobResult.resourceId || null
    : null;

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

  // Fetch scheduler status
  const fetchSchedulerStatus = useCallback(async () => {
    if (!token || !tenantDetails) return;
    
    try {
      const tenantUserId = tenantDetails.id || tenantDetails._id;
      const response = await apiRequest('/scrape/scheduler/status', {
        method: 'GET',
        token,
        params: { tenantUserId }
      });
      
      if (response.success) {
        setSchedulerStatus(response.schedulerStatus || 'inactive');
        setSchedulerConfig(response.schedulerConfig);
      }
    } catch (err) {
      console.error('Failed to fetch scheduler status:', err);
      // Don't show error to user, just use default inactive state
    }
  }, [token, tenantDetails]);

  // Fetch scheduler status when tenant details change
  useEffect(() => {
    fetchSchedulerStatus();
    
    // Also poll every 30 seconds to keep status fresh
    const interval = setInterval(fetchSchedulerStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchSchedulerStatus]);

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

  const dbUri = tenantDetails?.databaseUri || 'Not provisioned yet';
  const botEndpoint = tenantDetails?.botEndpoint || 'Not provisioned yet';
  const schedulerEndpoint = tenantDetails?.schedulerEndpoint || 'Not provisioned yet';
  const scraperEndpoint = tenantDetails?.scraperEndpoint || 'Not provisioned yet';

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

  function openScrapeModal() {
    if (!tenantDetails) {
      setTenantError('Create or select a user before running a scrape.');
      return;
    }
    setStartUrl('');
    setStatusMessage('');
    setScrapeError('');
    setJobResult(null);
    setUseScheduler(false); // Reset to immediate execution
    setSchedulerError('');
    setScrapeModalOpen(true);
  }

  function closeScrapeModal() {
    if (isProcessing) {
      return;
    }
    setScrapeModalOpen(false);
  }

  async function handleScrape() {
    if (!tenantDetails) {
      setScrapeError('No user selected.');
      return;
    }

    if (!startUrl || !startUrl.trim()) {
      setScrapeError('Please provide a website URL to scrape.');
      return;
    }

    const normalizedUrl = startUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      setScrapeError('URL must begin with http:// or https://');
      return;
    }

    if (!token) {
      setScrapeError('Authentication expired. Please log in again.');
      return;
    }

    setScrapeError('');
    setSchedulerError('');
    setProcessing(true);
    setJobResult(null);

    try {
      const tenantUserId = tenantDetails.id || tenantDetails._id;

      // If not using scheduler, run full scrape immediately
      if (!useScheduler) {
        setStatusMessage('Launching full scrape. This may take a while depending on site size...');
        
        const response = await apiRequest('/scrape/run', {
          method: 'POST',
          token,
          data: {
            startUrl: normalizedUrl,
            tenantUserId
          }
        });

        setStatusMessage('✅ Scraping completed successfully. You can now interact with the bot using the refreshed knowledge base.');
        setJobResult(response);
      } else {
        // Start a scheduled updater (runs every 2 hours)
        setStatusMessage('Starting scheduler (runs every 2 hours)...');
        
        const response = await apiRequest('/scrape/scheduler/start', {
          method: 'POST',
          token,
          data: {
            startUrl: normalizedUrl,
            tenantUserId
          }
        });

        if (response.success) {
          setStatusMessage('✅ Scheduler started! Your knowledge base will be updated every 2 hours.');
          setSchedulerStatus('active');
          setSchedulerConfig(response.schedulerConfig);
          setJobResult({ summary: { status: 'scheduled', ...response.schedulerConfig } });
        } else {
          throw new Error(response.error || 'Failed to start scheduler');
        }
      }
    } catch (err) {
      setScrapeError(err.message || 'Operation failed. Please try again later.');
      setStatusMessage('');
    } finally {
      setProcessing(false);
    }
  }

  async function handleStopScheduler() {
    if (!tenantDetails || !token) {
      setSchedulerError('No user selected or session expired.');
      return;
    }

    setSchedulerLoading(true);
    setSchedulerError('');

    try {
      const tenantUserId = tenantDetails.id || tenantDetails._id;
      const response = await apiRequest('/scrape/scheduler/stop', {
        method: 'POST',
        token,
        data: { tenantUserId }
      });

      if (response.success) {
        setSchedulerStatus('inactive');
        // Refresh scheduler config
        fetchSchedulerStatus();
      } else {
        throw new Error(response.error || 'Failed to stop scheduler');
      }
    } catch (err) {
      setSchedulerError(err.message || 'Failed to stop scheduler.');
    } finally {
      setSchedulerLoading(false);
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
              {isAdmin ? `Provisioned Resources for ${tenantDetails.name}` : 'Your Resources'}
            </h3>
            <p className="dashboard-subtitle">
              {isAdmin 
                ? 'The infrastructure below was created when the user was provisioned.'
                : 'Your personalized chatbot infrastructure and knowledge base.'
              }
            </p>
            
            {/* Scheduler Management Section - Always Visible */}
            <div style={{
              padding: '1rem',
              background: schedulerStatus === 'active' ? '#ecfdf5' : '#f3f4f6',
              border: `1px solid ${schedulerStatus === 'active' ? '#10b981' : '#d1d5db'}`,
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: schedulerStatus === 'active' ? '#065f46' : '#374151' }}>
                📅 Scheduler Management
                {schedulerStatus === 'active' && (
                  <span style={{
                    marginLeft: '0.75rem',
                    padding: '0.25rem 0.5rem',
                    background: '#10b981',
                    color: 'white',
                    borderRadius: '1rem',
                    fontSize: '0.7rem',
                    fontWeight: '500'
                  }}>
                    🟢 RUNNING
                  </span>
                )}
              </h4>
              
              {schedulerStatus === 'active' ? (
                <>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                    <strong>Interval:</strong> Every {schedulerConfig?.intervalMinutes || 5} minutes
                  </p>
                  {schedulerConfig?.startUrl && (
                    <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                      <strong>URL:</strong> {schedulerConfig.startUrl}
                    </p>
                  )}
                  {schedulerConfig?.lastStarted && (
                    <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                      <strong>Started:</strong> {new Date(schedulerConfig.lastStarted).toLocaleString()}
                    </p>
                  )}
                  {schedulerConfig?.lastScrapeCompleted && (
                    <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#059669' }}>
                      <strong>Last Scrape:</strong> {new Date(schedulerConfig.lastScrapeCompleted).toLocaleString()}
                    </p>
                  )}
                  {schedulerConfig?.botReady && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      background: '#d1fae5',
                      border: '1px solid #10b981',
                      borderRadius: '4px',
                      color: '#065f46',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}>
                      ✅ Bot is ready to use with updated knowledge base!
                    </div>
                  )}
                  <button
                    onClick={handleStopScheduler}
                    disabled={schedulerLoading}
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.5rem 1rem',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: schedulerLoading ? 'not-allowed' : 'pointer',
                      opacity: schedulerLoading ? 0.6 : 1,
                      fontWeight: '500'
                    }}
                  >
                    {schedulerLoading ? 'Stopping...' : '🛑 Stop Scheduler'}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    No scheduler is currently running. Use "Update Knowledge Base" and enable the scheduler option to start automatic updates.
                  </p>
                  {schedulerConfig?.lastStopped && (
                    <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#9ca3af' }}>
                      <strong>Last stopped:</strong> {new Date(schedulerConfig.lastStopped).toLocaleString()}
                    </p>
                  )}
                </>
              )}
              
              {schedulerError && (
                <p style={{ color: '#ef4444', margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
                  {schedulerError}
                </p>
              )}
            </div>

            <table className="dashboard-table">
              <tbody>
                <tr>
                  <td><strong>Tenant ID:</strong></td>
                  <td className="dashboard-value">{tenantDetails.id || tenantDetails._id}</td>
                </tr>
                <tr>
                  <td><strong>Resource ID:</strong></td>
                  <td className="dashboard-value">{tenantDetails.resourceId}</td>
                </tr>
                <tr>
                  <td><strong>Database URI:</strong></td>
                  <td className="dashboard-value">{dbUri}</td>
                </tr>
                <tr>
                  <td><strong>Bot Endpoint:</strong></td>
                  <td className="dashboard-value">{botEndpoint}</td>
                </tr>
                <tr>
                  <td><strong>Scheduler Endpoint:</strong></td>
                  <td className="dashboard-value">{schedulerEndpoint}</td>
                </tr>
                <tr>
                  <td><strong>Scraper Endpoint:</strong></td>
                  <td className="dashboard-value">{scraperEndpoint}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="dashboard-actions dashboard-actions--secondary">
            <button
              className="dashboard-action-btn"
              onClick={() => navigate('/bot')}
            >
              🤖 {isUser ? 'Open Chatbot' : 'Interact with Bot'}
            </button>
            <button
              className="dashboard-action-btn"
              onClick={openScrapeModal}
            >
              🧹 {isUser ? 'Update My Knowledge Base' : 'Run Scrape & Update'}
            </button>
            <button
              className="dashboard-action-btn dashboard-action-btn--widget"
              onClick={() => setWidgetInstallerOpen(true)}
            >
              🚀 Install Chatbot on Your Site
            </button>
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

      {isScrapeModalOpen && (
        <div className="scrape-modal-overlay" role="dialog" aria-modal="true">
          <div className="scrape-modal">
            <h3>{isUser ? 'Update My Knowledge Base' : 'Run Tenant Scrape & Updater'}</h3>
            <p className="scrape-modal-subtitle">
              {isUser 
                ? 'Provide the root URL you want to crawl. The updater will refresh your knowledge base with the latest content from the website.'
                : 'Provide the root URL you want to crawl. The updater will refresh the selected user\'s knowledge base and notify you when it finishes.'
              }
            </p>

            <label htmlFor="scrape-start-url">Website URL</label>
            <input
              id="scrape-start-url"
              type="url"
              placeholder="https://example.com"
              value={startUrl}
              onChange={(event) => setStartUrl(event.target.value)}
              disabled={isProcessing}
            />

            {/* Schedule Options */}
            <div style={{ marginTop: '1rem' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={useScheduler}
                  onChange={(event) => setUseScheduler(event.target.checked)}
                  disabled={isProcessing}
                  style={{ width: '1.25rem', height: '1.25rem' }}
                />
                <span>Enable automatic updates (every 2 hours)</span>
              </label>

              {useScheduler && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', marginLeft: '1.75rem' }}>
                  ℹ️ The scheduler will run in the background and update your knowledge base every 2 hours.
                </p>
              )}
            </div>

            {statusMessage && (
              <p className="scrape-status">{statusMessage}</p>
            )}

            {scrapeError && (
              <p className="scrape-error">{scrapeError}</p>
            )}

            {schedulerError && (
              <p className="scrape-error">{schedulerError}</p>
            )}

            {isProcessing && (
              <p className="scrape-processing">Working... This window will update once the job completes.</p>
            )}

            {jobResult?.summary && (
              <div className="scrape-summary">
                <h4>Job Summary</h4>
                {jobResult.summary.status && (
                  <p><strong>Status:</strong> {jobResult.summary.status}</p>
                )}
                {summaryJobId && (
                  <p><strong>Job ID:</strong> {summaryJobId}</p>
                )}
                {summaryResourceId && (
                  <p><strong>Resource ID:</strong> {summaryResourceId}</p>
                )}
                {jobResult.summary.stats && (
                  <pre>{JSON.stringify(jobResult.summary.stats, null, 2)}</pre>
                )}
              </div>
            )}

            {jobResult?.stdout && (
              <details className="scrape-logs">
                <summary>View Logs</summary>
                <pre>{jobResult.stdout}</pre>
              </details>
            )}

            <div className="scrape-modal-actions">
              <button
                type="button"
                className="scrape-btn-neutral"
                onClick={closeScrapeModal}
                disabled={isProcessing}
              >
                Close
              </button>
              <button
                type="button"
                className="scrape-btn-primary"
                onClick={handleScrape}
                disabled={isProcessing}
              >
                {isProcessing ? 'Running...' : useScheduler ? 'Start Scheduler' : 'Start Scrape'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Widget Installer Modal */}
      <WidgetInstaller 
        isOpen={isWidgetInstallerOpen}
        onClose={() => setWidgetInstallerOpen(false)}
      />
    </div>
  );
}

export default DashboardPage;
