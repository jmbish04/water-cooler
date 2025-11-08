/**
 * Scan Log Viewer Component
 *
 * Purpose:
 * - Connect to SchedulerActor WebSocket for real-time scan logs
 * - Display logs as they arrive with color-coded levels
 * - Auto-scroll to latest log entry
 * - Show connection status
 */

import { useEffect, useState, useRef } from 'react';
import { Paper, Text, Stack, Badge, ScrollArea, Group, Loader } from '@mantine/core';
import { IconCheck, IconX, IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react';

interface ScanLog {
  type: string;
  message: string;
  sourceId?: number;
  sourceName?: string;
  timestamp: string;
  level?: 'info' | 'error' | 'success';
}

interface ScanLogViewerProps {
  onClose?: () => void;
}

export default function ScanLogViewer({ onClose }: ScanLogViewerProps) {
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/scheduler`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      setLogs((prev) => [
        ...prev,
        {
          type: 'connection',
          message: 'Connected to scan log stream',
          timestamp: new Date().toISOString(),
          level: 'success',
        },
      ]);
    };

    ws.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data) as ScanLog;
        setLogs((prev) => [...prev, log]);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('error');
      setLogs((prev) => [
        ...prev,
        {
          type: 'error',
          message: 'WebSocket connection error',
          timestamp: new Date().toISOString(),
          level: 'error',
        },
      ]);
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      setLogs((prev) => [
        ...prev,
        {
          type: 'disconnected',
          message: 'Disconnected from scan log stream',
          timestamp: new Date().toISOString(),
          level: 'info',
        },
      ]);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [logs]);

  const getLevelIcon = (level?: string) => {
    switch (level) {
      case 'success':
        return <IconCheck size={16} />;
      case 'error':
        return <IconX size={16} />;
      case 'info':
      default:
        return <IconInfoCircle size={16} />;
    }
  };

  const getLevelColor = (level?: string) => {
    switch (level) {
      case 'success':
        return 'green';
      case 'error':
        return 'red';
      case 'info':
      default:
        return 'blue';
    }
  };

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connecting':
        return (
          <Badge color="gray" leftSection={<Loader size={12} />}>
            Connecting...
          </Badge>
        );
      case 'connected':
        return (
          <Badge color="green" leftSection={<IconCheck size={12} />}>
            Connected
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge color="orange" leftSection={<IconAlertTriangle size={12} />}>
            Disconnected
          </Badge>
        );
      case 'error':
        return (
          <Badge color="red" leftSection={<IconX size={12} />}>
            Error
          </Badge>
        );
    }
  };

  return (
    <Paper withBorder p="md" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" mb="md">
        <Text fw={600} size="lg">
          Scan Logs
        </Text>
        {getStatusBadge()}
      </Group>

      <ScrollArea style={{ flex: 1 }} ref={scrollAreaRef}>
        <Stack gap="xs">
          {logs.length === 0 && connectionStatus === 'connected' && (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              Waiting for scan to start...
            </Text>
          )}
          {logs.map((log, index) => (
            <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
              <div style={{ paddingTop: 2 }}>{getLevelIcon(log.level)}</div>
              <div style={{ flex: 1 }}>
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" c="dimmed" style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </Text>
                  {log.sourceName && (
                    <Badge size="xs" variant="light">
                      {log.sourceName}
                    </Badge>
                  )}
                </Group>
                <Text size="sm" mt={2}>
                  {log.message}
                </Text>
              </div>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
