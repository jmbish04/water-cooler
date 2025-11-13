/**
 * Health Dashboard Page
 *
 * Purpose:
 * - Display health status for all connectors
 * - Show charts and trends over time
 * - Allow manual health check execution
 * - Display test results with AI insights
 */

import { useEffect, useState } from 'react';
import {
  Stack,
  Title,
  Text,
  Group,
  Badge,
  Card,
  Button,
  Grid,
  Progress,
  Loader,
  Center,
  Table,
  Paper,
  ActionIcon,
  Collapse,
} from '@mantine/core';
import { IconRefresh, IconChevronDown, IconChevronUp, IconCheck, IconX, IconAlertTriangle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getHealthStatus, runHealthCheck, getTestResults } from '../lib/api';

interface HealthCheck {
  id: number;
  sourceId: number;
  sourceName: string;
  sourceType: string;
  status: 'healthy' | 'degraded' | 'failed';
  responseTime: number | null;
  errorMessage: string | null;
  checkedAt: string;
  metadata: any;
}

export default function Health() {
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadHealth();
    loadTestResults();
  }, []);

  const loadHealth = async () => {
    try {
      const data = await getHealthStatus();
      setHealthChecks(data.healthChecks);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load health status',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTestResults = async () => {
    try {
      const data = await getTestResults({ limit: 20 });
      setTestResults(data.results);
    } catch (error) {
      console.error('Failed to load test results:', error);
    }
  };

  const handleRunHealthCheck = async () => {
    setRunning(true);
    try {
      const data = await runHealthCheck();
      setHealthChecks(data.healthChecks);
      notifications.show({
        title: 'Success',
        message: `Health check completed for ${data.count} connectors`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to run health check',
        color: 'red',
      });
    } finally {
      setRunning(false);
    }
  };

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'green';
      case 'degraded':
        return 'yellow';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <IconCheck size={18} />;
      case 'degraded':
        return <IconAlertTriangle size={18} />;
      case 'failed':
        return <IconX size={18} />;
      default:
        return null;
    }
  };

  // Calculate overall stats
  const healthyCount = healthChecks.filter((h) => h.status === 'healthy').length;
  const degradedCount = healthChecks.filter((h) => h.status === 'degraded').length;
  const failedCount = healthChecks.filter((h) => h.status === 'failed').length;
  const avgResponseTime =
    healthChecks.reduce((sum, h) => sum + (h.responseTime || 0), 0) / (healthChecks.length || 1);

  if (loading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="xl">
      {/* Header */}
      <Group justify="space-between">
        <div>
          <Title order={2}>System Health Dashboard</Title>
          <Text c="dimmed" size="sm">
            Monitor connector health and AI test results
          </Text>
        </div>
        <Button
          leftSection={<IconRefresh size={16} />}
          onClick={handleRunHealthCheck}
          loading={running}
        >
          Run Health Check
        </Button>
      </Group>

      {/* Summary Cards */}
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Healthy
            </Text>
            <Group justify="apart" mt="md">
              <Text size="xl" fw={700} c="green">
                {healthyCount}
              </Text>
              <IconCheck size={24} color="green" />
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Degraded
            </Text>
            <Group justify="apart" mt="md">
              <Text size="xl" fw={700} c="yellow">
                {degradedCount}
              </Text>
              <IconAlertTriangle size={24} color="orange" />
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Failed
            </Text>
            <Group justify="apart" mt="md">
              <Text size="xl" fw={700} c="red">
                {failedCount}
              </Text>
              <IconX size={24} color="red" />
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              Avg Response Time
            </Text>
            <Group justify="apart" mt="md">
              <Text size="xl" fw={700}>
                {Math.round(avgResponseTime)}ms
              </Text>
            </Group>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Health Checks Table */}
      <Paper shadow="sm" p="md" withBorder>
        <Title order={3} mb="md">
          Connector Health
        </Title>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Connector</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Response Time</Table.Th>
              <Table.Th>Last Checked</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {healthChecks.map((check) => (
              <>
                <Table.Tr key={check.id}>
                  <Table.Td fw={500}>{check.sourceName}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light">
                      {check.sourceType}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={getStatusColor(check.status)}
                      variant="light"
                      leftSection={getStatusIcon(check.status)}
                    >
                      {check.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {check.responseTime ? `${check.responseTime}ms` : 'N/A'}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{new Date(check.checkedAt).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    {check.errorMessage && (
                      <ActionIcon
                        variant="subtle"
                        onClick={() => toggleRow(check.id)}
                      >
                        {expandedRows.has(check.id) ? (
                          <IconChevronUp size={16} />
                        ) : (
                          <IconChevronDown size={16} />
                        )}
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
                {check.errorMessage && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Collapse in={expandedRows.has(check.id)}>
                        <Paper p="sm" bg="red.0">
                          <Text size="sm" fw={600} c="red" mb="xs">
                            Error Details:
                          </Text>
                          <Text size="sm" ff="monospace">
                            {check.errorMessage}
                          </Text>
                        </Paper>
                      </Collapse>
                    </Table.Td>
                  </Table.Tr>
                )}
              </>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Paper shadow="sm" p="md" withBorder>
          <Title order={3} mb="md">
            Recent Test Results
          </Title>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Test</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Latency</Table.Th>
                <Table.Th>Timestamp</Table.Th>
                <Table.Th>AI Insights</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {testResults.map((result) => (
                <Table.Tr key={result.id}>
                  <Table.Td fw={500}>{result.testProfile?.name || 'Unknown'}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={result.status === 'PASS' ? 'green' : 'red'}
                      variant="light"
                    >
                      {result.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{result.latencyMs ? `${result.latencyMs}ms` : 'N/A'}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{new Date(result.timestamp).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    {result.humanReadableErrorMessage && (
                      <Text size="sm" c="dimmed" lineClamp={1}>
                        {result.humanReadableErrorMessage}
                      </Text>
                    )}
                    {result.possibleSolutions && (
                      <Text size="xs" c="blue" lineClamp={1}>
                        💡 {result.possibleSolutions}
                      </Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
