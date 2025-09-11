import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { Box, Typography, Paper } from '@mui/material';
import { SankeyData, SankeyNode, SankeyLink } from '../types/workflow';

interface SankeyDiagramProps {
  data: SankeyData;
  width?: number;
  height?: number;
  onNodeClick?: (node: SankeyNode) => void;
  onLinkClick?: (link: SankeyLink) => void;
  title?: string;
}

interface D3SankeyNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  value: number;
  level: number;
  category: string;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
}

interface D3SankeyLink {
  source: D3SankeyNode;
  target: D3SankeyNode;
  value: number;
  probability: number;
  y0?: number;
  y1?: number;
  width?: number;
}

const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  data,
  width = 800,
  height = 500,
  onNodeClick,
  onLinkClick,
  title
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create container group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Convert data to D3 sankey format
    const nodes: D3SankeyNode[] = data.nodes.map(node => ({
      ...node,
      index: data.nodes.findIndex(n => n.id === node.id)
    }));

    const links: D3SankeyLink[] = data.links.map(link => {
      const sourceIndex = nodes.findIndex(n => n.id === link.source);
      const targetIndex = nodes.findIndex(n => n.id === link.target);
      
      return {
        source: nodes[sourceIndex],
        target: nodes[targetIndex],
        value: link.value,
        probability: link.probability
      };
    });

    // Create sankey generator
    const sankeyGenerator = sankey<D3SankeyNode, D3SankeyLink>()
      .nodeWidth(20)
      .nodePadding(10)
      .extent([[0, 0], [innerWidth, innerHeight]]);

    // Generate sankey layout
    const { nodes: sankeyNodes, links: sankeyLinks } = sankeyGenerator({
      nodes,
      links
    });

    // Color scale for categories
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Draw links
    const linksGroup = g.append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(sankeyLinks)
      .enter().append('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('fill', 'none')
      .attr('stroke', (d) => {
        const opacity = Math.max(0.1, d.probability);
        return d3.color(colorScale(d.source.category))?.darker(0.3) || '#999';
      })
      .attr('stroke-opacity', (d) => Math.max(0.1, d.probability * 0.7))
      .attr('stroke-width', (d) => Math.max(1, d.width || 0))
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        // Highlight on hover
        d3.select(this)
          .attr('stroke-opacity', 0.8)
          .attr('stroke-width', (d.width || 0) + 2);

        // Show tooltip
        const tooltip = d3.select('body').append('div')
          .attr('class', 'sankey-tooltip')
          .style('position', 'absolute')
          .style('padding', '8px')
          .style('background', 'rgba(0, 0, 0, 0.8)')
          .style('color', 'white')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('z-index', 1000)
          .html(`
            <div><strong>${d.source.label} → ${d.target.label}</strong></div>
            <div>Users: ${d.value.toLocaleString()}</div>
            <div>Probability: ${(d.probability * 100).toFixed(1)}%</div>
          `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function(event, d) {
        // Remove highlight
        d3.select(this)
          .attr('stroke-opacity', Math.max(0.1, d.probability * 0.7))
          .attr('stroke-width', d.width || 0);

        // Remove tooltip
        d3.select('.sankey-tooltip').remove();
      })
      .on('click', (event, d) => {
        if (onLinkClick) {
          onLinkClick({
            source: d.source.id,
            target: d.target.id,
            value: d.value,
            probability: d.probability
          });
        }
      });

    // Draw nodes
    const nodesGroup = g.append('g')
      .attr('class', 'nodes')
      .selectAll('rect')
      .data(sankeyNodes)
      .enter().append('rect')
      .attr('x', d => d.x0 || 0)
      .attr('y', d => d.y0 || 0)
      .attr('width', d => (d.x1 || 0) - (d.x0 || 0))
      .attr('height', d => (d.y1 || 0) - (d.y0 || 0))
      .attr('fill', d => colorScale(d.category))
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        // Highlight on hover
        d3.select(this).attr('fill', d3.color(colorScale(d.category))?.brighter(0.5) || colorScale(d.category));

        // Show tooltip
        const tooltip = d3.select('body').append('div')
          .attr('class', 'sankey-tooltip')
          .style('position', 'absolute')
          .style('padding', '8px')
          .style('background', 'rgba(0, 0, 0, 0.8)')
          .style('color', 'white')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('z-index', 1000)
          .html(`
            <div><strong>${d.label}</strong></div>
            <div>Users: ${d.value.toLocaleString()}</div>
            <div>Level: ${d.level}</div>
            <div>Category: ${d.category}</div>
          `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function(event, d) {
        // Remove highlight
        d3.select(this).attr('fill', colorScale(d.category));

        // Remove tooltip
        d3.select('.sankey-tooltip').remove();
      })
      .on('click', (event, d) => {
        if (onNodeClick) {
          onNodeClick({
            id: d.id,
            label: d.label,
            value: d.value,
            level: d.level,
            category: d.category
          });
        }
      });

    // Add node labels
    g.append('g')
      .attr('class', 'node-labels')
      .selectAll('text')
      .data(sankeyNodes)
      .enter().append('text')
      .attr('x', d => (d.x0 || 0) < innerWidth / 2 ? (d.x1 || 0) + 6 : (d.x0 || 0) - 6)
      .attr('y', d => ((d.y0 || 0) + (d.y1 || 0)) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => (d.x0 || 0) < innerWidth / 2 ? 'start' : 'end')
      .text(d => d.label)
      .style('font-size', '12px')
      .style('font-family', 'Arial, sans-serif')
      .style('fill', '#333')
      .style('pointer-events', 'none');

    // Add value labels on nodes
    g.append('g')
      .attr('class', 'value-labels')
      .selectAll('text')
      .data(sankeyNodes)
      .enter().append('text')
      .attr('x', d => (d.x0 || 0) + ((d.x1 || 0) - (d.x0 || 0)) / 2)
      .attr('y', d => ((d.y0 || 0) + (d.y1 || 0)) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .text(d => d.value > 50 ? d.value.toLocaleString() : '') // Only show large values
      .style('font-size', '10px')
      .style('font-family', 'Arial, sans-serif')
      .style('fill', 'white')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none');

  }, [data, width, height, onNodeClick, onLinkClick]);

  if (!data.nodes.length) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No workflow data available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Process some log files to see user flow patterns
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {title && (
        <Typography variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
      <Paper sx={{ p: 2 }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ border: '1px solid #e0e0e0' }}
        />
        
        {/* Legend */}
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            💡 Hover over nodes and links for details • Click to drill down
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default SankeyDiagram;