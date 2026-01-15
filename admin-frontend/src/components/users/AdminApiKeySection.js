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
        <div style={{
            marginBottom: "1.5rem",
            padding: "1rem 1.2rem",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap"
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flex: "1", minWidth: "400px" }}>
                <label
                    htmlFor="admin-api-key"
                    style={{
                        fontWeight: "600",
                        fontSize: "0.9em",
                        color: "#fff",
                        minWidth: "max-content",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem"
                    }}
                >
                    <span style={{ fontSize: "1.2em" }}>🔑</span>
                    Gemini API Key:
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
                        padding: "0.65em 0.9em",
                        backgroundColor: "rgba(0, 0, 0, 0.3)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: "6px",
                        color: "#fff",
                        outline: "none",
                        transition: "all 0.2s ease"
                    }}
                    onFocus={(e) => {
                        e.target.style.border = "1px solid rgba(255, 255, 255, 0.3)";
                        e.target.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
                    }}
                    onBlur={(e) => {
                        e.target.style.border = "1px solid rgba(255, 255, 255, 0.15)";
                        e.target.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
                    }}
                />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                <button
                    type="button"
                    onClick={handleSaveApiKey}
                    disabled={saving}
                    className="auth-btn"
                    style={{
                        padding: "0.65em 1.3em",
                        whiteSpace: "nowrap",
                        fontSize: "0.9em"
                    }}
                >
                    {saving ? "⏳ Saving..." : "💾 Save Key"}
                </button>
                <a
                    href="https://makersuite.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: "#4a9eff",
                        fontSize: "0.85em",
                        whiteSpace: "nowrap",
                        textDecoration: "none",
                        transition: "color 0.2s ease"
                    }}
                    onMouseEnter={(e) => e.target.style.color = "#6bb3ff"}
                    onMouseLeave={(e) => e.target.style.color = "#4a9eff"}
                >
                    Get API Key →
                </a>
            </div>

            {message && (
                <div style={{
                    width: "100%",
                    fontSize: "0.85em",
                    padding: "0.5em",
                    borderRadius: "4px",
                    backgroundColor: message.startsWith("✅") ? "rgba(76, 175, 80, 0.15)" : "rgba(244, 67, 54, 0.15)",
                    color: message.startsWith("✅") ? "#81c784" : "#e57373",
                    border: `1px solid ${message.startsWith("✅") ? "rgba(76, 175, 80, 0.3)" : "rgba(244, 67, 54, 0.3)"}`
                }}>
                    {message}
                </div>
            )}

            <div style={{
                width: "100%",
                fontSize: "0.8em",
                color: "rgba(255, 255, 255, 0.5)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem"
            }}>
                <span>ℹ️</span>
                <span>This API key will be used by all your users and chatbots</span>
            </div>
        </div>
    );
}

export default AdminApiKeySection;
