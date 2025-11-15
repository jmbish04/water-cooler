/**
 * ItemCard Component
 *
 * Purpose:
 * - Display curated item with summary, tags, score
 * - Action buttons (star, follow-up, mark read, ask AI)
 * - Auto-generated rotating questions
 * - Source badge
 */

import { Card, Text, Badge, Group, Button, ActionIcon, Stack, Progress, Box } from '@mantine/core';
import { IconStar, IconStarFilled, IconBookmark, IconExternalLink, IconSparkles } from '@tabler/icons-react';
import { Item } from '../lib/api';
import { useState, useEffect } from 'react';

interface ItemCardProps {
  item: Item;
  onStar: () => void;
  onFollowup: () => void;
  onAsk: (question?: string) => void;
  starred?: boolean;
  followup?: boolean;
}

/**
 * Generate auto questions based on item content
 */
function generateQuestions(item: Item): string[] {
  const questionSet = new Set<string>();
  const add = (value: string | undefined | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    questionSet.add(trimmed);
  };

  const shortTitle = item.title.length > 80 ? `${item.title.slice(0, 77)}...` : item.title;

  if (item.summary) {
    add(`What are the key takeaways from "${shortTitle}"?`);
  }

  if (item.reason) {
    add(`Why is this worth a look?`);
  }

  if (item.tags && item.tags.length > 0) {
    const focusTag = item.tags[0];
    add(`How does this relate to ${focusTag}?`);
  }

  const source = item.metadata?.source;
  switch (source) {
    case 'github':
      add(`What problem does this project solve for developers?`);
      add(`How do I get started using this repository?`);
      break;
    case 'reddit':
      add(`What is the community's main discussion in this thread?`);
      add(`What insight sparked the conversation here?`);
      break;
    case 'appstore':
      add(`Who will benefit most from this app?`);
      add(`What standout feature should I try first?`);
      break;
    case 'discord':
      add(`What context should I know before joining this conversation?`);
      break;
    case 'igdux':
      add(`How could I adapt this Worker idea for my own use case?`);
      break;
    default:
      add(`What is the most exciting part of this content?`);
  }

  const fallbacks = [
    `How can I apply this in my projects?`,
    `What should I explore next from here?`,
    `What challenges does this help address?`,
  ];

  fallbacks.forEach(add);

  return Array.from(questionSet).slice(0, 5);
}

export default function ItemCard({ item, onStar, onFollowup, onAsk, starred, followup }: ItemCardProps) {
  // Prefer AI-generated questions over generated ones
  const [questions] = useState(() =>
    item.aiQuestions && item.aiQuestions.length > 0
      ? item.aiQuestions
      : generateQuestions(item)
  );
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(() =>
    questions.length > 1 ? Math.floor(Math.random() * questions.length) : 0
  );
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');
  // Rotate questions every 3 seconds
  useEffect(() => {
    if (questions.length <= 1) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const startDelay = 500 + Math.random() * 1500;

    const timeoutId = setTimeout(() => {
      intervalId = setInterval(() => {
        setFadeState('out');
        setTimeout(() => {
          setCurrentQuestionIndex((prev) => (prev + 1) % questions.length);
          setFadeState('in');
        }, 300);
      }, 3200);
    }, startDelay);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [questions.length, questions]);

  const sourceColors: Record<string, string> = {
    github: 'blue',
    appstore: 'grape',
    reddit: 'orange',
    discord: 'indigo',
    igdux: 'cyan',
  };

  const sourceColor = sourceColors[item.metadata?.source || 'github'] || 'gray';

  const handleQuestionClick = (question: string) => {
    onAsk(question);
  };

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
              {Math.round(item.score * 100)}%
            </Text>
          </Group>
          <Progress value={item.score * 100} size="xs" mb="md" />
        </div>

        {item.summary && (
          <Text size="sm" c="dimmed" lineClamp={3}>
            {item.summary}
          </Text>
        )}

        {item.tags && item.tags.length > 0 && (
          <Group gap="xs">
            {item.tags.slice(0, 5).map((tag) => (
              <Badge key={tag} size="sm" variant="dot">
                {tag}
              </Badge>
            ))}
          </Group>
        )}

        {item.reason && (
          <Text size="xs" c="blue" fs="italic">
            {item.reason}
          </Text>
        )}

        <Stack gap="xs">
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
              onClick={() => onAsk()}
            >
              Ask AI
            </Button>
          </Group>

          {/* Rotating AI-generated questions */}
          <Box
            style={{
              opacity: fadeState === 'in' ? 1 : 0,
              transition: 'opacity 300ms ease-in-out',
              minHeight: '24px',
            }}
          >
            <Text
              size="xs"
              c="blue"
              style={{
                cursor: 'pointer',
                textDecoration: 'underline',
                fontStyle: 'italic',
              }}
              onClick={() => handleQuestionClick(questions[currentQuestionIndex])}
            >
              💭 {questions[currentQuestionIndex]}
            </Text>
          </Box>
        </Stack>
      </Stack>
    </Card>
  );
}
