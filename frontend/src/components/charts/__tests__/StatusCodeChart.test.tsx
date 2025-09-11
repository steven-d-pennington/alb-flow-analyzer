import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { StatusCodeChart } from '../StatusCodeChart';
import { StatusCodeStats } from '../../../types/analysis';

// Mock recharts components
vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }: any) => <div data-testid="pie">{JSON.stringify(data)}</div>,
  Cell: ({ fill }: any) => <div data-testid="cell" style={{ backgroundColor: fill }} />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />
}));

describe('StatusCodeChart', () => {
  const mockData: StatusCodeStats[] = [
    { statusCode: 200, count: 8000, percentage: 80.0 },
    { statusCode: 404, count: 1500, percentage: 15.0 },
    { statusCode: 500, count: 500, percentage: 5.0 }
  ];

  it('renders chart with title', () => {
    render(<StatusCodeChart data={mockData} />);

    expect(screen.getByText('Status Code Distribution')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders chart components', () => {
    render(<StatusCodeChart data={mockData} />);

    expect(screen.getByTestId('pie')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('transforms data correctly for chart', () => {
    render(<StatusCodeChart data={mockData} />);

    const pieElement = screen.getByTestId('pie');
    const pieData = JSON.parse(pieElement.textContent || '[]');

    expect(pieData).toHaveLength(3);
    expect(pieData[0]).toEqual({
      name: '200',
      value: 8000,
      percentage: 80.0,
      category: '2xx'
    });
    expect(pieData[1]).toEqual({
      name: '404',
      value: 1500,
      percentage: 15.0,
      category: '4xx'
    });
    expect(pieData[2]).toEqual({
      name: '500',
      value: 500,
      percentage: 5.0,
      category: '5xx'
    });
  });

  it('categorizes status codes correctly', () => {
    const testData: StatusCodeStats[] = [
      { statusCode: 201, count: 100, percentage: 10 }, // 2xx
      { statusCode: 301, count: 100, percentage: 10 }, // 3xx
      { statusCode: 401, count: 100, percentage: 10 }, // 4xx
      { statusCode: 502, count: 100, percentage: 10 }, // 5xx
      { statusCode: 100, count: 100, percentage: 10 }  // other
    ];

    render(<StatusCodeChart data={testData} />);

    const pieElement = screen.getByTestId('pie');
    const pieData = JSON.parse(pieElement.textContent || '[]');

    expect(pieData[0].category).toBe('2xx');
    expect(pieData[1].category).toBe('3xx');
    expect(pieData[2].category).toBe('4xx');
    expect(pieData[3].category).toBe('5xx');
    expect(pieData[4].category).toBe('other');
  });

  it('applies custom height when specified', () => {
    const { container } = render(<StatusCodeChart data={mockData} height={400} />);

    const heightBox = container.querySelector('[style*="height: 400px"]');
    expect(heightBox).toBeInTheDocument();
  });

  it('uses default height when not specified', () => {
    const { container } = render(<StatusCodeChart data={mockData} />);

    const heightBox = container.querySelector('[style*="height: 300px"]');
    expect(heightBox).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    render(<StatusCodeChart data={[]} />);

    expect(screen.getByText('Status Code Distribution')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders within a Material-UI Card', () => {
    render(<StatusCodeChart data={mockData} />);

    const cardContent = screen.getByText('Status Code Distribution').closest('[class*="MuiCardContent"]');
    expect(cardContent).toBeInTheDocument();
  });

  it('handles single status code', () => {
    const singleData: StatusCodeStats[] = [
      { statusCode: 200, count: 1000, percentage: 100.0 }
    ];

    render(<StatusCodeChart data={singleData} />);

    const pieElement = screen.getByTestId('pie');
    const pieData = JSON.parse(pieElement.textContent || '[]');

    expect(pieData).toHaveLength(1);
    expect(pieData[0].name).toBe('200');
    expect(pieData[0].value).toBe(1000);
    expect(pieData[0].percentage).toBe(100.0);
  });
});