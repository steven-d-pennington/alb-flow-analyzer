import React, { useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Chip,
  Button,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  SelectChangeEvent
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { FilterCriteria } from '../types/analysis';

interface FilterControlsProps {
  filters: FilterCriteria;
  onFiltersChange: (filters: FilterCriteria) => void;
  onClearFilters: () => void;
  isLoading?: boolean;
}

const COMMON_STATUS_CODES = [200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503, 504];

export const FilterControls: React.FC<FilterControlsProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  isLoading = false
}) => {
  const [localFilters, setLocalFilters] = useState<FilterCriteria>(filters);

  const handleTimeRangeChange = useCallback((field: 'start' | 'end', value: Date | null) => {
    if (!value) return;
    
    const currentTimeRange = localFilters.timeRange || { start: undefined, end: undefined };
    const updatedTimeRange = {
      ...currentTimeRange,
      [field]: value
    };
    
    // Only set timeRange if both start and end are defined
    const newFilters = {
      ...localFilters,
      timeRange: updatedTimeRange.start && updatedTimeRange.end ? { start: updatedTimeRange.start, end: updatedTimeRange.end } : undefined
    };
    setLocalFilters(newFilters);
  }, [localFilters]);

  const handleEndpointsChange = useCallback((value: string) => {
    const endpoints = value.split(',').map(e => e.trim()).filter(e => e.length > 0);
    const newFilters = {
      ...localFilters,
      endpoints: endpoints.length > 0 ? endpoints : undefined
    };
    setLocalFilters(newFilters);
  }, [localFilters]);

  const handleStatusCodesChange = useCallback((event: SelectChangeEvent<number[]>) => {
    const value = event.target.value as number[];
    const newFilters = {
      ...localFilters,
      statusCodes: value.length > 0 ? value : undefined
    };
    setLocalFilters(newFilters);
  }, [localFilters]);

  const handleClientIpsChange = useCallback((value: string) => {
    const ips = value.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
    const newFilters = {
      ...localFilters,
      clientIps: ips.length > 0 ? ips : undefined
    };
    setLocalFilters(newFilters);
  }, [localFilters]);

  const handleUserAgentPatternsChange = useCallback((value: string) => {
    const patterns = value.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const newFilters = {
      ...localFilters,
      userAgentPatterns: patterns.length > 0 ? patterns : undefined
    };
    setLocalFilters(newFilters);
  }, [localFilters]);

  const handleApplyFilters = useCallback(() => {
    onFiltersChange(localFilters);
  }, [localFilters, onFiltersChange]);

  const handleClearFilters = useCallback(() => {
    const emptyFilters: FilterCriteria = {};
    setLocalFilters(emptyFilters);
    onClearFilters();
  }, [onClearFilters]);

  const hasActiveFilters = Object.keys(filters).some(key => {
    const value = filters[key as keyof FilterCriteria];
    return value !== undefined && (Array.isArray(value) ? value.length > 0 : true);
  });

  return (
    <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <FilterListIcon />
              <Typography variant="h6">Filters</Typography>
              {hasActiveFilters && (
                <Chip 
                  label="Active" 
                  color="primary" 
                  size="small" 
                />
              )}
            </Box>
            <Button
              variant="outlined"
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
              disabled={!hasActiveFilters || isLoading}
              size="small"
            >
              Clear All
            </Button>
          </Box>

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Time Range</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Start Time"
                    type="datetime-local"
                    value={localFilters.timeRange?.start ? 
                      localFilters.timeRange.start.toISOString().slice(0, 16) : ''}
                    onChange={(e) => handleTimeRangeChange('start', 
                      e.target.value ? new Date(e.target.value) : null)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="End Time"
                    type="datetime-local"
                    value={localFilters.timeRange?.end ? 
                      localFilters.timeRange.end.toISOString().slice(0, 16) : ''}
                    onChange={(e) => handleTimeRangeChange('end', 
                      e.target.value ? new Date(e.target.value) : null)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Endpoints & Status Codes</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Endpoints (comma-separated)"
                    placeholder="/api/users, /api/orders"
                    value={localFilters.endpoints?.join(', ') || ''}
                    onChange={(e) => handleEndpointsChange(e.target.value)}
                    helperText="Enter endpoint patterns to filter by"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status Codes</InputLabel>
                    <Select
                      multiple
                      value={localFilters.statusCodes || []}
                      onChange={handleStatusCodesChange}
                      input={<OutlinedInput label="Status Codes" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => (
                            <Chip key={value} label={value} size="small" />
                          ))}
                        </Box>
                      )}
                    >
                      {COMMON_STATUS_CODES.map((code) => (
                        <MenuItem key={code} value={code}>
                          {code}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Client & User Agent Filters</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Client IPs (comma-separated)"
                    placeholder="192.168.1.1, 10.0.0.0/8"
                    value={localFilters.clientIps?.join(', ') || ''}
                    onChange={(e) => handleClientIpsChange(e.target.value)}
                    helperText="Enter IP addresses or CIDR ranges"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label="User Agent Patterns (comma-separated)"
                    placeholder="Chrome, Mobile, Bot"
                    value={localFilters.userAgentPatterns?.join(', ') || ''}
                    onChange={(e) => handleUserAgentPatternsChange(e.target.value)}
                    helperText="Enter patterns to match in user agents"
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Box mt={3} display="flex" gap={2}>
            <Button
              variant="contained"
              onClick={handleApplyFilters}
              disabled={isLoading}
              startIcon={<FilterListIcon />}
            >
              Apply Filters
            </Button>
          </Box>
        </CardContent>
      </Card>
  );
};