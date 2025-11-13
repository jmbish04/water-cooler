/**
 * Health Status Badge Component
 *
 * Purpose:
 * - Display overall system health status in a corner badge
 * - Clickable to navigate to full health dashboard
 * - Auto-updates status from API
 */

import { useState, useEffect } from 'react';
import { Badge, Indicator, Loader } from '@mantine/core';
import { IconHeartbeat } from '@tabler/icons-react';
import { getHealthStatus } from '../lib/api';

interface HealthStatusBadgeProps {
  onNavigateToHealth?: () => void;
}

export default function HealthStatusBadge({ onNavigateToHealth }: HealthStatusBadgeProps) {
  const [status, setStatus] = useState<'healthy' | 'degraded' | 'failed' | 'loading'>('loading');
  const [count, setCount] = useState({ healthy: 0, total: 0 });

  useEffect(() => {
    loadStatus();
    // Refresh every 5 minutes
    const interval = setInterval(loadStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const data = await getHealthStatus();
      const healthChecks = data.healthChecks;

      if (!healthChecks || healthChecks.length === 0) {
        setStatus('degraded');
        return;
      }

      const healthy = healthChecks.filter((h: any) => h.status === 'healthy').length;
      const failed = healthChecks.filter((h: any) => h.status === 'failed').length;
      const degraded = healthChecks.filter((h: any) => h.status === 'degraded').length;

      setCount({ healthy, total: healthChecks.length });

      if (failed > 0) {
        setStatus('failed');
      } else if (degraded > 0) {
        setStatus('degraded');
      } else {
        setStatus('healthy');
      }
    } catch (error) {
      setStatus('failed');
    }
  };

  const getColor = () => {
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

  const getLabel = () => {
    if (status === 'loading') return 'Loading...';
    return `${count.healthy}/${count.total} Healthy`;
  };

  return (
    <Indicator
      inline
      size={8}
      offset={4}
      position="top-end"
      color={getColor()}
      processing={status === 'loading'}
    >
      <Badge
        leftSection={status === 'loading' ? <Loader size={12} /> : <IconHeartbeat size={14} />}
        color={getColor()}
        variant="light"
        style={{ cursor: onNavigateToHealth ? 'pointer' : 'default' }}
        onClick={onNavigateToHealth}
      >
        {getLabel()}
      </Badge>
    </Indicator>
  );
}
