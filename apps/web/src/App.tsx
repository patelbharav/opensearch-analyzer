import { useMemo } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AppLayout from "@cloudscape-design/components/app-layout";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { DomainsPage } from "./pages/Domains.js";
import { OverviewPage } from "./pages/Overview.js";
import { FindingsPage } from "./pages/Findings.js";
import { ChatPage } from "./pages/Chat.js";
import { PoliciesPage } from "./pages/Policies.js";
import { SettingsPage } from "./pages/Settings.js";
import { detectEmbedded, EmbedContext, useParentDomainArn } from "./embed.js";

const NAV_ITEMS = [
  { type: "link" as const, text: "Domains", href: "/domains" },
  { type: "link" as const, text: "Overview", href: "/overview" },
  { type: "link" as const, text: "Findings", href: "/findings" },
  { type: "link" as const, text: "Chat", href: "/chat" },
  { type: "link" as const, text: "Policies", href: "/policies" },
  { type: "link" as const, text: "Settings", href: "/settings" },
];

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const embedded = useMemo(() => detectEmbedded(), []);
  const { parentOrigin, parentDomainArn } = useParentDomainArn(embedded);

  const ctxValue = useMemo(
    () => ({ embedded, parentOrigin, parentDomainArn }),
    [embedded, parentOrigin, parentDomainArn],
  );

  // In embed mode, default to /findings — the most useful single page.
  const isAtRoot = location.pathname === "/" || location.pathname === "";
  if (embedded && isAtRoot) {
    navigate("/findings", { replace: true });
  }

  const routes = (
    <Routes>
      <Route path="/" element={<DomainsPage />} />
      <Route path="/domains" element={<DomainsPage />} />
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/findings" element={<FindingsPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/policies" element={<PoliciesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );

  if (embedded) {
    // Embedded mode: no top nav, no side nav, just the content.
    return (
      <EmbedContext.Provider value={ctxValue}>
        <AppLayout
          navigationHide
          toolsHide
          contentType="default"
          content={routes}
        />
      </EmbedContext.Provider>
    );
  }

  return (
    <EmbedContext.Provider value={ctxValue}>
      <TopNavigation
        identity={{ href: "/", title: "OpenSearch Analyzer" }}
        utilities={[
          {
            type: "button",
            iconName: "user-profile",
            text: "Sign in",
            ariaLabel: "Sign in",
          },
        ]}
      />
      <AppLayout
        navigation={
          <SideNavigation
            activeHref={location.pathname}
            header={{ href: "/", text: "Analyzer" }}
            items={NAV_ITEMS}
            onFollow={(e) => {
              if (!e.detail.external) {
                e.preventDefault();
                navigate(e.detail.href);
              }
            }}
          />
        }
        toolsHide
        content={routes}
      />
    </EmbedContext.Provider>
  );
}
