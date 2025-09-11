import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { TrafficChart } from '../TrafficChart';
import { TimeSeries } from '../../../types/analysis';

// Mock recharts components
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: ({ name }: any) => <div data-testid="line">{name}</div>,
  XAxis: ({ dataKey }: any) => <div data-testid="x-axis">{dataKey}</div>,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>
}));

// Mock date-fns
vi.mock('date-fns', () => ({
  format: vi.fn((date, formatStr) => {
    if (formatStr === 'HH:mm') return '14:30';
    if (formatStr === 'MMM dd, yyyy HH:mm:ss') return 'Dec 03, 2023 14:30:00';
    return '2023-12-03';
  })
}));

describe('TrafficChart', () => {
  const mockData: TimeSeries[] = [
    { timestamp: new Date('2023-12-03T14:00:00Z'), value: 100 },
    { timestamp: new Date('2023-12-03T14:01:00Z'), value: 150 },
    { timestamp: new Date('2023-12-03T14:02:00Z'), value: 120 }
  ];

  it('renders chart with title', () => {
    render(<TrafficChart data={mockData} title="Test Traffic Chart" />);

    expect(screen.getByText('Test Traffic Chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders chart components', () => {
    render(<TrafficChart data={mockData} title="Test Chart" />);

    expect(screen.getByTestId('line')).toBeInTheDocument();
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('uses default time format when not specified', () => {
    render(<TrafficChart data={mockData} title="Test Chart" />);

    // The format function should be called with 'HH:mm' (default)
    expect(vi.mocked(require('date-fns').format)).toHaveBeenCalledWith(
      expect.any(Date),
      'HH:mm'
    );
  });

  it('uses custom time format when specified', () => {
    render(<TrafficChart data={mockData} title="Test Chart" timeFormat="yyyy-MM-dd" />);

    expect(vi.mocked(require('date-fns').format)).toHaveBeenCalledWith(
      expect.any(Date),
      'yyyy-MM-dd'
    );
  });

  it('applies custom height when specified', () => {
    const { container } = render(
      <TrafficChart data={mockData} title="Test Chart" height={400} />
    );

    const heightBox = container.querySelector('[style*="height: 400px"]');
    expect(heightBox).toBeInTheDocument();
  });

  it('uses default height when not specified', () => {
    const { container } = render(<TrafficChart data={mockData} title="Test Chart" />);

    const heightBox = container.querySelector('[style*="height: 300px"]');
    expect(heightBox).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    render(<TrafficChart data={[]} title="Empty Chart" />);

    expect(screen.getByText('Empty Chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders within a Material-UI Card', () => {
    render(<TrafficChart data={mockData} title="Test Chart" />);

    // Check for MUI Card structure
    const cardContent = screen.getByText('Test Chart').closest('[class*="MuiCardContent"]');
    expect(cardContent).toBeInTheDocument();
  });
});