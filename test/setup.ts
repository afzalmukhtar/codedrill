/**
 * Vitest global setup. Runs before every test file.
 */
import { vi } from "vitest";

vi.mock("vscode", async () => {
  return await import("./__mocks__/vscode");
});
