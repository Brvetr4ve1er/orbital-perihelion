// ─────────────────────────────────────────────────────────────────────────────
// Graph System — useSearch Hook
// Debounced search and group filter management
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GraphNode, NodeGroup } from '../types';

interface UseSearchOptions {
  applyFilter: (predicate: (n: GraphNode) => boolean) => void;
  clearFilter: () => void;
}

export function useSearch({ applyFilter, clearFilter }: UseSearchOptions) {
  const [query, setQuery] = useState('');
  const [activeGroups, setActiveGroups] = useState<Set<NodeGroup>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const _applySearch = useCallback((q: string, groups: Set<NodeGroup>) => {
    const hasQuery = q.trim().length > 0;
    const hasGroupFilter = groups.size > 0;

    if (!hasQuery && !hasGroupFilter) {
      clearFilter();
      return;
    }

    const queryLower = q.toLowerCase();
    applyFilter((node) => {
      if (hasGroupFilter && !groups.has(node.group)) return false;
      if (hasQuery) {
        return node.label.toLowerCase().includes(queryLower) ||
          node.id.toLowerCase().includes(queryLower);
      }
      return true;
    });
  }, [applyFilter, clearFilter]);

  const handleQuery = useCallback((q: string) => {
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      _applySearch(q, activeGroups);
    }, 200); // 200ms debounce
  }, [activeGroups, _applySearch]);

  const toggleGroup = useCallback((group: NodeGroup) => {
    setActiveGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      // Apply immediately (no debounce needed for group toggles)
      clearTimeout(debounceRef.current);
      _applySearch(query, next);
      return next;
    });
  }, [query, _applySearch]);

  const resetAll = useCallback(() => {
    setQuery('');
    setActiveGroups(new Set());
    clearTimeout(debounceRef.current);
    clearFilter();
  }, [clearFilter]);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  return { query, activeGroups, handleQuery, toggleGroup, resetAll };
}
