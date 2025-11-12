/**
 * ItemCard Component
 *
 * Purpose:
 * - Display curated item with summary, tags, score
 * - Action buttons (star, follow-up, mark read, ask AI)
 * - Source badge
 */

import { Card, Text, Badge, Group, Button, ActionIcon, Stack, Progress } from '@mantine/core';
import { IconStar, IconStarFilled, IconBookmark, IconExternalLink, IconSparkles } from '@tabler/icons-react';
import { Item } from '../lib/api';
import { useEffect, useState } from 'react';
import { fetchAnnotation } from '../lib/useAnnotation';

interface ItemCardProps {
  item: Item;
  onStar: () => void;
  onFollowup: () => void;
  onAsk: () => void;
  starred?: boolean;
  followup?: boolean;
}

export default function ItemCard({ item, onStar, onFollowup, onAsk, starred, followup }: ItemCardProps) {
  const [ai, setAi] = useState<{category:string;score:number;summary:string}|null>(null);

  useEffect(() => {
    fetchAnnotation({ title: item.title, url: item.url })
      .then(setAi)
      .catch(() => setAi({ category: 'Uncategorized', score: 50, summary: 'No summary available' }));
  }, [item.title, item.url]);

  const sourceColors: Record<string, string> = {
    github: 'blue',
    appstore: 'grape',
    reddit: 'orange',
    discord: 'indigo',
  };

  const sourceColor = sourceColors[item.metadata?.source || 'github'] || 'gray';

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Badge color={sourceColor} variant="light">
            {item.metadata?.source || 'Unknown'}
          </Badge>
          <Group gap="xs">
            <ActionIcon
              variant={starred ? 'filled' : 'light'}
              color="yellow"
              onClick={onStar}
              title="Star"
            >
              {starred ? <IconStarFilled size={18} /> : <IconStar size={18} />}
            </ActionIcon>
            <ActionIcon
              variant={followup ? 'filled' : 'light'}
              color="blue"
              onClick={onFollowup}
              title="Follow-up"
            >
              <IconBookmark size={18} />
            </ActionIcon>
          </Group>
        </Group>

        <div>
          <Group justify="space-between" mb="xs">
            <Text fw={600} size="lg" lineClamp={2}>
              {item.title}
            </Text>
            <Text size="sm" c="dimmed">
              {ai ? `${ai.score}%` : '...'}
            </Text>
          </Group>
          <Progress value={ai?.score ?? 0} size="xs" mb="md" />
        </div>

        <Text size="sm" c="dimmed" lineClamp={3}>
          {ai?.summary ?? 'Analyzing…'}
        </Text>

        {item.tags && item.tags.length > 0 && (
          <Group gap="xs">
            {item.tags.slice(0, 5).map((tag) => (
              <Badge key={tag} size="sm" variant="dot">
                {tag}
              </Badge>
            ))}
            {ai && <Badge size="sm" variant="outline">{ai.category}</Badge>}
          </Group>
        )}

        {item.reason && (
          <Text size="xs" c="blue" fs="italic">
            {item.reason}
          </Text>
        )}

        <Group justify="space-between">
          <Button
            component="a"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="light"
            size="sm"
            rightSection={<IconExternalLink size={16} />}
          >
            View
          </Button>

          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconSparkles size={16} />}
            onClick={onAsk}
          >
            Ask AI
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
