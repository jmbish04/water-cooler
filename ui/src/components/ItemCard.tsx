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
  const questions: string[] = [];

  // Question based on summary
  if (item.summary) {
    questions.push(`What are the key features?`);
  }

  // Question based on source
  if (item.metadata?.source === 'github') {
    questions.push(`How does this work technically?`);
    questions.push(`What problems does this solve?`);
  } else if (item.metadata?.source === 'reddit') {
    questions.push(`What's the main discussion about?`);
    questions.push(`What are the top insights?`);
  } else if (item.metadata?.source === 'appstore') {
    questions.push(`What makes this app unique?`);
    questions.push(`Who should use this?`);
  } else if (item.metadata?.source === 'discord') {
    questions.push(`What's the context here?`);
    questions.push(`What's the key takeaway?`);
  }

  // Generic questions if we don't have enough
  while (questions.length < 3) {
    const generic = [
      `Can you explain this further?`,
      `What's most interesting here?`,
      `How can I use this?`,
    ];
    questions.push(generic[questions.length] || generic[0]);
  }

  return questions.slice(0, 3);
}

export default function ItemCard({ item, onStar, onFollowup, onAsk, starred, followup }: ItemCardProps) {
  const [questions] = useState(() => generateQuestions(item));
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');
  // Rotate questions every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setFadeState('out');
      setTimeout(() => {
        setCurrentQuestionIndex((prev) => (prev + 1) % questions.length);
        setFadeState('in');
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, [questions.length]);

  const sourceColors: Record<string, string> = {
    github: 'blue',
    appstore: 'grape',
    reddit: 'orange',
    discord: 'indigo',
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
