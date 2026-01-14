// src/pages/AdminUsersPage.js

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../api";
import Loader from "../components/Loader";
import UserTable from "../components/users/UserTable";
import Pagination from "../components/Pagination";
import "../styles/index.css";

function AdminUsersPage() {
  const navigate = useNavigate();
  const { token, user: currentUser, activeTenant, setActiveTenant } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(10);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState(""); // For debounced input

  const activeTenantId = activeTenant
    ? activeTenant.id || activeTenant._id
    : null;

  const fetchUsers = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const params = {
        page: currentPage,
        limit: limit,
      };

      // Add search parameter if search query exists
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const response = await apiRequest("/users", {
        method: "GET",
        token,
        params,
      });

      // Backend pagination - only current page data is returned
      setUsers(response.users || []);
      setTotalCount(response.totalCount || 0);
      setTotalPages(response.totalPages || 1);

      console.log("📄 Pagination response:", {
        page: response.page,
        limit: response.limit,
        search: searchQuery,
        totalCount: response.totalCount,
        totalPages: response.totalPages,
        usersReceived: response.users?.length || 0,
      });
    } catch (err) {
      setErrorMessage(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [token, currentPage, limit, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounce search input - reset to page 1 when search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1); // Reset to first page when search changes
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }
    const timeout = window.setTimeout(() => setSuccessMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const handleRefresh = useCallback(async () => {
    await fetchUsers();
  }, [fetchUsers]);

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleDeleteUser = async (userToDelete) => {
    if (!userToDelete) {
      return;
    }

    const message = `Delete user \"${userToDelete.username}\"? This cannot be undone.`;
    if (!window.confirm(message)) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      await apiRequest(`/users/${userToDelete.id || userToDelete._id}`, {
        method: "DELETE",
        token,
      });
      setSuccessMessage("User deleted successfully");
      if (activeTenantId === (userToDelete.id || userToDelete._id)) {
        setActiveTenant(null);
      }
      // If we're on a page with no items after deletion, go to previous page
      if (users.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
        // fetchUsers will be called automatically via useEffect when currentPage changes
      } else {
        await handleRefresh();
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to delete user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectActive = (userRow) => {
    setActiveTenant(userRow);
    setSuccessMessage(`Selected ${userRow.username} as the active user.`);
  };

  const handleViewAgents = (userRow) => {
    const userId = userRow.id || userRow._id;
    navigate(`/agents/${userId}`);
  };

  if (!token || !currentUser) {
    return <Loader message="Validating session..." />;
  }

  return (
    <div className="admin-users-container">
      <header className="admin-users-header">
        <div className="admin-users-header-content">
          <div className="admin-users-header-title">
            <h2 style={{ marginRight: "10px" }}>User Management</h2>
            <p>Provision and manage tenant accounts for the RAG platform.</p>
          </div>
          <div className="admin-users-header-controls">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search by name, username, or email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="search-input"
              />
              <span className="search-icon">🔍</span>
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className="search-clear-btn"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <div className="admin-users-header-actions">
              <button
                type="button"
                className="auth-btn"
                onClick={() => navigate("/admin/users/new")}
                style={{ padding: "0.6em 1.2em" }}
              >
                ✨ Create User
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={handleRefresh}
                disabled={loading}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {errorMessage && <div className="admin-users-error">{errorMessage}</div>}
      {successMessage && (
        <div className="admin-users-success">{successMessage}</div>
      )}

      <div style={{ marginTop: "2rem" }}>
        {loading ? (
          <Loader message="Loading users..." />
        ) : (
          <>
            <UserTable
              users={users}
              onDelete={handleDeleteUser}
              onSelect={handleSelectActive}
              onViewAgents={handleViewAgents}
              activeTenantId={activeTenantId}
            />
            {totalCount > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                totalCount={totalCount}
                limit={limit}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminUsersPage;
