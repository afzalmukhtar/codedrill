const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");
const isWebview = process.argv.includes("--webview");

/**
 * esbuild plugin that logs build lifecycle messages so the
 * VS Code / Cursor background problem matcher knows when the
 * build starts and finishes.
 */
const watchLogPlugin = {
  name: "watch-log",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.log("[watch] build finished with errors");
      } else {
        console.log("[watch] build finished");
      }
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: !isProduction,
  minify: isProduction,
  define: {
    "process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
  },
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ["webview/src/index.tsx"],
  bundle: true,
  outdir: "dist",
  entryNames: "webview",
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: !isProduction,
  minify: isProduction,
  define: {
    "process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
  },
  loader: {
    ".svg": "dataurl",
  },
};

function copyRuntimeAssets() {
  const dist = path.join(__dirname, "dist");
  fs.mkdirSync(dist, { recursive: true });

  // sql-wasm.wasm
  const wasmSrc = path.join(__dirname, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  if (fs.existsSync(wasmSrc)) {
    fs.copyFileSync(wasmSrc, path.join(dist, "sql-wasm.wasm"));
    console.log("[esbuild] Copied sql-wasm.wasm");
  } else {
    console.warn("[esbuild] sql-wasm.wasm not found in node_modules/sql.js/dist/");
  }

  // schema.sql
  const schemaSrc = path.join(__dirname, "src", "db", "schema.sql");
  if (fs.existsSync(schemaSrc)) {
    fs.copyFileSync(schemaSrc, path.join(dist, "schema.sql"));
    console.log("[esbuild] Copied schema.sql");
  }

  // Problem list JSON files
  const listsDir = path.join(__dirname, "src", "leetcode", "lists");
  const distLists = path.join(dist, "lists");
  fs.mkdirSync(distLists, { recursive: true });
  if (fs.existsSync(listsDir)) {
    for (const file of fs.readdirSync(listsDir)) {
      if (file.endsWith(".json")) {
        fs.copyFileSync(path.join(listsDir, file), path.join(distLists, file));
      }
    }
    console.log("[esbuild] Copied problem list JSON files");
  }

  // Persona prompt templates
  const promptsDir = path.join(__dirname, "src", "ai", "personas", "prompts");
  const distPrompts = path.join(dist, "prompts");
  fs.mkdirSync(distPrompts, { recursive: true });
  if (fs.existsSync(promptsDir)) {
    for (const file of fs.readdirSync(promptsDir)) {
      if (file.endsWith(".md")) {
        fs.copyFileSync(path.join(promptsDir, file), path.join(distPrompts, file));
      }
    }
    console.log("[esbuild] Copied persona prompt templates");
  }
}

async function main() {
  const configs = isWebview ? [webviewConfig] : [extensionConfig, webviewConfig];

  if (isWatch) {
    for (const config of configs) {
      config.plugins = [...(config.plugins || []), watchLogPlugin];
      const ctx = await esbuild.context(config);
      await ctx.watch();
    }
    copyRuntimeAssets();
    console.log("[watch] Watching for changes...");
  } else {
    for (const config of configs) {
      await esbuild.build(config);
    }
    copyRuntimeAssets();
    console.log("[esbuild] Build complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
