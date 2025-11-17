/**
 * Chat Interface Component
 *
 * Purpose:
 * - Bottom-right chat popup for Q&A
 * - Expandable to full-page modal
 * - Multi-turn conversation support
 * - Show typing indicators and citations
 */

import {
  Paper,
  TextInput,
  Button,
  Text,
  Stack,
  Loader,
  Badge,
  Group,
  ActionIcon,
  Box,
  ScrollArea,
  Modal,
} from '@mantine/core';
import {
  IconSparkles,
  IconSend,
  IconX,
  IconMaximize,
  IconMinimize,
} from '@tabler/icons-react';
import { useState, useEffect, useRef } from 'react';
import { askQuestion, QAResponse, Item } from '../lib/api';
import { notifications } from '@mantine/notifications';

interface ChatInterfaceProps {
  item: Item | null;
  onClose: () => void;
  initialQuestion?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  timestamp: Date;
}

export default function ChatInterface({ item, onClose, initialQuestion }: ChatInterfaceProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-ask initial question if provided
  useEffect(() => {
    if (initialQuestion && item) {
      setQuestion(initialQuestion);
      handleAsk(initialQuestion);
    }
  }, [initialQuestion, item]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAsk = async (customQuestion?: string) => {
    const q = customQuestion || question;
    if (!q.trim() || !item) return;

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: q,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setLoading(true);

    try {
      const result = await askQuestion(item.id, q, true);

      // Add assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to get answer',
        color: 'red',
      });

      // Add error message
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  if (!item) return null;

  const chatContent = (
    <Stack gap="md" style={{ height: '100%' }}>
      {/* Header */}
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <IconSparkles size={20} color="blue" />
          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Minimize' : 'Maximize'}
            >
              {expanded ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
            </ActionIcon>
            <ActionIcon variant="subtle" onClick={onClose} title="Close">
              <IconX size={18} />
            </ActionIcon>
          </Group>
        </Group>
        <Text fw={600} size="sm" lineClamp={2}>
          {item.title}
        </Text>
      </Stack>

      {/* Messages */}
      <ScrollArea
        style={{ flex: 1 }}
        viewportRef={scrollRef}
        type="auto"
      >
        <Stack gap="md">
          {messages.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              Ask me anything about this content!
            </Text>
          )}

          {messages.map((message, index) => (
            <Box key={index}>
              <Group gap="xs" mb="xs">
                <Badge
                  size="sm"
                  color={message.role === 'user' ? 'blue' : 'green'}
                  variant="light"
                >
                  {message.role === 'user' ? 'You' : 'AI'}
                </Badge>
                <Text size="xs" c="dimmed">
                  {message.timestamp.toLocaleTimeString()}
                </Text>
              </Group>

              <Paper p="sm" bg={message.role === 'user' ? 'blue.0' : 'gray.0'}>
                <Text size="sm">{message.content}</Text>

                {message.citations && message.citations.length > 0 && (
                  <Stack gap="xs" mt="sm">
                    <Text size="xs" fw={600}>
                      Sources:
                    </Text>
                    {message.citations.map((citation, i) => (
                      <Badge
                        key={i}
                        size="xs"
                        variant="outline"
                        component="a"
                        href={citation}
                        target="_blank"
                        style={{ cursor: 'pointer' }}
                      >
                        {new URL(citation).hostname}
                      </Badge>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Box>
          ))}

          {loading && (
            <Group justify="center">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                AI is thinking...
              </Text>
            </Group>
          )}
        </Stack>
      </ScrollArea>

      {/* Input */}
      <Group align="flex-end" wrap="nowrap">
        <TextInput
          flex={1}
          placeholder="Ask a question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !loading && handleAsk()}
          disabled={loading}
        />
        <Button
          onClick={() => handleAsk()}
          loading={loading}
          leftSection={<IconSend size={16} />}
          disabled={!question.trim()}
        >
          Send
        </Button>
      </Group>
    </Stack>
  );

  // If expanded, show as modal
  if (expanded) {
    return (
      <Modal
        opened={true}
        onClose={() => setExpanded(false)}
        size="xl"
        title={null}
        styles={{
          body: { height: '80vh', display: 'flex', flexDirection: 'column' },
        }}
      >
        {chatContent}
      </Modal>
    );
  }

  // Otherwise, show as bottom-right popup
  return (
    <Paper
      shadow="xl"
      p="md"
      radius="md"
      withBorder
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 400,
        height: 500,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {chatContent}
    </Paper>
  );
}
