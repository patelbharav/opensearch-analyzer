import { useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs from "@cloudscape-design/components/tabs";
import { useAuth } from "../auth.js";

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function LoginModal({ visible, onDismiss }: Props) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setUsername(""); setPassword(""); setDisplayName(""); setError(null);
  };

  const handleLogin = async () => {
    setLoading(true); setError(null);
    try {
      await login(username, password);
      reset(); onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true); setError(null);
    try {
      await register(username, password, displayName || undefined);
      reset(); onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      header="Sign in to OpenSearch Analyzer"
      onDismiss={() => { reset(); onDismiss(); }}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => { reset(); onDismiss(); }} variant="link">Cancel</Button>
            <Button
              variant="primary"
              loading={loading}
              onClick={tab === "login" ? handleLogin : handleRegister}
              disabled={!username || !password}
            >
              {tab === "login" ? "Sign in" : "Create account"}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {error && <Alert type="error">{error}</Alert>}
        <Tabs activeTabId={tab} onChange={(e) => { setTab(e.detail.activeTabId); setError(null); }} tabs={[
          {
            id: "login", label: "Sign in",
            content: (
              <SpaceBetween size="m">
                <FormField label="Username">
                  <Input value={username} onChange={(e) => setUsername(e.detail.value)}
                    onKeyDown={(e) => { if (e.detail.key === "Enter") handleLogin(); }} />
                </FormField>
                <FormField label="Password">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.detail.value)}
                    onKeyDown={(e) => { if (e.detail.key === "Enter") handleLogin(); }} />
                </FormField>
              </SpaceBetween>
            ),
          },
          {
            id: "register", label: "Create account",
            content: (
              <SpaceBetween size="m">
                <FormField label="Username">
                  <Input value={username} onChange={(e) => setUsername(e.detail.value)} />
                </FormField>
                <FormField label="Display name (optional)">
                  <Input value={displayName} onChange={(e) => setDisplayName(e.detail.value)} />
                </FormField>
                <FormField label="Password" description="At least 6 characters">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.detail.value)}
                    onKeyDown={(e) => { if (e.detail.key === "Enter") handleRegister(); }} />
                </FormField>
              </SpaceBetween>
            ),
          },
        ]} />
      </SpaceBetween>
    </Modal>
  );
}
