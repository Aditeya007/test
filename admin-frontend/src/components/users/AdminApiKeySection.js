// src/components/users/AdminApiKeySection.js

import React, { useState } from "react";
import { apiRequest } from "../../api";

function AdminApiKeySection({ currentUser, token, onApiKeySaved }) {
    const [apiKey, setApiKey] = useState(currentUser?.apiKey || "");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    const handleSaveApiKey = async () => {
        setSaving(true);
        setMessage("");

        try {
            await apiRequest("/user/me", {
                method: "PUT",
                token,
                data: { apiKey: apiKey.trim() || null },
            });

            setMessage("✅ API Key saved successfully!");
            if (onApiKeySaved) {
                onApiKeySaved(apiKey);
            }

            setTimeout(() => setMessage(""), 3000);
        } catch (err) {
            setMessage(`❌ ${err.message || "Failed to save API key"}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="api-key-section">
            <div className="api-key-form-group">
                <label htmlFor="admin-api-key" className="api-key-label">
                    <span className="api-key-icon">🔑</span>
                    <span>Gemini API Key</span>
                </label>
                <div className="api-key-input-wrapper">
                    <input
                        id="admin-api-key"
                        type="text"
                        placeholder="Enter your Gemini API key (e.g., AIzaSy...)"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        disabled={saving}
                        className="api-key-input"
                    />
                    <div className="api-key-actions">
                        <button
                            type="button"
                            onClick={handleSaveApiKey}
                            disabled={saving || !apiKey.trim()}
                            className="api-key-save-btn"
                        >
                            {saving ? (
                                <>
                                    <span className="spinner"></span>
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <>
                                    <span>💾</span>
                                    <span>Save</span>
                                </>
                            )}
                        </button>
                        <a
                            href="https://makersuite.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="api-key-link"
                        >
                            Get API Key →
                        </a>
                    </div>
                </div>
                <div className="api-key-info">
                    <span className="info-icon">ℹ️</span>
                    <span>This API key will be used by all your users and chatbots</span>
                </div>
            </div>

            {message && (
                <div className={`api-key-message ${message.startsWith("✅") ? "success" : "error"}`}>
                    {message}
                </div>
            )}
        </div>
    );
}

export default AdminApiKeySection;
