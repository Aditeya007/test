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
        <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
                <label
                    htmlFor="admin-api-key"
                    style={{
                        fontWeight: "600",
                        fontSize: "0.95em",
                        minWidth: "max-content"
                    }}
                >
                    🔑 Your Gemini API Key:
                </label>
                <input
                    id="admin-api-key"
                    type="text"
                    placeholder="AIzaSy... (Required for chatbots to work)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={saving}
                    style={{
                        fontFamily: "monospace",
                        fontSize: "0.85em",
                        flex: "1",
                        minWidth: "300px",
                        maxWidth: "500px",
                        padding: "0.6em",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                    }}
                />
                <button
                    type="button"
                    onClick={handleSaveApiKey}
                    disabled={saving}
                    style={{
                        padding: "0.6em 1.2em",
                        whiteSpace: "nowrap",
                        backgroundColor: "#4CAF50",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: saving ? "not-allowed" : "pointer",
                        fontWeight: "600",
                    }}
                >
                    {saving ? "⏳ Saving..." : "💾 Save Key"}
                </button>
                <a
                    href="https://makersuite.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: "#0066cc",
                        fontSize: "0.9em",
                        whiteSpace: "nowrap",
                        textDecoration: "none",
                    }}
                >
                    Get API Key →
                </a>
            </div>
            {message && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.9em" }}>
                    {message}
                </div>
            )}
            <div style={{ marginTop: "0.5rem", fontSize: "0.85em", color: "#666" }}>
                ℹ️ This API key will be used by all your users and chatbots
            </div>
        </div>
    );
}

export default AdminApiKeySection;
