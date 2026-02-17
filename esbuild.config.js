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

function copySqlWasm() {
  const src = path.join(__dirname, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  const dest = path.join(__dirname, "dist", "sql-wasm.wasm");
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log("[esbuild] Copied sql-wasm.wasm to dist/");
  } else {
    console.warn("[esbuild] sql-wasm.wasm not found in node_modules/sql.js/dist/");
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
    copySqlWasm();
    console.log("[watch] Watching for changes...");
  } else {
    for (const config of configs) {
      await esbuild.build(config);
    }
    copySqlWasm();
    console.log("[esbuild] Build complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
