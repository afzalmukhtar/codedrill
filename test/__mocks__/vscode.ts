/**
 * Minimal vscode module mock for unit testing outside the extension host.
 * Only stubs the APIs actually used by the code under test.
 */

export const Uri = {
  joinPath: (base: { fsPath: string; toString: () => string }, ...segments: string[]) => {
    const joined = [base.fsPath, ...segments].join("/");
    return {
      fsPath: joined,
      toString: () => joined,
      scheme: "file",
      path: joined,
    };
  },
  file: (path: string) => ({
    fsPath: path,
    toString: () => path,
    scheme: "file",
    path,
  }),
};

export const workspace = {
  fs: {
    readFile: async (uri: { fsPath: string }) => {
      const fs = await import("fs");
      return new Uint8Array(fs.readFileSync(uri.fsPath));
    },
    writeFile: async (uri: { fsPath: string }, data: Uint8Array) => {
      const fs = await import("fs");
      const path = await import("path");
      fs.mkdirSync(path.dirname(uri.fsPath), { recursive: true });
      fs.writeFileSync(uri.fsPath, data);
    },
    createDirectory: async (uri: { fsPath: string }) => {
      const fs = await import("fs");
      fs.mkdirSync(uri.fsPath, { recursive: true });
    },
  },
  workspaceFolders: [],
};

export const window = {
  showInformationMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  withProgress: async (_opts: unknown, task: (progress: unknown) => Promise<unknown>) => {
    return task({ report: () => {} });
  },
  createOutputChannel: () => ({
    appendLine: () => {},
    append: () => {},
    show: () => {},
    dispose: () => {},
  }),
};

export enum ProgressLocation {
  Notification = 15,
  Window = 10,
  SourceControl = 1,
}

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(undefined),
};

export const EventEmitter = class {
  event = () => ({ dispose: () => {} });
  fire() {}
  dispose() {}
};
