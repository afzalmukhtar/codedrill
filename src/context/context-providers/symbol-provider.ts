/**
 * Symbol Context Provider
 *
 * Resolves function/class symbols from the workspace using
 * VSCode's language services for @symbol mentions.
 */

import * as vscode from "vscode";
import type { ContextAttachment } from "../../ai/providers/types";

const WINDOW_LINES = 15;

function symbolKindToString(kind: vscode.SymbolKind): string {
  const names: Record<number, string> = {
    [vscode.SymbolKind.File]: "File",
    [vscode.SymbolKind.Module]: "Module",
    [vscode.SymbolKind.Namespace]: "Namespace",
    [vscode.SymbolKind.Package]: "Package",
    [vscode.SymbolKind.Class]: "Class",
    [vscode.SymbolKind.Method]: "Method",
    [vscode.SymbolKind.Property]: "Property",
    [vscode.SymbolKind.Field]: "Field",
    [vscode.SymbolKind.Constructor]: "Constructor",
    [vscode.SymbolKind.Enum]: "Enum",
    [vscode.SymbolKind.Interface]: "Interface",
    [vscode.SymbolKind.Function]: "Function",
    [vscode.SymbolKind.Variable]: "Variable",
    [vscode.SymbolKind.Constant]: "Constant",
    [vscode.SymbolKind.String]: "String",
    [vscode.SymbolKind.Number]: "Number",
    [vscode.SymbolKind.Boolean]: "Boolean",
    [vscode.SymbolKind.Array]: "Array",
    [vscode.SymbolKind.Object]: "Object",
    [vscode.SymbolKind.Key]: "Key",
    [vscode.SymbolKind.Null]: "Null",
    [vscode.SymbolKind.EnumMember]: "EnumMember",
    [vscode.SymbolKind.Struct]: "Struct",
    [vscode.SymbolKind.Event]: "Event",
    [vscode.SymbolKind.Operator]: "Operator",
    [vscode.SymbolKind.TypeParameter]: "TypeParameter",
  };
  return names[kind] ?? "Symbol";
}

export class SymbolContextProvider {
  /**
   * Resolve a symbol by name and return a ContextAttachment with
   * the code window around its definition.
   */
  async resolve(symbolName: string): Promise<ContextAttachment | null> {
    const symbols = (await vscode.commands.executeCommand<
      vscode.SymbolInformation[]
    >("vscode.executeWorkspaceSymbolProvider", symbolName)) ?? [];

    const match = symbols.find(
      (s) => s.name.toLowerCase() === symbolName.toLowerCase()
    );
    if (!match?.location) return null;

    const { uri, range } = match.location;
    const doc = await vscode.workspace.openTextDocument(uri);
    const lines = doc.getText().split("\n");
    const lineCount = lines.length;

    const startLine = Math.max(0, range.start.line - WINDOW_LINES);
    const endLine = Math.min(lineCount - 1, range.end.line + WINDOW_LINES);
    const window = lines.slice(startLine, endLine + 1).join("\n");

    const content = `// ${match.name} (${symbolKindToString(match.kind)}) in ${uri.fsPath}\n\n${window}`;
    const tokenEstimate = Math.ceil(content.length / 4);

    return {
      type: "symbol",
      label: match.name,
      content,
      tokenEstimate,
      metadata: {
        filePath: uri.fsPath,
        lineRange: { start: startLine + 1, end: endLine + 1 },
        symbolName: match.name,
      },
    };
  }

  /**
   * Search for symbols matching a query. Returns simplified results
   * for suggestion/autocomplete UI.
   */
  async searchSymbols(
    query: string
  ): Promise<Array<{ name: string; kind: string; location: string }>> {
    const symbols = (await vscode.commands.executeCommand<
      vscode.SymbolInformation[]
    >("vscode.executeWorkspaceSymbolProvider", query)) ?? [];

    return symbols.slice(0, 50).map((s) => ({
      name: s.name,
      kind: symbolKindToString(s.kind),
      location: s.location.uri.fsPath,
    }));
  }
}
