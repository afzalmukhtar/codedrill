import React, { useEffect, useState, useCallback } from "react";
import { useVscode } from "../App";
import { IconClose } from "./Icons";

interface ResumeProfile {
  seniorityLevel: string;
  experienceYears: number;
  primaryRole: string;
  techStack: string[];
  domains: string[];
}

type ProgressStep = "idle" | "analyzing" | "profile" | "generating" | "done" | "error";

interface ProfilePanelProps {
  onClose: () => void;
}

export function ProfilePanel({ onClose }: ProfilePanelProps) {
  const { postMessage } = useVscode();
  const [resumeText, setResumeText] = useState("");
  const [step, setStep] = useState<ProgressStep>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [topicCount, setTopicCount] = useState<number | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "resumeProgress") {
        setStep(msg.step as ProgressStep);
        setStatusMessage(msg.message ?? "");
      } else if (msg.type === "resumeProcessed") {
        setStep("done");
        setTopicCount(msg.topicCount ?? 0);
        if (msg.profile) {
          setProfile(msg.profile as ResumeProfile);
        }
        setStatusMessage("");
      } else if (msg.type === "resumeProfile") {
        if (msg.profile) {
          setProfile(msg.profile as ResumeProfile);
        }
      }
    };
    window.addEventListener("message", handler);
    postMessage({ type: "getResumeProfile" });
    return () => window.removeEventListener("message", handler);
  }, [postMessage]);

  const handleAnalyze = useCallback(() => {
    if (!resumeText.trim()) return;
    setStep("analyzing");
    setStatusMessage("Starting analysis...");
    setTopicCount(null);
    postMessage({ type: "submitResume", text: resumeText });
  }, [resumeText, postMessage]);

  const isProcessing = step === "analyzing" || step === "profile" || step === "generating";

  return (
    <div className="profile-panel">
      <div className="profile-panel-header">
        <span className="profile-panel-title">Profile</span>
        <button type="button" className="profile-panel-close" onClick={onClose} title="Close"><IconClose size={14} /></button>
      </div>

      <div className="profile-panel-section">
        <label className="profile-panel-label" htmlFor="resume-input">
          Paste your resume
        </label>
        <textarea
          id="resume-input"
          className="profile-panel-textarea"
          placeholder="Paste your full resume text here..."
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          disabled={isProcessing}
          rows={8}
        />
        <button
          type="button"
          className="profile-panel-analyze-btn"
          onClick={handleAnalyze}
          disabled={isProcessing || !resumeText.trim()}
        >
          {isProcessing ? "Analyzing..." : "Analyze Resume"}
        </button>
      </div>

      <div className="profile-panel-section">
        <label className="profile-panel-label" htmlFor="lang-select">
          Preferred language
        </label>
        <select
          id="lang-select"
          className="profile-panel-select"
          defaultValue="python3"
          aria-label="Select preferred programming language"
        >
          <option value="python3">Python 3</option>
          <option value="javascript" disabled>JavaScript (coming soon)</option>
          <option value="java" disabled>Java (coming soon)</option>
          <option value="cpp" disabled>C++ (coming soon)</option>
          <option value="go" disabled>Go (coming soon)</option>
        </select>
      </div>

      {isProcessing && (
        <div className="profile-panel-progress">
          <div className="profile-panel-progress-bar">
            <div
              className="profile-panel-progress-fill"
              style={{
                width: step === "analyzing" ? "33%" : step === "profile" ? "66%" : "90%",
              }}
            />
          </div>
          <span className="profile-panel-progress-text">{statusMessage}</span>
        </div>
      )}

      {step === "error" && (
        <div className="profile-panel-error">{statusMessage}</div>
      )}

      {step === "done" && topicCount !== null && (
        <div className="profile-panel-success">
          Generated {topicCount} system design topic{topicCount !== 1 ? "s" : ""} tailored to your background.
          Check the <strong>Problems &rarr; System Design</strong> tab to see them.
        </div>
      )}

      {profile && (
        <div className="profile-panel-info">
          <div className="profile-panel-section-title">Your Profile</div>
          <div className="profile-panel-row">
            <span className="profile-panel-row-label">Seniority</span>
            <span className="profile-panel-row-value profile-panel-badge">
              {profile.seniorityLevel} (~{profile.experienceYears}y)
            </span>
          </div>
          <div className="profile-panel-row">
            <span className="profile-panel-row-label">Role</span>
            <span className="profile-panel-row-value">{profile.primaryRole}</span>
          </div>
          {profile.techStack.length > 0 && (
            <div className="profile-panel-chips-section">
              <span className="profile-panel-chips-label">Tech Stack</span>
              <div className="profile-panel-chips">
                {profile.techStack.map((t) => (
                  <span key={t} className="profile-panel-chip">{t}</span>
                ))}
              </div>
            </div>
          )}
          {profile.domains.length > 0 && (
            <div className="profile-panel-chips-section">
              <span className="profile-panel-chips-label">Domains</span>
              <div className="profile-panel-chips">
                {profile.domains.map((d) => (
                  <span key={d} className="profile-panel-chip profile-panel-chip--domain">{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
