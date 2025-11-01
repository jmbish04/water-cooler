/**
 * Starred Page
 *
 * Purpose:
 * - Display starred items
 */

import { useEffect, useState } from 'react';
import { Stack, Title, Text, Loader, Center, SimpleGrid } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fetchItems, Item } from '../lib/api';
import ItemCard from '../components/ItemCard';

export default function Starred() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStarred();
  }, []);

  const loadStarred = async () => {
    try {
      const result = await fetchItems({ starred: true });
      setItems(result.items);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load starred items',
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
          Starred
        </Title>
        <Text c="dimmed">Your starred items</Text>
      </div>

      {items.length === 0 ? (
        <Center h={200}>
          <Text c="dimmed">No starred items yet</Text>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              starred={true}
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
