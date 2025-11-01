/**
 * Discover Page
 *
 * Purpose:
 * - Display all curated items
 * - Search and filter
 * - Infinite scroll / pagination
 */

import { useEffect, useState } from 'react';
import { Stack, Title, Text, Loader, Center, SimpleGrid } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fetchItems, searchItems, toggleStar, toggleFollowup, Item } from '../lib/api';
import SearchBar from '../components/SearchBar';
import ItemCard from '../components/ItemCard';
import QAModal from '../components/QAModal';

export default function Discover() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [followupIds, setFollowupIds] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const result = await fetchItems({});
      setItems(result.items);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load items',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string, filters: any) => {
    if (!query.trim()) {
      loadItems();
      return;
    }

    setLoading(true);
    try {
      const result = await searchItems(query, filters);
      setItems(result.items);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to search items',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStar = async (itemId: string) => {
    const isStarred = starredIds.has(itemId);
    try {
      await toggleStar(itemId, !isStarred);
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (isStarred) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
      notifications.show({
        title: isStarred ? 'Unstarred' : 'Starred',
        message: isStarred ? 'Removed from starred' : 'Added to starred',
        color: 'blue',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to toggle star',
        color: 'red',
      });
    }
  };

  const handleFollowup = async (itemId: string) => {
    const isFollowup = followupIds.has(itemId);
    try {
      await toggleFollowup(itemId, !isFollowup);
      setFollowupIds((prev) => {
        const next = new Set(prev);
        if (isFollowup) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
      notifications.show({
        title: isFollowup ? 'Removed' : 'Added',
        message: isFollowup ? 'Removed from reading list' : 'Added to reading list',
        color: 'blue',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to toggle follow-up',
        color: 'red',
      });
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
          Discover
        </Title>
        <Text c="dimmed">AI-curated content from GitHub, App Store, Reddit, and Discord</Text>
      </div>

      <SearchBar onSearch={handleSearch} />

      {items.length === 0 ? (
        <Center h={200}>
          <Text c="dimmed">No items found</Text>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              starred={starredIds.has(item.id)}
              followup={followupIds.has(item.id)}
              onStar={() => handleStar(item.id)}
              onFollowup={() => handleFollowup(item.id)}
              onAsk={() => setSelectedItem(item)}
            />
          ))}
        </SimpleGrid>
      )}

      {selectedItem && (
        <QAModal
          opened={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          item={selectedItem}
        />
      )}
    </Stack>
  );
}
