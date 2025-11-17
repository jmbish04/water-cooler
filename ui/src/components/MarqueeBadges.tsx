/**
 * MarqueeBadges Component
 *
 * Purpose:
 * - Display scrolling marquee of quote badges from content
 * - Extract interesting snippets from summaries/reasons
 * - Clickable to navigate to the source item
 */

import { Badge, Group, Text } from '@mantine/core';
import { Item } from '../lib/api';
import { useEffect, useState } from 'react';
import './MarqueeBadges.css';

interface MarqueeBadgesProps {
  items: Item[];
  onBadgeClick: (item: Item) => void;
}

export default function MarqueeBadges({ items, onBadgeClick }: MarqueeBadgesProps) {
  const [badges, setBadges] = useState<Array<{ item: Item; label: string }>>([]);

  useEffect(() => {
    const uniqueBadges: Array<{ item: Item; label: string }> = [];
    const seen = new Set<string>();

    // Prefer curated tags
    items.forEach((item) => {
      if (item.tags && item.tags.length > 0) {
        item.tags.forEach((tag) => {
          const normalized = tag.trim();
          if (!normalized) return;
          const key = normalized.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          uniqueBadges.push({ item, label: normalized });
        });
      }
    });

    // Fallback to short quotes when tags are sparse
    if (uniqueBadges.length === 0) {
      items.forEach((item) => {
        const quote = extractQuote(item);
        const key = quote.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueBadges.push({ item, label: quote });
        }
      });
    }

    setBadges(uniqueBadges);
  }, [items]);

  if (badges.length === 0) {
    return (
      <div className="marquee-container">
        <div className="marquee-content single">
          <Text size="sm" c="dimmed">
            No tags available yet.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="marquee-container">
      <div className="marquee-content">
        <Group gap="md" wrap="nowrap">
          {badges.map((badge, index) => (
            <Badge
              key={`${badge.item.id}-${index}`}
              size="lg"
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan', deg: 45 }}
              style={{ cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              onClick={() => onBadgeClick(badge.item)}
            >
              {badge.label}
            </Badge>
          ))}
          {/* Duplicate for seamless loop */}
          {badges.map((badge, index) => (
            <Badge
              key={`${badge.item.id}-dup-${index}`}
              size="lg"
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan', deg: 45 }}
              style={{ cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              onClick={() => onBadgeClick(badge.item)}
            >
              {badge.label}
            </Badge>
          ))}
        </Group>
      </div>
    </div>
  );
}

/**
 * Extract a short quote from an item
 */
function extractQuote(item: Item): string {
  // Try to extract from reason first (usually concise)
  if (item.reason) {
    const cleaned = item.reason.trim();
    if (cleaned.length <= 80) return cleaned;
    return cleaned.substring(0, 77) + '...';
  }

  // Try to extract from summary
  if (item.summary) {
    const sentences = item.summary.split(/[.!?]+/);
    if (sentences[0] && sentences[0].length <= 80) {
      return sentences[0].trim();
    }
    return item.summary.substring(0, 77) + '...';
  }

  // Fallback to tags
  if (item.tags && item.tags.length > 0) {
    return item.tags.slice(0, 3).join(', ');
  }

  // Last resort: truncated title
  if (item.title.length <= 80) return item.title;
  return item.title.substring(0, 77) + '...';
}
