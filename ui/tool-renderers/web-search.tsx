import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";

const WEB_SEARCH_MAX_RESULTS = 5;

export const webSearchRenderer: ToolContentRenderer = {
  async prepare() {
    return {};
  },

  render(props) {
    const { success, output, error, metadata } = props;

    if (!success) {
      return (
        <Box flexDirection="column">
          <Text {...theme.error}>{error ?? output}</Text>
        </Box>
      );
    }

    const resultCount =
      typeof metadata.results === "number" ? metadata.results : null;

    if (resultCount === 0) {
      return (
        <Box flexDirection="column">
          <Text {...theme.muted}>(no results found)</Text>
        </Box>
      );
    }

    const blocks = output
      .split(/\n(?=\d+\. Title:)/)
      .filter((b) => b.match(/^\d+\. Title:/));

    const visible = blocks.slice(0, WEB_SEARCH_MAX_RESULTS);
    const clipped = blocks.length > WEB_SEARCH_MAX_RESULTS;

    return (
      <Box flexDirection="column">
        {resultCount !== null && (
          <Text {...theme.muted}>
            {resultCount} result{resultCount !== 1 ? "s" : ""}
          </Text>
        )}
        {visible.map((block, i) => {
          const titleMatch = block.match(/^\d+\. Title: (.+)/m);
          const urlMatch = block.match(/URL: (.+)/m);
          const snippetMatch = block.match(/Snippet: ([\s\S]+?)(?:\n\s*\n|$)/m);
          const title = titleMatch?.[1]?.trim() ?? "";
          const url = urlMatch?.[1]?.trim() ?? "";
          const snippet = snippetMatch?.[1]?.trim() ?? "";
          const snippetShort =
            snippet.length > 120 ? snippet.slice(0, 120) + "…" : snippet;
          return (
            <Box key={i} flexDirection="column" marginTop={1}>
              <Text {...theme.highlight} wrap="truncate">
                {title}
              </Text>
              <Text {...theme.muted} wrap="truncate">
                {url}
              </Text>
              {snippetShort && (
                <Text {...theme.code} wrap="wrap">
                  {snippetShort}
                </Text>
              )}
            </Box>
          );
        })}
        {clipped && (
          <Box marginTop={1}>
            <Text {...theme.muted}>
              … ({blocks.length - WEB_SEARCH_MAX_RESULTS} more)
            </Text>
          </Box>
        )}
      </Box>
    );
  },
};
