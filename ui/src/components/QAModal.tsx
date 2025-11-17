/**
 * Q&A Modal Component
 *
 * Purpose:
 * - Ask AI questions about an item
 * - Display answer with citations
 * - Show related items
 */

import { Modal, TextInput, Button, Text, Stack, Loader, Badge, Group } from '@mantine/core';
import { IconSparkles, IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import { askQuestion, QAResponse, Item } from '../lib/api';
import { notifications } from '@mantine/notifications';

interface QAModalProps {
  opened: boolean;
  onClose: () => void;
  item: Item;
}

export default function QAModal({ opened, onClose, item }: QAModalProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QAResponse | null>(null);

  const handleAsk = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const result = await askQuestion(item.id, question, true);
      setResponse(result);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to get answer',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionClick = (q: string) => {
    setQuestion(q);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconSparkles size={20} />
          <Text fw={600}>Ask AI about {item.title}</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Group align="flex-end">
          <TextInput
            flex={1}
            placeholder="Ask a question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
          />
          <Button
            onClick={handleAsk}
            loading={loading}
            leftSection={<IconSend size={16} />}
          >
            Ask
          </Button>
        </Group>

        {loading && (
          <Group justify="center" py="xl">
            <Loader size="md" />
          </Group>
        )}

        {response && (
          <Stack gap="md">
            <div>
              <Text size="sm" fw={600} mb="xs">
                Answer:
              </Text>
              <Text size="sm">{response.answer}</Text>
            </div>

            {response.citations.length > 0 && (
              <div>
                <Text size="sm" fw={600} mb="xs">
                  Citations:
                </Text>
                <Stack gap="xs">
                  {response.citations.map((citation, i) => (
                    <Badge key={i} variant="light" component="a" href={citation} target="_blank">
                      {citation}
                    </Badge>
                  ))}
                </Stack>
              </div>
            )}

            <Text size="xs" c="dimmed">
              Model: {response.model}
            </Text>
          </Stack>
        )}

        {!response && item.aiQuestions && item.aiQuestions.length > 0 && (
          <div>
            <Text size="sm" fw={600} mb="xs">
              Suggested questions:
            </Text>
            <Stack gap="xs">
              {item.aiQuestions.map((q, i) => (
                <Button
                  key={i}
                  variant="light"
                  size="sm"
                  fullWidth
                  onClick={() => handleQuestionClick(q)}
                  style={{ textAlign: 'left', height: 'auto', whiteSpace: 'normal', padding: '8px 12px' }}
                >
                  {q}
                </Button>
              ))}
            </Stack>
          </div>
        )}
      </Stack>
    </Modal>
  );
}
