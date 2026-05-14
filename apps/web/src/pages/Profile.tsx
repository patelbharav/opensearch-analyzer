import { useQuery } from "@tanstack/react-query";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { useAuth } from "../auth.js";
import { api } from "../api.js";

const ACTION_LABELS: Record<string, string> = {
  scan: "Ran scan",
  fix_applied: "Applied fix",
  fix_failed: "Fix failed",
  domain_added: "Added domain",
  domain_deleted: "Deleted domain",
  sop_created: "Created policy",
  sop_updated: "Updated policy",
  sop_deleted: "Deleted policy",
  settings_changed: "Changed settings",
  login: "Signed in",
};

export function ProfilePage() {
  const { user } = useAuth();

  const actionsQuery = useQuery({
    queryKey: ["actions", user?.id],
    queryFn: () => (user ? api.listActions(user.id) : Promise.resolve({ actions: [] })),
    enabled: !!user,
  });

  if (!user) {
    return (
      <ContentLayout header={<Header variant="h1">Profile</Header>}>
        <Box textAlign="center" padding="xxl" color="text-body-secondary">
          Sign in to see your profile and action history.
        </Box>
      </ContentLayout>
    );
  }

  const actions = actionsQuery.data?.actions ?? [];

  return (
    <ContentLayout
      header={<Header variant="h1">Profile</Header>}
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Account</Header>}>
          <ColumnLayout columns={3} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">Username</Box>
              <Box>{user.username}</Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Display name</Box>
              <Box>{user.displayName}</Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Role</Box>
              <Badge>{user.role}</Badge>
            </div>
          </ColumnLayout>
        </Container>

        <Container header={<Header variant="h2" counter={`(${actions.length})`}>Action history</Header>}>
          <Table
            loading={actionsQuery.isLoading}
            items={actions}
            trackBy="id"
            columnDefinitions={[
              {
                id: "time", header: "Time", width: 180,
                cell: (a) => new Date(a.timestamp).toLocaleString(),
              },
              {
                id: "action", header: "Action", width: 140,
                cell: (a) => <Badge>{ACTION_LABELS[a.action] ?? a.action}</Badge>,
              },
              {
                id: "description", header: "Description",
                cell: (a) => a.description,
              },
            ]}
            empty={
              <Box textAlign="center" color="text-body-secondary">
                No actions recorded yet. Actions are tracked when you scan, apply fixes, or change settings.
              </Box>
            }
          />
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
