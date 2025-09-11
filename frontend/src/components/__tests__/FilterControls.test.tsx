import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FilterControls } from '../FilterControls';
import { FilterCriteria } from '../../types/analysis';

// No need to mock date pickers since we're using native HTML datetime-local inputs

describe('FilterControls', () => {
  const mockOnFiltersChange = vi.fn();
  const mockOnClearFilters = vi.fn();

  const defaultProps = {
    filters: {},
    onFiltersChange: mockOnFiltersChange,
    onClearFilters: mockOnClearFilters,
    isLoading: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders filter controls with all sections', () => {
    render(<FilterControls {...defaultProps} />);

    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Time Range')).toBeInTheDocument();
    expect(screen.getByText('Endpoints & Status Codes')).toBeInTheDocument();
    expect(screen.getByText('Client & User Agent Filters')).toBeInTheDocument();
  });

  it('displays active filter indicator when filters are applied', () => {
    const filtersWithData: FilterCriteria = {
      timeRange: {
        start: new Date('2023-12-01T00:00:00Z'),
        end: new Date('2023-12-02T00:00:00Z')
      },
      endpoints: ['/api/users']
    };

    render(<FilterControls {...defaultProps} filters={filtersWithData} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('does not show active indicator when no filters are applied', () => {
    render(<FilterControls {...defaultProps} />);

    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('renders date time inputs for time range', () => {
    render(<FilterControls {...defaultProps} />);

    expect(screen.getByLabelText('Start Time')).toBeInTheDocument();
    expect(screen.getByLabelText('End Time')).toBeInTheDocument();
  });

  it('renders endpoint input field', () => {
    render(<FilterControls {...defaultProps} />);

    expect(screen.getByLabelText('Endpoints (comma-separated)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('/api/users, /api/orders')).toBeInTheDocument();
  });

  it('renders status code select field', () => {
    render(<FilterControls {...defaultProps} />);

    expect(screen.getByLabelText('Status Codes')).toBeInTheDocument();
  });

  it('renders client IP input field', () => {
    render(<FilterControls {...defaultProps} />);

    expect(screen.getByLabelText('Client IPs (comma-separated)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('192.168.1.1, 10.0.0.0/8')).toBeInTheDocument();
  });

  it('renders user agent patterns input field', () => {
    render(<FilterControls {...defaultProps} />);

    expect(screen.getByLabelText('User Agent Patterns (comma-separated)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Chrome, Mobile, Bot')).toBeInTheDocument();
  });

  it('populates fields with existing filter values', () => {
    const existingFilters: FilterCriteria = {
      endpoints: ['/api/users', '/api/orders'],
      statusCodes: [200, 404],
      clientIps: ['192.168.1.1'],
      userAgentPatterns: ['Chrome', 'Mobile']
    };

    render(<FilterControls {...defaultProps} filters={existingFilters} />);

    expect(screen.getByDisplayValue('/api/users, /api/orders')).toBeInTheDocument();
    expect(screen.getByDisplayValue('192.168.1.1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Chrome, Mobile')).toBeInTheDocument();
  });

  it('calls onFiltersChange when Apply Filters button is clicked', async () => {
    const user = userEvent.setup();
    render(<FilterControls {...defaultProps} />);

    // Add some filter data
    const endpointInput = screen.getByLabelText('Endpoints (comma-separated)');
    await user.type(endpointInput, '/api/test');

    const applyButton = screen.getByText('Apply Filters');
    await user.click(applyButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      endpoints: ['/api/test']
    });
  });

  it('calls onClearFilters when Clear All button is clicked', async () => {
    const user = userEvent.setup();
    const filtersWithData: FilterCriteria = {
      endpoints: ['/api/users']
    };

    render(<FilterControls {...defaultProps} filters={filtersWithData} />);

    const clearButton = screen.getByText('Clear All');
    await user.click(clearButton);

    expect(mockOnClearFilters).toHaveBeenCalledTimes(1);
  });

  it('disables Clear All button when no filters are active', () => {
    render(<FilterControls {...defaultProps} />);

    const clearButton = screen.getByText('Clear All');
    expect(clearButton).toBeDisabled();
  });

  it('enables Clear All button when filters are active', () => {
    const filtersWithData: FilterCriteria = {
      endpoints: ['/api/users']
    };

    render(<FilterControls {...defaultProps} filters={filtersWithData} />);

    const clearButton = screen.getByText('Clear All');
    expect(clearButton).not.toBeDisabled();
  });

  it('disables buttons when loading', () => {
    const filtersWithData: FilterCriteria = {
      endpoints: ['/api/users']
    };

    render(<FilterControls {...defaultProps} filters={filtersWithData} isLoading={true} />);

    const clearButton = screen.getByText('Clear All');
    const applyButton = screen.getByText('Apply Filters');

    expect(clearButton).toBeDisabled();
    expect(applyButton).toBeDisabled();
  });

  it('handles endpoint input changes correctly', async () => {
    const user = userEvent.setup();
    render(<FilterControls {...defaultProps} />);

    const endpointInput = screen.getByLabelText('Endpoints (comma-separated)');
    await user.type(endpointInput, '/api/users, /api/orders');

    const applyButton = screen.getByText('Apply Filters');
    await user.click(applyButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      endpoints: ['/api/users', '/api/orders']
    });
  });

  it('handles client IP input changes correctly', async () => {
    const user = userEvent.setup();
    render(<FilterControls {...defaultProps} />);

    const clientIpInput = screen.getByLabelText('Client IPs (comma-separated)');
    await user.type(clientIpInput, '192.168.1.1, 10.0.0.1');

    const applyButton = screen.getByText('Apply Filters');
    await user.click(applyButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      clientIps: ['192.168.1.1', '10.0.0.1']
    });
  });

  it('handles user agent patterns input changes correctly', async () => {
    const user = userEvent.setup();
    render(<FilterControls {...defaultProps} />);

    const userAgentInput = screen.getByLabelText('User Agent Patterns (comma-separated)');
    await user.type(userAgentInput, 'Chrome, Firefox');

    const applyButton = screen.getByText('Apply Filters');
    await user.click(applyButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      userAgentPatterns: ['Chrome', 'Firefox']
    });
  });

  it('filters out empty values from comma-separated inputs', async () => {
    const user = userEvent.setup();
    render(<FilterControls {...defaultProps} />);

    const endpointInput = screen.getByLabelText('Endpoints (comma-separated)');
    await user.type(endpointInput, '/api/users, , /api/orders, ');

    const applyButton = screen.getByText('Apply Filters');
    await user.click(applyButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      endpoints: ['/api/users', '/api/orders']
    });
  });

  it('handles empty input by not including the filter', async () => {
    const user = userEvent.setup();
    render(<FilterControls {...defaultProps} />);

    const endpointInput = screen.getByLabelText('Endpoints (comma-separated)');
    await user.type(endpointInput, '   ');

    const applyButton = screen.getByText('Apply Filters');
    await user.click(applyButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({});
  });

  it('expands and collapses accordion sections', async () => {
    const user = userEvent.setup();
    render(<FilterControls {...defaultProps} />);

    // Time Range should be expanded by default
    expect(screen.getByTestId('date-picker-start-time')).toBeVisible();

    // Other sections should be collapsed initially
    const endpointsSection = screen.getByText('Endpoints & Status Codes');
    await user.click(endpointsSection);

    // After clicking, the section should expand
    await waitFor(() => {
      expect(screen.getByLabelText('Endpoints (comma-separated)')).toBeVisible();
    });
  });

  it('shows helper text for input fields', () => {
    render(<FilterControls {...defaultProps} />);

    expect(screen.getByText('Enter endpoint patterns to filter by')).toBeInTheDocument();
    expect(screen.getByText('Enter IP addresses or CIDR ranges')).toBeInTheDocument();
    expect(screen.getByText('Enter patterns to match in user agents')).toBeInTheDocument();
  });

  it('handles date input changes', async () => {
    render(<FilterControls {...defaultProps} />);

    const startDateInput = screen.getByLabelText('Start Time');
    const testDate = '2023-12-01T10:00';

    fireEvent.change(startDateInput, { target: { value: testDate } });

    const applyButton = screen.getByText('Apply Filters');
    fireEvent.click(applyButton);

    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      timeRange: {
        start: new Date(testDate)
      }
    });
  });
});