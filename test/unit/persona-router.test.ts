import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { PersonaRouter, type SessionState } from "../../src/ai/personas/persona-router";

const INTERVIEWER_PROMPT = "INTERVIEWER_SYSTEM_PROMPT";
const TEACHER_PROMPT = "TEACHER_SYSTEM_PROMPT";

vi.mock("../../src/ai/personas/interviewer", () => ({
  InterviewerPersona: vi.fn().mockImplementation(() => ({
    buildSystemPrompt: vi.fn().mockResolvedValue(INTERVIEWER_PROMPT),
  })),
}));

vi.mock("../../src/ai/personas/teacher", () => ({
  TeacherPersona: vi.fn().mockImplementation(() => ({
    buildSystemPrompt: vi.fn().mockResolvedValue(TEACHER_PROMPT),
  })),
}));

describe("PersonaRouter", () => {
  let router: PersonaRouter;
  let extensionUri: vscode.Uri;

  beforeEach(() => {
    extensionUri = vscode.Uri.file("/mock/extension");
    router = new PersonaRouter(extensionUri);
  });

  it("timer running -> always returns interviewer prompt (hard override), even if user selects teach", async () => {
    const sessionState: SessionState = {
      isActive: true,
      timerRunning: true,
      gaveUp: false,
    };
    const prompt = await router.getPromptForMode("teach", {}, sessionState);
    expect(prompt).toBe(INTERVIEWER_PROMPT);
  });

  it("gaveUp -> always returns teacher prompt (hard override), even if user selects interview", async () => {
    const sessionState: SessionState = {
      isActive: true,
      timerRunning: false,
      gaveUp: true,
    };
    const prompt = await router.getPromptForMode("interview", {}, sessionState);
    expect(prompt).toBe(TEACHER_PROMPT);
  });

  it("gaveUp takes precedence over timerRunning (gaveUp=true, timerRunning=true -> teacher)", async () => {
    const sessionState: SessionState = {
      isActive: true,
      timerRunning: true,
      gaveUp: true,
    };
    const prompt = await router.getPromptForMode("interview", {}, sessionState);
    expect(prompt).toBe(TEACHER_PROMPT);
  });

  it("no session state + mode=teach -> teacher", async () => {
    const prompt = await router.getPromptForMode("teach", {});
    expect(prompt).toBe(TEACHER_PROMPT);
  });

  it("no session state + mode=interview -> interviewer", async () => {
    const prompt = await router.getPromptForMode("interview", {});
    expect(prompt).toBe(INTERVIEWER_PROMPT);
  });

  it("unknown mode defaults to interviewer", async () => {
    const prompt = await router.getPromptForMode("unknown-mode", {});
    expect(prompt).toBe(INTERVIEWER_PROMPT);
  });
});
