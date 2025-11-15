/**
 * Discover Page
 *
 * Purpose:
 * - Display all curated items grouped by source
 * - Search and filter
 * - Marquee badges with quote blurbs per section
 */

import { useEffect, useState, useMemo } from 'react';
import { Stack, Title, Text, Loader, Center, SimpleGrid, Divider, Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fetchItems, searchItems, toggleStar, toggleFollowup, Item } from '../lib/api';
import SearchBar from '../components/SearchBar';
import ItemCard from '../components/ItemCard';
import ChatInterface from '../components/ChatInterface';
import MarqueeBadges from '../components/MarqueeBadges';

const SOURCE_ORDER = ['github', 'reddit', 'discord', 'appstore', 'igdux', 'other'] as const;
type SourceType = (typeof SOURCE_ORDER)[number];

type GroupedItems = Record<SourceType, Item[]>;

const SOURCE_LABELS: Record<SourceType, string> = {
  github: 'GitHub',
  reddit: 'Reddit',
  discord: 'Discord',
  appstore: 'App Store',
  igdux: 'Igdux',
  other: 'Other Sources',
};

const isSourceType = (value: string): value is SourceType =>
  SOURCE_ORDER.includes(value as SourceType);

export default function Discover() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [followupIds, setFollowupIds] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [initialQuestion, setInitialQuestion] = useState<string | undefined>(undefined);
  const [searchActive, setSearchActive] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  // Group items by source
  const groupedItems = useMemo<GroupedItems>(() => {
    const groups = SOURCE_ORDER.reduce<GroupedItems>((acc, key) => {
      acc[key] = [];
      return acc;
    }, {} as GroupedItems);

    const inferSource = (item: Item): SourceType => {
      const metaSource = typeof item.metadata?.source === 'string' ? item.metadata.source.toLowerCase() : null;
      if (metaSource && isSourceType(metaSource)) {
        return metaSource;
      }

      const url = item.url.toLowerCase();
      if (url.includes('github.com')) return 'github';
      if (url.includes('reddit.com')) return 'reddit';
      if (url.includes('discord.com') || url.includes('discord.gg')) return 'discord';
      if (url.includes('itunes.apple.com') || url.includes('apps.apple.com')) return 'appstore';
      if (url.includes('igdux.com')) return 'igdux';
      return 'other';
    };

    items.forEach((item) => {
      const source = inferSource(item);
      groups[source].push(item);
    });

    return groups;
  }, [items]);

  const loadItems = async () => {
    try {
      const result = await fetchItems({});
      setItems(result.items);
      setSearchActive(false);
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
    if (!query.trim() && !filters.source) {
      loadItems();
      return;
    }

    setLoading(true);
    setSearchActive(true);
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

  const handleBadgeClick = (item: Item) => {
    // Scroll to the item and highlight it
    const element = document.getElementById(`item-${item.id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.boxShadow = '0 0 20px rgba(66, 153, 225, 0.6)';
      setTimeout(() => {
        element.style.boxShadow = '';
      }, 2000);
    }
  };

  const handleAsk = (item: Item, question?: string) => {
    setSelectedItem(item);
    setInitialQuestion(question);
  };

  const handleCloseChat = () => {
    setSelectedItem(null);
    setInitialQuestion(undefined);
  };

  if (loading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  // If search is active, show flat list
  if (searchActive) {
    return (
      <Stack gap="xl">
        <div>
          <Title order={2} mb="xs">
            Search Results
          </Title>
          <Text c="dimmed">Found {items.length} items</Text>
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
                onAsk={(question) => handleAsk(item, question)}
              />
            ))}
          </SimpleGrid>
        )}

        {selectedItem && (
          <ChatInterface
            item={selectedItem}
            onClose={handleCloseChat}
            initialQuestion={initialQuestion}
          />
        )}
      </Stack>
    );
  }

  // Normal view: grouped by source
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
        <Stack gap="xl">
          {SOURCE_ORDER.map((source) => {
            const sourceItems = groupedItems[source];
            if (sourceItems.length === 0) return null;

            return (
              <Box key={source}>
                <Title order={3} mb="md">
                  {SOURCE_LABELS[source]}
                </Title>

                <MarqueeBadges items={sourceItems} onBadgeClick={handleBadgeClick} />

                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                  {sourceItems.map((item) => (
                    <div key={item.id} id={`item-${item.id}`} style={{ transition: 'box-shadow 0.3s' }}>
                      <ItemCard
                        item={item}
                        starred={starredIds.has(item.id)}
                        followup={followupIds.has(item.id)}
                        onStar={() => handleStar(item.id)}
                        onFollowup={() => handleFollowup(item.id)}
                        onAsk={(question) => handleAsk(item, question)}
                      />
                    </div>
                  ))}
                </SimpleGrid>

                {source !== SOURCE_ORDER[SOURCE_ORDER.length - 1] && <Divider my="xl" />}
              </Box>
            );
          })}
        </Stack>
      )}

      {selectedItem && (
        <ChatInterface
          item={selectedItem}
          onClose={handleCloseChat}
          initialQuestion={initialQuestion}
        />
      )}
    </Stack>
  );
}
