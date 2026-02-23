import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ApiKeyDialog from './ApiKeyDialog';
import { AuthType, SearchCategories } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';

// Mock useLocalize to just return the key
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

const mockRegister = (name: string) => ({
  onChange: jest.fn(),
  onBlur: jest.fn(),
  ref: jest.fn(),
  name,
});

const defaultProps = {
  isOpen: true,
  onOpenChange: jest.fn(),
  onSubmit: jest.fn(),
  onRevoke: jest.fn(),
  authTypes: [
    [SearchCategories.PROVIDERS, AuthType.USER_PROVIDED] as [string, AuthType],
    [SearchCategories.SCRAPERS, AuthType.USER_PROVIDED] as [string, AuthType],
  ],
  isToolAuthenticated: false,
  register: mockRegister as any,
  handleSubmit: (fn: any) => (e: any) => fn(e),
};

describe('ApiKeyDialog', () => {
  const mockUseGetStartupConfig = useGetStartupConfig as jest.Mock;

  afterEach(() => jest.clearAllMocks());

  it('shows provider + scraper dropdowns when no config is set', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: {} });
    render(<ApiKeyDialog {...defaultProps} />);
    // Provider dropdown button
    expect(
      screen.getByRole('button', { name: 'com_ui_web_search_provider_serper' }),
    ).toBeInTheDocument();
    // Scraper dropdown button
    expect(
      screen.getByRole('button', { name: 'com_ui_web_search_scraper_firecrawl' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('com_ui_web_search_reranker')).not.toBeInTheDocument();
  });

  it('shows static text for provider and only provider input if provider is set', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: { webSearch: { searchProvider: 'serper' } } });
    render(<ApiKeyDialog {...defaultProps} />);
    expect(screen.getByText('com_ui_web_search_provider_serper')).toBeInTheDocument();
    // Should not find a dropdown button for provider
    expect(screen.queryByRole('button', { name: /provider/i })).not.toBeInTheDocument();
  });

  it('shows Jina provider fields when selecting Jina provider', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: {} });
    render(<ApiKeyDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('com_ui_web_search_provider_jina'));
    expect(screen.getByPlaceholderText('com_ui_web_search_jina_key')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('com_ui_web_search_jina_url')).toBeInTheDocument();
  });

  it('does not render provider section if SYSTEM_DEFINED', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: {} });
    const props = {
      ...defaultProps,
      authTypes: [
        [SearchCategories.PROVIDERS, AuthType.SYSTEM_DEFINED],
        [SearchCategories.SCRAPERS, AuthType.USER_PROVIDED],
      ] as [string, AuthType][],
    };
    render(<ApiKeyDialog {...props} />);
    expect(screen.queryByText('com_ui_web_search_provider')).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_web_search_scraper')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_web_search_reranker')).not.toBeInTheDocument();
  });

  it('does not render scraper section if SYSTEM_DEFINED', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: {} });
    const props = {
      ...defaultProps,
      authTypes: [
        [SearchCategories.PROVIDERS, AuthType.USER_PROVIDED],
        [SearchCategories.SCRAPERS, AuthType.SYSTEM_DEFINED],
      ] as [string, AuthType][],
    };
    render(<ApiKeyDialog {...props} />);
    expect(screen.getByText('com_ui_web_search_provider')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_web_search_scraper')).not.toBeInTheDocument();
    expect(screen.queryByText('com_ui_web_search_reranker')).not.toBeInTheDocument();
  });
});
