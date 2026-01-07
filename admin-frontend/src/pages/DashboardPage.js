// src/pages/DashboardPage.js

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest, getUserBots } from '../api';
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

  function handleBotUpdate(updatedBot) {
    // Update the bot in the local state
    setBots(prevBots =>
      prevBots.map(bot =>
        (bot._id || bot.id) === (updatedBot._id || updatedBot.id) ? updatedBot : bot
      )
    );
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

            {/* Bots Section */}
            <div style={{ marginTop: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>
                {isAdmin ? `Bots for ${tenantDetails.name}` : 'Your Bots'}
              </h3>
              
              {botsLoading && <Loader message="Loading bots..." size="small" />}
              
              {botsError && (
                <div style={{
                  padding: '1rem',
                  background: '#fee2e2',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                  color: '#991b1b'
                }}>
                  {botsError}
                </div>
              )}
              
              {!botsLoading && !botsError && bots.length === 0 && (
                <div style={{
                  padding: '1.5rem',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontStyle: 'italic'
                }}>
                  No bots configured yet.
                </div>
              )}
              
              {!botsLoading && !botsError && bots.length > 0 && (
                <div>
                  {bots.map(bot => (
                    <BotCard
                      key={bot._id || bot.id}
                      bot={bot}
                      token={token}
                      onUpdate={handleBotUpdate}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="dashboard-actions dashboard-actions--secondary">
            <button
              className="dashboard-action-btn"
              onClick={() => navigate('/bot')}
            >
              🤖 {isUser ? 'Open Chatbot' : 'Interact with Bot'}
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

      {/* Widget Installer Modal */}
      <WidgetInstaller 
        isOpen={isWidgetInstallerOpen}
        onClose={() => setWidgetInstallerOpen(false)}
      />
    </div>
  );
}

export default DashboardPage;
