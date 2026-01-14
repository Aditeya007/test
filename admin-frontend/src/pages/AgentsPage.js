// src/pages/AgentsPage.js

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../api";
import Loader from "../components/Loader";
import AgentForm from "../components/AgentForm";
import "../styles/index.css";

function AgentsPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { userId } = useParams(); // For admin viewing a specific user's agents
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [maxAgents, setMaxAgents] = useState(0);
  const [viewingUser, setViewingUser] = useState(null);
  const [addAgentModalOpen, setAddAgentModalOpen] = useState(false);
  const [addAgentLoading, setAddAgentLoading] = useState(false);
  const [addAgentError, setAddAgentError] = useState("");
  const [addAgentSuccess, setAddAgentSuccess] = useState("");

  const isAdmin = user?.role === "admin";
  const targetUserId = userId || user?.id || user?._id;

  const fetchAgents = useCallback(async () => {
    if (!token || !targetUserId) return;

    setLoading(true);
    setError("");

    try {
      let response;

      if (isAdmin && userId) {
        // Admin viewing a specific user's agents
        response = await apiRequest(`/users/${userId}/agents`, {
          method: "GET",
          token,
        });

        // Also fetch user details
        try {
          const userResponse = await apiRequest(`/users/${userId}`, {
            method: "GET",
            token,
          });
          setViewingUser(userResponse.user);
        } catch (err) {
          console.error("Failed to fetch user details:", err);
        }
      } else {
        // Regular user viewing their own agents
        response = await apiRequest("/agent/list", {
          method: "GET",
          token,
        });
      }

      if (response.agents) {
        setAgents(response.agents);
        setMaxAgents(response.maxAgents || 0);
      }
    } catch (err) {
      setError(err.message || "Failed to load agents");
      console.error("Error fetching agents:", err);
    } finally {
      setLoading(false);
    }
  }, [token, targetUserId, isAdmin, userId]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      return dateString;
    }
  };

  const getStatusBadge = (status, isActive) => {
    if (!isActive) {
      return <span className="status-badge inactive">Inactive</span>;
    }

    const statusMap = {
      offline: { label: "Offline", class: "inactive" },
      available: { label: "Available", class: "active" },
      busy: { label: "Busy", class: "warning" },
    };

    const statusInfo = statusMap[status] || statusMap.offline;
    return (
      <span className={`status-badge ${statusInfo.class}`}>
        {statusInfo.label}
      </span>
    );
  };

  const handleCreateAgent = async (formData) => {
    setAddAgentLoading(true);
    setAddAgentError("");
    setAddAgentSuccess("");

    try {
      await apiRequest("/agent/create", {
        method: "POST",
        token,
        data: formData,
      });

      setAddAgentSuccess("Agent created successfully!");
      setAddAgentModalOpen(false);

      // Refetch agents
      await fetchAgents();

      // Clear success message after 3 seconds
      setTimeout(() => setAddAgentSuccess(""), 3000);
    } catch (err) {
      setAddAgentError(err.message || "Failed to create agent");
    } finally {
      setAddAgentLoading(false);
    }
  };

  if (loading) {
    return <Loader message="Loading agents..." />;
  }

  return (
    <div className="admin-users-container">
      <header className="admin-users-header">
        <div className="admin-users-header-content">
          <div className="admin-users-header-title">
            <h2 style={{ marginRight: "10px" }}>Agent Management</h2>
            <p>
              {isAdmin && viewingUser
                ? `Viewing agents for ${
                    viewingUser.name || viewingUser.username
                  }`
                : "View and manage your human agents"}
            </p>
          </div>
          <div className="admin-users-header-controls">
            {/* Create Agent Button - Only show for regular users (not admins viewing other users' agents) */}
            {/* {!isAdmin && maxAgents > 0 && agents.length < maxAgents && (
              <button
                type="button"
                className="auth-btn auth-btn--success"
                onClick={() => setAddAgentModalOpen(true)}
              >
                👤 Create Agent
              </button>
            )} */}
            <button
              type="button"
              className="btn-ghost"
              onClick={fetchAgents}
              disabled={loading}
            >
              Refresh
            </button>
            {isAdmin && userId && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigate("/admin/users")}
              >
                ← Back to Users
              </button>
            )}
          </div>
        </div>
      </header>

      {error && <div className="admin-users-error">{error}</div>}

      {addAgentSuccess && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#d1fae5",
            border: "1px solid #10b981",
            borderRadius: "6px",
            color: "#065f46",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {addAgentSuccess}
        </div>
      )}

      {/* Agent Capacity Info */}
      {maxAgents > 0 && (
        <div
          style={{
            padding: "1rem 1.5rem",
            background: "#eff6ff",
            border: "2px solid #3b82f6",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            fontSize: "1rem",
            width: "100%",
            boxSizing: "border-box",
            color: "#1e40af",
            lineHeight: "1.5",
          }}
        >
          <strong
            style={{
              color: "#1e40af",
              fontWeight: "600",
              marginRight: "0.5rem",
            }}
          >
            Agent Capacity:
          </strong>
          <span style={{ color: "#1e40af" }}>
            {agents.length} / {maxAgents} agents
          </span>
          {agents.length < maxAgents && (
            <span style={{ marginLeft: "0.5rem", color: "#1e40af" }}>
              ({maxAgents - agents.length} available)
            </span>
          )}
        </div>
      )}

      {/* Agents Table */}
      <div style={{ marginTop: "2rem" }}>
        {agents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <h3>No Agents Yet</h3>
            <p>
              {maxAgents === 0
                ? "Agent creation is disabled for this account."
                : isAdmin && userId
                ? "This user has not created any agents yet."
                : "You have not created any agents yet. Go to Dashboard to add agents."}
            </p>
          </div>
        ) : (
          <div className="admin-users-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Active</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const agentId = agent.id || agent._id;
                  return (
                    <tr key={agentId}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25em",
                          }}
                        >
                          <strong>{agent.name}</strong>
                          <small style={{ color: "#999", fontSize: "0.8rem" }}>
                            {agentId}
                          </small>
                        </div>
                      </td>
                      <td>{agent.username}</td>
                      <td>{agent.email}</td>
                      <td>{agent.phone || "—"}</td>
                      <td>{getStatusBadge(agent.status, agent.isActive)}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            agent.isActive ? "active" : "inactive"
                          }`}
                        >
                          {agent.isActive ? "Yes" : "No"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>
                        {formatDate(agent.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Agent Modal */}
      {addAgentModalOpen && (
        <div className="scrape-modal-overlay" role="dialog" aria-modal="true">
          <div className="scrape-modal" style={{ maxWidth: "500px" }}>
            <AgentForm
              onSubmit={handleCreateAgent}
              onClose={() => {
                setAddAgentModalOpen(false);
                setAddAgentError("");
              }}
              loading={addAgentLoading}
              error={addAgentError}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentsPage;
