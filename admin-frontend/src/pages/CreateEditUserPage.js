// src/pages/CreateEditUserPage.js

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../api";
import Loader from "../components/Loader";
import UserForm from "../components/users/UserForm";
import "../styles/index.css";

function CreateEditUserPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { token, user: currentUser, activeTenant, setActiveTenant } = useAuth();
  const [loading, setLoading] = useState(!!userId); // Load if editing
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const isEditMode = !!userId;

  // Fetch user data if in edit mode
  useEffect(() => {
    if (!isEditMode || !token) {
      return;
    }

    const fetchUser = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const response = await apiRequest(`/users/${userId}`, {
          method: "GET",
          token,
        });
        setEditingUser(response.user);
      } catch (err) {
        setErrorMessage(err.message || "Failed to load user");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, isEditMode, token]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setSuccessMessage("");
      // Navigate back after showing success message
      navigate("/admin/users");
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [successMessage, navigate]);

  const handleCreateSubmit = async (values) => {
    setSubmitting(true);
    setErrorMessage("");
    try {
      const response = await apiRequest("/users", {
        method: "POST",
        token,
        data: {
          name: values.name.trim(),
          email: values.email.trim(),
          username: values.username.trim(),
          password: values.password,
          maxBots: values.maxBots,
          maxAgents: values.maxAgents || 0,
          apiKey: values.apiKey || undefined,
        },
      });

      setSuccessMessage("User created successfully");

      // Refetch the created user to get exact DB values
      if (response.user) {
        const newUserId = response.user.id || response.user._id;
        const freshUser = await apiRequest(`/users/${newUserId}`, {
          method: "GET",
          token,
        });
        setActiveTenant(freshUser.user);
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to create user");
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (values) => {
    if (!editingUser) {
      return;
    }

    const payload = {};
    if (values.name.trim() !== editingUser.name) {
      payload.name = values.name.trim();
    }
    if (values.email.trim() !== editingUser.email) {
      payload.email = values.email.trim();
    }
    if (values.username.trim() !== editingUser.username) {
      payload.username = values.username.trim();
    }
    if (values.password) {
      payload.password = values.password;
    }
    // Include maxBots if changed
    if (values.maxBots !== editingUser.maxBots) {
      payload.maxBots = values.maxBots;
    }
    // Include maxAgents if changed
    if (values.maxAgents !== editingUser.maxAgents) {
      payload.maxAgents = values.maxAgents;
    }
    // Include apiKey if changed
    if (values.apiKey !== editingUser.apiKey) {
      payload.apiKey = values.apiKey;
    }
    if (Object.keys(payload).length === 0) {
      setErrorMessage("No changes detected to update.");
      setSubmitting(false);
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      const activeTenantId = activeTenant
        ? activeTenant.id || activeTenant._id
        : null;
      const response = await apiRequest(
        `/users/${editingUser.id || editingUser._id}`,
        {
          method: "PUT",
          token,
          data: payload,
        }
      );
      setSuccessMessage("User updated successfully");
      if (
        activeTenantId &&
        (editingUser.id || editingUser._id) === activeTenantId &&
        response.user
      ) {
        setActiveTenant(response.user);
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to update user");
      setSubmitting(false);
    }
  };

  const handleFormSubmit = (values) => {
    if (isEditMode) {
      handleEditSubmit(values);
    } else {
      handleCreateSubmit(values);
    }
  };

  const handleCancel = () => {
    navigate("/admin/users");
  };

  if (!token || !currentUser) {
    return <Loader message="Validating session..." />;
  }

  if (loading) {
    return <Loader message="Loading user..." />;
  }

  return (
    <div className="admin-users-container">
      <header className="admin-users-header">
        <div className="admin-users-header-content">
          <div className="admin-users-header-title">
            <h2 style={{ marginRight: "10px" }}>
              {isEditMode ? "Edit User" : "Create New User"}
            </h2>
            <p>
              {isEditMode
                ? "Update user account information and settings."
                : "Create a new tenant account for the RAG platform."}
            </p>
          </div>
          <div className="admin-users-header-controls">
            <div className="admin-users-header-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={handleCancel}
              >
                Cancel
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
        <UserForm
          mode={isEditMode ? "edit" : "create"}
          initialValues={editingUser}
          loading={submitting}
          onSubmit={handleFormSubmit}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}

export default CreateEditUserPage;
