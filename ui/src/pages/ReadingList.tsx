/**
 * Reading List Page
 *
 * Purpose:
 * - Display items marked for follow-up
 */

import { useEffect, useState } from 'react';
import { Stack, Title, Text, Loader, Center, SimpleGrid } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fetchItems, Item } from '../lib/api';
import ItemCard from '../components/ItemCard';

export default function ReadingList() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReading();
  }, []);

  const loadReading = async () => {
    try {
      const result = await fetchItems({ followup: true });
      setItems(result.items);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load reading list',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="xl">
      <div>
        <Title order={2} mb="xs">
          Reading List
        </Title>
        <Text c="dimmed">Items you want to follow up on</Text>
      </div>

      {items.length === 0 ? (
        <Center h={200}>
          <Text c="dimmed">Your reading list is empty</Text>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              followup={true}
              onStar={() => {}}
              onFollowup={() => {}}
              onAsk={() => {}}
            />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
