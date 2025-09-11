import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Typography, Paper, Chip } from '@mui/material';
import { FlowChartData, FlowChartNode, FlowChartEdge } from '../types/workflow';

// Custom node component for endpoints
const EndpointNode: React.FC<{ data: any }> = ({ data }) => {
  const getNodeColor = (type: string, dropOffRate?: number) => {
    switch (type) {
      case 'entry':
        return '#4caf50'; // Green for entry points
      case 'exit':
        return '#f44336'; // Red for exit points
      case 'dropoff':
        return '#ff9800'; // Orange for drop-off points
      default:
        // Color based on drop-off rate
        if (dropOffRate && dropOffRate > 0.3) {
          return '#ff5722'; // Deep orange for high drop-off
        } else if (dropOffRate && dropOffRate > 0.1) {
          return '#ff9800'; // Orange for medium drop-off
        }
        return '#2196f3'; // Blue for regular endpoints
    }
  };

  const backgroundColor = getNodeColor(data.type, data.dropOffRate);

  return (
    <Box
      sx={{
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor,
        color: 'white',
        minWidth: '120px',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        border: '2px solid rgba(255,255,255,0.2)',
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '12px' }}>
        {data.label}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.9 }}>
        {data.count.toLocaleString()} users
      </Typography>
      {data.percentage && (
        <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
          {data.percentage.toFixed(1)}%
        </Typography>
      )}
      {data.dropOffRate && (
        <Chip
          size="small"
          label={`${(data.dropOffRate * 100).toFixed(1)}% drop`}
          sx={{
            mt: 0.5,
            height: '16px',
            fontSize: '10px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: 'inherit',
          }}
        />
      )}
    </Box>
  );
};

// Node types mapping
const nodeTypes = {
  endpoint: EndpointNode,
  entry: EndpointNode,
  exit: EndpointNode,
  dropoff: EndpointNode,
};

interface WorkflowFlowChartProps {
  data: FlowChartData;
  onNodeClick?: (node: FlowChartNode) => void;
  onEdgeClick?: (edge: FlowChartEdge) => void;
  title?: string;
  height?: number;
}

const WorkflowFlowChart: React.FC<WorkflowFlowChartProps> = ({
  data,
  onNodeClick,
  onEdgeClick,
  title,
  height = 600
}) => {
  // Convert our data to React Flow format
  const initialNodes: Node[] = useMemo(() => 
    data.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      style: node.style,
    })), [data.nodes]
  );

  const initialEdges: Edge[] = useMemo(() => 
    data.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      animated: edge.animated || false,
      label: edge.label || `${(edge.data.probability * 100).toFixed(1)}%`,
      style: {
        strokeWidth: Math.max(1, edge.data.probability * 8), // Edge width based on probability
        stroke: '#666',
        ...edge.style,
      },
      labelStyle: {
        fontSize: '11px',
        fontWeight: 'bold',
        fill: '#333',
        ...edge.labelStyle,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 15,
        height: 15,
      },
      data: edge.data,
    })), [data.edges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  const onNodeClickHandler = useCallback((event: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      const originalNode = data.nodes.find(n => n.id === node.id);
      if (originalNode) {
        onNodeClick(originalNode);
      }
    }
  }, [onNodeClick, data.nodes]);

  const onEdgeClickHandler = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (onEdgeClick) {
      const originalEdge = data.edges.find(e => e.id === edge.id);
      if (originalEdge) {
        onEdgeClick(originalEdge);
      }
    }
  }, [onEdgeClick, data.edges]);

  if (!data.nodes.length) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No workflow data available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Process some log files to see workflow patterns
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
      
      <Paper sx={{ height, border: '1px solid #e0e0e0' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClickHandler}
          onEdgeClick={onEdgeClickHandler}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="#f5f5f5" gap={16} />
          <Controls />
          <MiniMap 
            nodeColor="#666"
            nodeStrokeWidth={3}
            zoomable
            pannable
          />
        </ReactFlow>
      </Paper>

      {/* Legend */}
      <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <Typography variant="caption" sx={{ mr: 2 }}>Legend:</Typography>
        <Chip size="small" sx={{ backgroundColor: '#4caf50', color: 'white' }} label="Entry Points" />
        <Chip size="small" sx={{ backgroundColor: '#2196f3', color: 'white' }} label="Regular Flow" />
        <Chip size="small" sx={{ backgroundColor: '#ff9800', color: 'white' }} label="Drop-off Points" />
        <Chip size="small" sx={{ backgroundColor: '#f44336', color: 'white' }} label="Exit Points" />
        <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>
          Edge thickness indicates transition probability
        </Typography>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        💡 Drag nodes to rearrange • Click nodes/edges for details • Use controls to zoom and pan
      </Typography>
    </Box>
  );
};

export default WorkflowFlowChart;