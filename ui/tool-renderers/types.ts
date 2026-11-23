import React from "react";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";

/**
 * Contract every tool renderer must satisfy.
 *
 * - `prepare()` handles async work (e.g. syntax highlighting) before rendering.
 *   Returns an opaque bag of extra data passed straight to `render()`.
 * - `render()` returns the React node shown inside the tool panel.
 */
export interface ToolContentRenderer {
  prepare(props: ToolCallCompletePanelProps): Promise<Record<string, unknown>>;
  render(
    props: ToolCallCompletePanelProps,
    prepared: Record<string, unknown>,
  ): React.ReactNode;
}
