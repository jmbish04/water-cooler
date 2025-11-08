/**
 * Settings Page
 *
 * Purpose:
 * - Configure sources
 * - Set preferences
 * - Trigger manual scans
 */

import { useState } from 'react';
import { Stack, Title, Text, Button, Card, Group, Modal } from '@mantine/core';
import { IconRefresh, IconMail } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { triggerScan } from '../lib/api';
import ScanLogViewer from '../components/ScanLogViewer';

export default function Settings() {
  const [showLogViewer, setShowLogViewer] = useState(false);

  const handleScan = async () => {
    try {
      // Open log viewer first
      setShowLogViewer(true);

      // Trigger the scan
      await triggerScan();

      notifications.show({
        title: 'Scan Triggered',
        message: 'Source scan has been queued - watch the logs below',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to trigger scan',
        color: 'red',
      });
      setShowLogViewer(false);
    }
  };

  return (
    <Stack gap="xl">
      <div>
        <Title order={2} mb="xs">
          Settings
        </Title>
        <Text c="dimmed">Configure your curation preferences</Text>
      </div>

      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <div>
            <Text fw={600} mb="xs">
              Source Scanning
            </Text>
            <Text size="sm" c="dimmed" mb="md">
              Automatically scans GitHub, App Store, Reddit, and Discord every 6 hours
            </Text>
            <Button leftSection={<IconRefresh size={16} />} onClick={handleScan}>
              Trigger Manual Scan
            </Button>
          </div>
        </Stack>
      </Card>

      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <div>
            <Text fw={600} mb="xs">
              Email Digest
            </Text>
            <Text size="sm" c="dimmed" mb="md">
              Receive a daily digest of top curated items at 9am PT
            </Text>
            <Button leftSection={<IconMail size={16} />} variant="light">
              Configure Email
            </Button>
          </div>
        </Stack>
      </Card>

      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Text fw={600}>About</Text>
          <Text size="sm" c="dimmed">
            AI-Curated Discovery Hub v1.0.0
            <br />
            Powered by Cloudflare Workers, Vectorize, D1, and AI
            <br />
            <br />
            <strong>Architecture:</strong>
            <br />
            • Durable Objects for stateful actors
            <br />
            • Vectorize for semantic search
            <br />
            • D1 for relational data
            <br />
            • Workers AI for curation and Q&A
            <br />• React + Mantine for UI
          </Text>
        </Stack>
      </Card>

      {/* Scan Log Viewer Modal */}
      <Modal
        opened={showLogViewer}
        onClose={() => setShowLogViewer(false)}
        title="Real-Time Scan Logs"
        size="xl"
        styles={{
          body: { height: '500px', padding: 0 },
        }}
      >
        <ScanLogViewer onClose={() => setShowLogViewer(false)} />
      </Modal>
    </Stack>
  );
}
