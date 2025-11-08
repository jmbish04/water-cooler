/**
 * MarqueeBadges Component
 *
 * Purpose:
 * - Display scrolling marquee of quote badges from content
 * - Extract interesting snippets from summaries/reasons
 * - Clickable to navigate to the source item
 */

import { Badge, Group } from '@mantine/core';
import { Item } from '../lib/api';
import { useEffect, useState } from 'react';
import './MarqueeBadges.css';

interface MarqueeBadgesProps {
  items: Item[];
  onBadgeClick: (item: Item) => void;
}

export default function MarqueeBadges({ items, onBadgeClick }: MarqueeBadgesProps) {
  const [quotes, setQuotes] = useState<Array<{ item: Item; quote: string }>>([]);

  useEffect(() => {
    // Extract interesting quotes from items
    const extractedQuotes = items.map((item) => ({
      item,
      quote: extractQuote(item),
    }));
    setQuotes(extractedQuotes);
  }, [items]);

  if (quotes.length === 0) return null;

  return (
    <div className="marquee-container">
      <div className="marquee-content">
        <Group gap="md" wrap="nowrap">
          {quotes.map((quote, index) => (
            <Badge
              key={`${quote.item.id}-${index}`}
              size="lg"
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan', deg: 45 }}
              style={{ cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              onClick={() => onBadgeClick(quote.item)}
            >
              "{quote.quote}"
            </Badge>
          ))}
          {/* Duplicate for seamless loop */}
          {quotes.map((quote, index) => (
            <Badge
              key={`${quote.item.id}-dup-${index}`}
              size="lg"
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan', deg: 45 }}
              style={{ cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              onClick={() => onBadgeClick(quote.item)}
            >
              "{quote.quote}"
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
