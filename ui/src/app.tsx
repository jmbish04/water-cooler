/**
 * Main App Component
 *
 * Purpose:
 * - Root component with layout
 * - Tab navigation (Discover, Starred, Reading List, Settings)
 * - Client-side routing via tabs
 */

import { useState } from 'react';
import { AppShell, Tabs, Title, Container, Group, Text } from '@mantine/core';
import { IconSparkles, IconStar, IconBookmark, IconSettings } from '@tabler/icons-react';
import Discover from './pages/Discover';
import Starred from './pages/Starred';
import ReadingList from './pages/ReadingList';
import Settings from './pages/Settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<string | null>('discover');

  return (
    <AppShell header={{ height: 70 }} padding="md">
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between">
            <Group>
              <IconSparkles size={32} stroke={1.5} color="var(--mantine-color-blue-6)" />
              <div>
                <Title order={3}>AI-Curated Discovery Hub</Title>
                <Text size="xs" c="dimmed">
                  Powered by Cloudflare Workers + AI
                </Text>
              </div>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="xl">
          <Tabs value={activeTab} onChange={setActiveTab} mb="xl">
            <Tabs.List>
              <Tabs.Tab value="discover" leftSection={<IconSparkles size={16} />}>
                Discover
              </Tabs.Tab>
              <Tabs.Tab value="starred" leftSection={<IconStar size={16} />}>
                Starred
              </Tabs.Tab>
              <Tabs.Tab value="reading" leftSection={<IconBookmark size={16} />}>
                Reading List
              </Tabs.Tab>
              <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
                Settings
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="discover" pt="xl">
              <Discover />
            </Tabs.Panel>

            <Tabs.Panel value="starred" pt="xl">
              <Starred />
            </Tabs.Panel>

            <Tabs.Panel value="reading" pt="xl">
              <ReadingList />
            </Tabs.Panel>

            <Tabs.Panel value="settings" pt="xl">
              <Settings />
            </Tabs.Panel>
          </Tabs>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
