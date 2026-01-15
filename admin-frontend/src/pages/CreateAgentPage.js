// src/pages/CreateAgentPage.js

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../api";
import Loader from "../components/Loader";
import "../styles/index.css";

function CreateAgentPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    phone: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear field error when user types
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
    // Clear general error message
    if (errorMessage) {
      setErrorMessage("");
    }
  };

  const validate = () => {
    const errors = {};

    if (!formData.username.trim()) {
      errors.username = "Username is required";
    } else if (formData.username.trim().length < 3) {
      errors.username = "Username must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username.trim())) {
      errors.username =
        "Username can only contain letters, numbers, and underscores";
    }

    if (!formData.password.trim()) {
      errors.password = "Password is required";
    } else if (formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Enter a valid email address";
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await apiRequest("/agent/create", {
        method: "POST",
        token,
        data: formData,
      });

      setSuccessMessage("Agent created successfully!");

      // Navigate back to agents page after 1.5 seconds
      setTimeout(() => {
        navigate("/agents");
      }, 1500);
    } catch (err) {
      setErrorMessage(err.message || "Failed to create agent");
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate("/agents");
  };

  return (
    <div className="admin-users-container">
      <header className="admin-users-header">
        <div className="admin-users-header-content">
          <div className="admin-users-header-title">
            <h2 style={{ marginRight: "10px" }}>➕ Add New Agent</h2>
            {/* <p>Create a new human agent account for your chatbot system.</p> */}
          </div>
          <div className="admin-users-header-controls">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      </header>

      {errorMessage && <div className="admin-users-error">{errorMessage}</div>}
      {successMessage && (
        <div className="admin-users-success">{successMessage}</div>
      )}

      <div style={{ marginTop: "2rem" }}>
        <form className="admin-user-form" onSubmit={handleSubmit}>
          <div className="user-form-row">
            <div>
              <label htmlFor="agent-username">Username</label>
              <input
                id="agent-username"
                name="username"
                type="text"
                placeholder="agent_username"
                value={formData.username}
                onChange={handleChange}
                disabled={loading}
                className={fieldErrors.username ? "input-error" : ""}
              />
              {fieldErrors.username && (
                <span className="field-error">{fieldErrors.username}</span>
              )}
            </div>

            <div>
              <label htmlFor="agent-password">Password</label>
              <input
                id="agent-password"
                name="password"
                type="password"
                placeholder="Minimum 6 characters"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                className={fieldErrors.password ? "input-error" : ""}
              />
              {fieldErrors.password && (
                <span className="field-error">{fieldErrors.password}</span>
              )}
            </div>

            <div>
              <label htmlFor="agent-name">Full Name</label>
              <input
                id="agent-name"
                name="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
                disabled={loading}
                className={fieldErrors.name ? "input-error" : ""}
              />
              {fieldErrors.name && (
                <span className="field-error">{fieldErrors.name}</span>
              )}
            </div>
          </div>

          <div className="user-form-row">
            <div>
              <label htmlFor="agent-email">Email</label>
              <input
                id="agent-email"
                name="email"
                type="email"
                placeholder="agent@example.com"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                className={fieldErrors.email ? "input-error" : ""}
              />
              {fieldErrors.email && (
                <span className="field-error">{fieldErrors.email}</span>
              )}
            </div>

            <div>
              <label htmlFor="agent-phone">Phone</label>
              <input
                id="agent-phone"
                name="phone"
                type="tel"
                placeholder="+1234567890"
                value={formData.phone}
                onChange={handleChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="user-form-actions">
            {/* <button
              type="button"
              className="auth-btn"
              onClick={handleCancel}
              disabled={loading}
              style={{
                width: "auto",
                minWidth: "150px",
                padding: "0.85em 2em",
              }}
            >
              Cancel
            </button> */}
            <button
              type="submit"
              className="auth-btn"
              disabled={loading}
              style={{
                width: "auto",
                minWidth: "150px",
                padding: "0.85em 2em",
              }}
            >
              {loading ? "⏳ Creating..." : "✨ Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateAgentPage;
