import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQuery } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Textarea from "@cloudscape-design/components/textarea";
import { api } from "../api.js";
import { useEmbed } from "../embed.js";
import { Markdown } from "../components/Markdown.js";

const SUGGESTED_PROMPTS = [
  "Audit my cluster.",
  "Are my shards right-sized for my workload?",
  "What's eating CPU on the busiest node?",
  "We ingest 2 TB of logs per day with daily indices — is our setup correct?",
];

type UIPart =
  | { type: "text"; text: string }
  | { type: string; state: string; input?: unknown; output?: unknown };

type UIMsg = { id: string; role: string; parts?: unknown[] };

export function ChatPage() {
  const domainsQuery = useQuery({
    queryKey: ["domains"],
    queryFn: () => api.listDomains(),
  });
  const domains = domainsQuery.data?.domains ?? [];
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const { parentDomainArn } = useEmbed();
  useEffect(() => {
    if (!parentDomainArn) return;
    const match = domains.find((d) => d.arn === parentDomainArn);
    if (match) setSelectedDomainId(match.id);
  }, [parentDomainArn, domains]);
  const effectiveDomainId =
    selectedDomainId ?? (domains.length > 0 ? domains[0]!.id : null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, domainId: effectiveDomainId, messages },
        }),
      }),
    [effectiveDomainId],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });

  const [input, setInput] = useState("");
  const isStreaming = status === "submitted" || status === "streaming";

  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const domainOptions: SelectProps.Option[] = domains.map((d) => ({
    label: `${d.name} (${d.region})`,
    value: d.id,
  }));
  const selectedDomainOption =
    domainOptions.find((o) => o.value === effectiveDomainId) ?? null;

  const submit = (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || !effectiveDomainId) return;
    sendMessage({ text: message });
    setInput("");
  };

  // Split messages into: completed messages (render fully) + the in-progress
  // assistant message (show only tools + thinking indicator).
  const completedMessages = isStreaming ? messages.slice(0, -1) : messages;
  const streamingMessage = isStreaming ? messages[messages.length - 1] : null;

  // Extract tool names from the streaming message for the "thinking" indicator.
  const activeTools = useMemo(() => {
    if (!streamingMessage) return [];
    const parts = (streamingMessage.parts ?? []) as UIPart[];
    return parts
      .filter((p) => typeof p.type === "string" && p.type.startsWith("tool-"))
      .map((p) => {
        const name = p.type.replace(/^tool-/, "");
        return { name, state: (p as { state: string }).state };
      });
  }, [streamingMessage]);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Describe your workload — the agent will run targeted diagnostics and explain what it finds."
          actions={
            <Box>
              <Box variant="awsui-key-label">Domain</Box>
              <Select
                selectedOption={selectedDomainOption}
                options={domainOptions}
                placeholder={domains.length === 0 ? "No domains" : "Select"}
                onChange={(e) =>
                  setSelectedDomainId(e.detail.selectedOption.value ?? null)
                }
                disabled={domains.length === 0}
              />
            </Box>
          }
        >
          Workload chat
        </Header>
      }
    >
      <SpaceBetween size="m">
        {error && (
          <Alert type="error" header="Chat error">
            {error.message}
          </Alert>
        )}

        <Container>
          <SpaceBetween size="m">
            {messages.length === 0 && !isStreaming && (
              <Box padding={{ vertical: "xl" }}>
                <SpaceBetween size="l">
                  <Box textAlign="center" color="text-status-inactive">
                    <Box variant="h2" color="inherit">Ask anything about your cluster</Box>
                    <Box variant="p" color="text-body-secondary">
                      The agent has read-only access to cluster APIs and CloudWatch.
                      Try one of these to get started:
                    </Box>
                  </Box>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 12,
                  }}>
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => submit(p)}
                        disabled={!effectiveDomainId}
                        style={{
                          textAlign: "left",
                          padding: 16,
                          border: "1px solid #d5dbdb",
                          borderRadius: 8,
                          background: effectiveDomainId ? "#fff" : "#f4f4f4",
                          color: "#16191f",
                          cursor: effectiveDomainId ? "pointer" : "not-allowed",
                          fontSize: 13,
                          fontFamily: "inherit",
                          lineHeight: 1.5,
                          transition: "border-color 0.15s, background 0.15s",
                        }}
                        onMouseOver={(e) => {
                          if (effectiveDomainId) e.currentTarget.style.borderColor = "#0073bb";
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.borderColor = "#d5dbdb";
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </SpaceBetween>
              </Box>
            )}

            {/* Completed messages — fully formatted */}
            {completedMessages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}

            {/* In-progress assistant message — show thinking + tools only */}
            {isStreaming && (
              <div style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "16px 0",
                borderTop: completedMessages.length > 0 ? "1px solid #eaeded" : undefined,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16,
                  background: "#16191f", color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 600, flexShrink: 0,
                }} aria-hidden>A</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Box variant="strong">Agent</Box>
                  <SpaceBetween size="xs">
                    <Box padding={{ top: "xs" }}>
                      <SpaceBetween size="xs">
                        <StatusIndicator type="loading">
                          {activeTools.length > 0
                            ? `Analyzing cluster...`
                            : "Thinking..."}
                        </StatusIndicator>
                        {activeTools.length > 0 && (
                          <div style={{
                            display: "flex", flexWrap: "wrap", gap: 6,
                            marginTop: 4,
                          }}>
                            {activeTools.map((t, i) => (
                              <span key={i} style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "3px 10px",
                                background: t.state === "output-available" ? "#f0fdf4" : "#f0f5ff",
                                border: `1px solid ${t.state === "output-available" ? "#bbf7d0" : "#c7d6f8"}`,
                                borderRadius: 12, fontSize: 12, color: "#16191f",
                              }}>
                                {t.state === "output-available" ? "✓" : "⏳"} {t.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </SpaceBetween>
                    </Box>
                    <Button onClick={stop} variant="inline-link">Stop</Button>
                  </SpaceBetween>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </SpaceBetween>
        </Container>

        <Container>
          <SpaceBetween size="xs">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.detail.value)}
              onKeyDown={(e) => {
                if (e.detail.key === "Enter" && !e.detail.shiftKey && !isStreaming) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={
                effectiveDomainId
                  ? "Describe your workload, ask about cluster health, or paste an error to diagnose..."
                  : "Connect a domain first to start chatting."
              }
              disabled={!effectiveDomainId || isStreaming}
              rows={4}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box variant="small" color="text-body-secondary">
                Enter to send · Shift+Enter for newline
              </Box>
              <Button
                variant="primary"
                onClick={() => submit()}
                disabled={!effectiveDomainId || isStreaming || !input.trim()}
                iconAlign="right"
                iconName="angle-right"
              >
                Send
              </Button>
            </div>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}

function MessageBubble({ message }: { message: UIMsg }) {
  const isUser = message.role === "user";
  const parts = (message.parts ?? []) as UIPart[];

  // Collect all text parts into one block for cleaner rendering.
  const fullText = parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n\n");

  const toolParts = parts.filter(
    (p) => typeof p.type === "string" && p.type.startsWith("tool-"),
  ) as Array<{ type: string; state: string; input?: unknown; output?: unknown }>;

  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      padding: "16px 0",
      borderBottom: "1px solid #eaeded",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 16,
        background: isUser ? "#0073bb" : "#16191f",
        color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 600, flexShrink: 0,
      }} aria-hidden>
        {isUser ? "Y" : "A"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Box variant="strong" margin={{ bottom: "xs" }}>
          {isUser ? "You" : "Agent"}
        </Box>

        {isUser ? (
          <Box variant="p">{fullText}</Box>
        ) : (
          <SpaceBetween size="s">
            {/* Tool calls — collapsed by default */}
            {toolParts.length > 0 && (
              <ExpandableSection
                variant="footer"
                headerText={`${toolParts.length} tool call${toolParts.length > 1 ? "s" : ""} used`}
              >
                <SpaceBetween size="xs">
                  {toolParts.map((tp, i) => {
                    const toolName = tp.type.replace(/^tool-/, "");
                    return (
                      <ExpandableSection
                        key={i}
                        variant="footer"
                        headerText={`${tp.state === "output-available" ? "✓" : "⏳"} ${toolName}`}
                      >
                        <pre style={{
                          margin: 0, fontSize: 11,
                          whiteSpace: "pre-wrap", maxHeight: 200,
                          overflow: "auto", background: "#f4f4f4",
                          padding: 8, borderRadius: 4,
                        }}>
                          {tp.output !== undefined
                            ? JSON.stringify(tp.output, null, 2).slice(0, 3000)
                            : JSON.stringify(tp.input ?? null, null, 2)}
                        </pre>
                      </ExpandableSection>
                    );
                  })}
                </SpaceBetween>
              </ExpandableSection>
            )}

            {/* Formatted response — rendered all at once (not streamed) */}
            {fullText && <Markdown>{fullText}</Markdown>}
          </SpaceBetween>
        )}
      </div>
    </div>
  );
}
