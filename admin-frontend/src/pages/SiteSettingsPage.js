// src/pages/SiteSettingsPage.js

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/Loader";
import { apiRequest } from "../api";
import "../styles/index.css";

function SiteSettingsPage() {
  const navigate = useNavigate();
  const { token, user: currentUser } = useAuth();
  const [apiKey, setApiKey] = useState(currentUser?.apiKey || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (!token || !currentUser) {
    return <Loader message="Validating session..." />;
  }

  const handleClose = () => {
    navigate(-1); // Go back to previous page
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage("");

    try {
      await apiRequest("/user/me", {
        method: "PUT",
        token,
        data: { apiKey: apiKey.trim() || null },
      });

      setMessage("✅ Settings updated successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(`❌ ${err.message || "Failed to update settings"}`);
    } finally {
      setSaving(false);
    }
  };

  const errorMessage = message.startsWith("❌")
    ? message.replace("❌ ", "")
    : "";
  const successMessage = message.startsWith("✅")
    ? message.replace("✅ ", "")
    : "";

  return (
    <div className="admin-users-container">
      <header className="admin-users-header">
        <div className="admin-users-header-content">
          <div className="admin-users-header-title">
            <h2>Site Settings</h2>
          </div>
          <div className="admin-users-header-controls">
            <div className="admin-users-header-actions">
              <button type="button" className="btn-ghost" onClick={handleClose}>
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

      <form
        className="admin-user-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveSettings();
        }}
      >
        <div className="user-form-row">
          <div style={{ gridColumn: "span 3" }}>
            <label htmlFor="gemini-api-key">Gemini API Key</label>
            <div
              style={{ display: "flex", gap: "0.75em", alignItems: "center" }}
            >
              <input
                id="gemini-api-key"
                type="text"
                placeholder="Enter your Gemini API key (e.g., AIzaSy...)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={saving}
                style={{ flex: 1 }}
              />
              <a
                href="https://makersuite.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#4a9eff",
                  fontSize: "0.9rem",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  padding: "0.5em 0",
                }}
                onMouseEnter={(e) =>
                  (e.target.style.textDecoration = "underline")
                }
                onMouseLeave={(e) => (e.target.style.textDecoration = "none")}
              >
                Get API Key →
              </a>
            </div>
            <small
              style={{ display: "block", marginTop: "0.3em", color: "#94a3b8" }}
            >
              This API key will be used by all your users and chatbots
            </small>
          </div>
        </div>

        {/* Placeholder for future settings - can be easily added here */}
        {/* Example:
        <div className="user-form-row">
          <div>
            <label htmlFor="setting-1">Setting 1</label>
            <input id="setting-1" type="text" />
          </div>
          <div>
            <label htmlFor="setting-2">Setting 2</label>
            <input id="setting-2" type="text" />
          </div>
          <div>
            <label htmlFor="setting-3">Setting 3</label>
            <input id="setting-3" type="text" />
          </div>
        </div>
        */}

        <div className="user-form-actions">
          <button
            type="submit"
            className="auth-btn"
            disabled={saving}
            style={{ width: "auto", minWidth: "150px", padding: "0.85em 2em" }}
          >
            {saving ? "⏳ Updating..." : "💾 Update Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SiteSettingsPage;
