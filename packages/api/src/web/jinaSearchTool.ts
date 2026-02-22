import axios from 'axios';
import { tool } from '@langchain/core/tools';
import { Tools } from 'librechat-data-provider';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { SearchResultData } from 'librechat-data-provider';

type SearchResultCallbacks = {
  onSearchResults?: (result: JinaSearchResult, runnableConfig?: RunnableConfig) => void;
  onGetHighlights?: (link: string) => void;
};

type LoggerLike = {
  debug: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string, error?: unknown) => void;
};

export type JinaSearchResult = {
  success: boolean;
  data?: SearchResultData;
  error?: string;
};

export type JinaSearchToolConfig = SearchResultCallbacks & {
  jinaApiKey?: string;
  jinaApiUrl?: string;
  logger?: LoggerLike;
  maxResults?: number;
};

export type JinaSearchToolParams = {
  query: string;
  date?: string;
  country?: string;
  images?: boolean;
  videos?: boolean;
  news?: boolean;
};

type OrganicResult = NonNullable<SearchResultData['organic']>[number];

type ParsedResult = {
  title: string;
  link: string;
  snippet: string;
};

const DEFAULT_JINA_API_URL = 'https://s.jina.ai/';
const DEFAULT_RESULT_LIMIT = 8;

const linkLinePattern =
  /^\s*(?:[-*+]|\d+[.)])?\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*(?:[-:]\s*(.*))?$/i;
const referenceLinePattern = /^\s*\[([^\]]+)\]:\s*(https?:\/\/\S+)\s*$/i;
const indexedTitlePattern = /^\[(\d+)\]\s+Title:\s*(.+)$/i;
const indexedUrlPattern = /^\[(\d+)\]\s+URL Source:\s*(https?:\/\/\S+)$/i;
const indexedDescriptionPattern = /^\[(\d+)\]\s+Description:\s*(.+)$/i;

const defaultLogger: LoggerLike = {
  debug: (message: string) => console.debug(message),
  warn: (message: string) => console.warn(message),
  error: (message: string, error?: unknown) => console.error(message, error),
};

function normalizeApiUrl(apiUrl?: string): string {
  if (!apiUrl || apiUrl.trim() === '') {
    return DEFAULT_JINA_API_URL;
  }

  const trimmed = apiUrl.trim();
  if (trimmed === '') {
    return DEFAULT_JINA_API_URL;
  }

  return trimmed;
}

function buildAttribution(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function createEmptySearchData(turn: number, error?: string): SearchResultData {
  return {
    turn,
    organic: [],
    topStories: [],
    images: [],
    videos: [],
    news: [],
    relatedSearches: [],
    references: [],
    error,
  };
}

function cleanSnippetLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseJinaMarkdownResults(
  markdown: string,
  maxResults = DEFAULT_RESULT_LIMIT,
): ParsedResult[] {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const indexedResultsMap = new Map<number, ParsedResult>();
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const titleMatch = line.match(indexedTitlePattern);
    if (titleMatch) {
      const index = Number.parseInt(titleMatch[1] ?? '', 10);
      if (!Number.isNaN(index)) {
        const existing = indexedResultsMap.get(index);
        indexedResultsMap.set(index, {
          title: titleMatch[2]?.trim() || existing?.title || 'Untitled result',
          link: existing?.link ?? '',
          snippet: existing?.snippet ?? '',
        });
      }
      continue;
    }

    const urlMatch = line.match(indexedUrlPattern);
    if (urlMatch) {
      const index = Number.parseInt(urlMatch[1] ?? '', 10);
      if (!Number.isNaN(index)) {
        const existing = indexedResultsMap.get(index);
        indexedResultsMap.set(index, {
          title: existing?.title || 'Untitled result',
          link: urlMatch[2]?.trim() || existing?.link || '',
          snippet: existing?.snippet ?? '',
        });
      }
      continue;
    }

    const descriptionMatch = line.match(indexedDescriptionPattern);
    if (descriptionMatch) {
      const index = Number.parseInt(descriptionMatch[1] ?? '', 10);
      if (!Number.isNaN(index)) {
        const existing = indexedResultsMap.get(index);
        const description = cleanSnippetLine(descriptionMatch[2] ?? '');
        const combinedSnippet = [existing?.snippet, description].filter(Boolean).join(' ').trim();

        indexedResultsMap.set(index, {
          title: existing?.title || 'Untitled result',
          link: existing?.link ?? '',
          snippet: combinedSnippet.slice(0, 320),
        });
      }
    }
  }

  if (indexedResultsMap.size > 0) {
    return Array.from(indexedResultsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value)
      .filter((result) => result.link !== '')
      .slice(0, maxResults);
  }

  const results: ParsedResult[] = [];
  const seenLinks = new Set<string>();
  let current: ParsedResult | null = null;

  const pushCurrent = () => {
    if (!current || !current.link || seenLinks.has(current.link)) {
      current = null;
      return;
    }

    results.push({
      title: current.title,
      link: current.link,
      snippet: current.snippet,
    });
    seenLinks.add(current.link);
    current = null;
  };

  for (const rawLine of lines) {
    if (results.length >= maxResults) {
      break;
    }

    const line = rawLine.trim();
    if (line === '' || line === '---' || line.startsWith('```') || line.startsWith('#')) {
      continue;
    }

    const linkLine = line.match(linkLinePattern);
    if (linkLine) {
      pushCurrent();
      current = {
        title: linkLine[1]?.trim() || linkLine[2]?.trim() || 'Untitled result',
        link: linkLine[2]?.trim() || '',
        snippet: cleanSnippetLine(linkLine[3] ?? ''),
      };
      continue;
    }

    const referenceLine = line.match(referenceLinePattern);
    if (referenceLine) {
      pushCurrent();
      current = {
        title: referenceLine[1]?.trim() || referenceLine[2]?.trim() || 'Untitled result',
        link: referenceLine[2]?.trim() || '',
        snippet: '',
      };
      continue;
    }

    if (current == null) {
      continue;
    }

    if (line.startsWith('![') || line.startsWith('>')) {
      continue;
    }

    const snippetLine = cleanSnippetLine(line);
    if (!snippetLine) {
      continue;
    }

    if (current.snippet.length === 0) {
      current.snippet = snippetLine;
      continue;
    }

    const combined = `${current.snippet} ${snippetLine}`.trim();
    current.snippet = combined.slice(0, 320);
  }

  pushCurrent();

  return results.slice(0, maxResults);
}

function toOrganicResults(parsed: ParsedResult[]): OrganicResult[] {
  return parsed.map((result, index) => ({
    position: index + 1,
    title: result.title,
    link: result.link,
    snippet: result.snippet,
    attribution: buildAttribution(result.link),
  }));
}

function formatSearchOutput(organicResults: OrganicResult[], query: string): string {
  if (organicResults.length === 0) {
    return `No web results were found for "${query}".`;
  }

  return organicResults
    .map((result, index) => {
      const heading = `${index + 1}. ${result.title || result.link || 'Untitled result'}`;
      const urlLine = result.link ? `URL: ${result.link}` : '';
      const snippetLine = result.snippet ? `Snippet: ${result.snippet}` : '';
      return [heading, urlLine, snippetLine].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

const jinaSearchSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      description: 'The search query string.',
    },
    date: {
      type: 'string',
      description: 'Optional recency filter. Ignored for Jina provider.',
    },
    country: {
      type: 'string',
      description: 'Optional country code filter. Ignored for Jina provider.',
    },
    images: {
      type: 'boolean',
      description: 'Image search toggle. Ignored for Jina provider.',
    },
    videos: {
      type: 'boolean',
      description: 'Video search toggle. Ignored for Jina provider.',
    },
    news: {
      type: 'boolean',
      description: 'News search toggle. Ignored for Jina provider.',
    },
  },
  required: ['query'],
} as const;

export function createJinaSearchTool(config: JinaSearchToolConfig = {}) {
  const logger = config.logger ?? defaultLogger;
  const apiKey = config.jinaApiKey ?? process.env.JINA_API_KEY;
  const apiUrl = normalizeApiUrl(config.jinaApiUrl ?? process.env.JINA_API_URL);
  const maxResults = config.maxResults ?? DEFAULT_RESULT_LIMIT;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('JINA_API_KEY is required for Jina web search');
  }

  return tool(
    async (rawParams, runnableConfig) => {
      const params = rawParams as JinaSearchToolParams;
      const query = params.query?.trim();
      const turn = runnableConfig.toolCall?.turn ?? 0;

      if (!query) {
        const errorData = createEmptySearchData(turn, 'Query cannot be empty');
        return [errorData.error ?? 'Query cannot be empty', { [Tools.web_search]: errorData }];
      }

      try {
        const response = await axios.get<string>(apiUrl, {
          params: { q: query },
          timeout: 10000,
          responseType: 'text',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'X-Respond-With': 'no-content',
          },
        });

        const markdown =
          typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const parsedResults = parseJinaMarkdownResults(markdown, maxResults);
        const organicResults = toOrganicResults(parsedResults);

        const searchData: SearchResultData = {
          ...createEmptySearchData(turn),
          organic: organicResults,
          references: organicResults.map((result) => ({
            type: 'link',
            link: result.link,
            title: result.title,
            attribution: result.attribution,
          })),
        };

        config.onSearchResults?.({ success: true, data: searchData }, runnableConfig);

        for (const result of organicResults) {
          if (result.link) {
            config.onGetHighlights?.(result.link);
          }
        }

        const output = formatSearchOutput(organicResults, query);
        return [output, { [Tools.web_search]: searchData }];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('[createJinaSearchTool] Jina search request failed', error);

        config.onSearchResults?.({ success: false, error: message }, runnableConfig);

        const errorData = createEmptySearchData(turn, `Jina search failed: ${message}`);
        return [errorData.error ?? 'Jina search failed', { [Tools.web_search]: errorData }];
      }
    },
    {
      name: Tools.web_search,
      responseFormat: 'content_and_artifact',
      description:
        'Searches the web using Jina Search and returns top results with links and snippets.',
      schema: jinaSearchSchema,
    },
  );
}
