/**
 * SearchBar Component
 *
 * Purpose:
 * - Semantic search input
 * - Filter controls (source, score, tags)
 */

import { TextInput, Select, NumberInput, Group, Button } from '@mantine/core';
import { IconSearch, IconFilter } from '@tabler/icons-react';
import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string, filters: {
    source?: string;
    minScore?: number;
  }) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [minScore, setMinScore] = useState<number | string>(0.5);

  const handleSearch = () => {
    onSearch(query, {
      source: source || undefined,
      minScore: typeof minScore === 'number' ? minScore : undefined,
    });
  };

  return (
    <Group gap="md" align="flex-end">
      <TextInput
        flex={1}
        placeholder="Search items semantically..."
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
      />

      <Select
        placeholder="Source"
        data={[
          { value: 'github', label: 'GitHub' },
          { value: 'appstore', label: 'App Store' },
          { value: 'reddit', label: 'Reddit' },
          { value: 'discord', label: 'Discord' },
        ]}
        value={source}
        onChange={setSource}
        clearable
        w={150}
      />

      <NumberInput
        placeholder="Min Score"
        value={minScore}
        onChange={setMinScore}
        min={0}
        max={1}
        step={0.1}
        w={120}
      />

      <Button onClick={handleSearch} leftSection={<IconFilter size={16} />}>
        Search
      </Button>
    </Group>
  );
}
