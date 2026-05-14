import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="osa-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 style={{ marginTop: 16, marginBottom: 8, fontSize: 18 }}>{children}</h2>,
          h2: ({ children }) => <h3 style={{ marginTop: 16, marginBottom: 8, fontSize: 16 }}>{children}</h3>,
          h3: ({ children }) => <h4 style={{ marginTop: 12, marginBottom: 6, fontSize: 14 }}>{children}</h4>,
          p: ({ children }) => <p style={{ margin: "8px 0", lineHeight: 1.55 }}>{children}</p>,
          ul: ({ children }) => (
            <ul style={{
              margin: "8px 0 8px 0",
              paddingLeft: 20,
              lineHeight: 1.6,
              listStyleType: "disc",
            }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{
              margin: "8px 0 8px 0",
              paddingLeft: 20,
              lineHeight: 1.6,
            }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{
              marginBottom: 6,
              paddingLeft: 4,
            }}>{children}</li>
          ),
          code: ({ children, node, ...props }) => {
            // react-markdown wraps fenced code blocks in <pre><code>.
            // Inline backtick code is just <code> with no <pre> parent.
            const isBlock = node?.position &&
              (props as { className?: string }).className?.startsWith("language-");
            if (isBlock) {
              return (
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  {children}
                </code>
              );
            }
            return (
              <code style={{
                background: "#f4f4f4",
                padding: "1px 5px",
                borderRadius: 3,
                fontSize: "0.88em",
                fontFamily: "ui-monospace, monospace",
                whiteSpace: "nowrap",
              }}>{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre style={{
              background: "#f4f4f4",
              padding: 12,
              borderRadius: 4,
              fontSize: 12,
              overflow: "auto",
              margin: "8px 0",
              lineHeight: 1.5,
            }}>
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "8px 0" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{
              borderBottom: "2px solid #d5dbdb",
              padding: "6px 12px",
              textAlign: "left",
              background: "#fafafa",
            }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{
              borderBottom: "1px solid #eaeded",
              padding: "6px 12px",
            }}>{children}</td>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#0073bb" }}>
              {children}
            </a>
          ),
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: "3px solid #d5dbdb",
              paddingLeft: 12,
              margin: "8px 0",
              color: "#545b64",
            }}>{children}</blockquote>
          ),
          hr: () => <hr style={{ border: "none", borderTop: "1px solid #eaeded", margin: "12px 0" }} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
