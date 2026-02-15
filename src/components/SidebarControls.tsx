import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Divider,
  Chip,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  VolumeUp as VolumeIcon
} from '@mui/icons-material';
import { PatchNode, HealthFrequencyPreset } from '../types/db.types';

interface SidebarControlsProps {
  selectedNode: PatchNode | null;
  onNodeUpdate?: (nodeId: string, updates: Partial<PatchNode>) => void;
  onNodeDelete?: (nodeId: string) => void;
  onMasterVolumeChange?: (volume: number) => void;
  onHealthFrequencyActivate?: (preset: HealthFrequencyPreset) => void;
  masterVolume?: number;
}

const healthFrequencyPresets: HealthFrequencyPreset[] = [
  {
    id: 'gamma40',
    name: 'Gamma 40Hz',
    frequency: 40,
    description: 'Gamma brain waves - cognitive enhancement',
    scientific_basis: 'Studies suggest 40Hz may help with memory and focus'
  },
  {
    id: 'solfeggio528',
    name: 'Solfeggio 528Hz',
    frequency: 528,
    description: 'Love frequency - stress reduction',
    scientific_basis: 'Research indicates potential for stress hormone reduction'
  },
  {
    id: 'tuning432',
    name: 'Natural 432Hz',
    frequency: 432,
    description: 'Natural tuning - relaxation',
    scientific_basis: 'Some studies suggest lower heart rate response'
  },
  {
    id: 'schumann783',
    name: 'Schumann 7.83Hz',
    frequency: 7.83,
    description: 'Earth resonance - grounding',
    scientific_basis: 'Matches Earth\'s electromagnetic frequency'
  }
];

export const SidebarControls: React.FC<SidebarControlsProps> = React.memo(({
  selectedNode,
  onNodeUpdate,
  onNodeDelete,
  onMasterVolumeChange,
  onHealthFrequencyActivate,
  masterVolume = -12
}) => {
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const handleParamChange = (param: string, value: any) => {
    if (!selectedNode || !onNodeUpdate) return;

    const updatedParams = { ...selectedNode.params, [param]: value };
    onNodeUpdate(selectedNode.id, { params: updatedParams });
  };

  const handlePresetActivate = (preset: HealthFrequencyPreset) => {
    setActivePreset(preset.id);
    onHealthFrequencyActivate?.(preset);
  };

  const handleKeyDown = (event: React.KeyboardEvent, preset: HealthFrequencyPreset) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePresetActivate(preset);
    }
  };

  const renderNodeControls = () => {
    if (!selectedNode) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          Select a node to edit its parameters
        </Typography>
      );
    }

    const { type, params } = selectedNode;

    switch (type) {
      case 'osc':
        return (
          <>
            <Typography variant="h6" gutterBottom>
              Oscillator
            </Typography>
            
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Waveform</InputLabel>
              <Select
                value={params.waveform || 'sine'}
                onChange={(e) => handleParamChange('waveform', e.target.value)}
              >
                <MenuItem value="sine">Sine</MenuItem>
                <MenuItem value="square">Square</MenuItem>
                <MenuItem value="sawtooth">Sawtooth</MenuItem>
                <MenuItem value="triangle">Triangle</MenuItem>
              </Select>
            </FormControl>

            <Typography gutterBottom>Frequency: {params.frequency || 440}Hz</Typography>
            <Slider
              value={params.frequency || 440}
              onChange={(_, value) => handleParamChange('frequency', value)}
              min={20}
              max={2000}
              step={1}
              sx={{ mb: 2 }}
            />

            <Typography gutterBottom>Volume: {params.volume || -20}dB</Typography>
            <Slider
              value={params.volume || -20}
              onChange={(_, value) => handleParamChange('volume', value)}
              min={-60}
              max={0}
              step={1}
              sx={{ mb: 2 }}
            />
          </>
        );

      case 'filter':
        return (
          <>
            <Typography variant="h6" gutterBottom>
              Filter
            </Typography>
            
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={params.type || 'lowpass'}
                onChange={(e) => handleParamChange('type', e.target.value)}
              >
                <MenuItem value="lowpass">Low Pass</MenuItem>
                <MenuItem value="highpass">High Pass</MenuItem>
                <MenuItem value="bandpass">Band Pass</MenuItem>
                <MenuItem value="notch">Notch</MenuItem>
              </Select>
            </FormControl>

            <Typography gutterBottom>Cutoff: {params.cutoff || 1000}Hz</Typography>
            <Slider
              value={params.cutoff || 1000}
              onChange={(_, value) => handleParamChange('cutoff', value)}
              min={20}
              max={20000}
              step={10}
              scale={(x) => x}
              sx={{ mb: 2 }}
            />

            <Typography gutterBottom>Resonance: {params.resonance || 1}</Typography>
            <Slider
              value={params.resonance || 1}
              onChange={(_, value) => handleParamChange('resonance', value)}
              min={0.1}
              max={10}
              step={0.1}
              sx={{ mb: 2 }}
            />
          </>
        );

      case 'reverb':
        return (
          <>
            <Typography variant="h6" gutterBottom>
              Reverb
            </Typography>
            
            <Typography gutterBottom>Decay: {params.decay || 2}s</Typography>
            <Slider
              value={params.decay || 2}
              onChange={(_, value) => handleParamChange('decay', value)}
              min={0.1}
              max={10}
              step={0.1}
              sx={{ mb: 2 }}
            />

            <Typography gutterBottom>Wet: {params.wet || 0.3}</Typography>
            <Slider
              value={params.wet || 0.3}
              onChange={(_, value) => handleParamChange('wet', value)}
              min={0}
              max={1}
              step={0.01}
              sx={{ mb: 2 }}
            />
          </>
        );

      case 'delay':
        return (
          <>
            <Typography variant="h6" gutterBottom>
              Delay
            </Typography>
            
            <Typography gutterBottom>Time: {params.time || 0.2}s</Typography>
            <Slider
              value={params.time || 0.2}
              onChange={(_, value) => handleParamChange('time', value)}
              min={0.01}
              max={2}
              step={0.01}
              sx={{ mb: 2 }}
            />
          </>
        );

      default:
        return (
          <Typography variant="body2" color="text.secondary">
            No parameters available for {type}
          </Typography>
        );
    }
  };

  return (
    <Box sx={{ width: 320, height: '100%', display: 'flex', flexDirection: 'column' }} role="complementary" aria-label="Sidebar controls">
      {/* Master Volume */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <VolumeIcon sx={{ mr: 1 }} aria-hidden="true" />
            <Typography variant="h6">Master Volume</Typography>
          </Box>

          <Typography gutterBottom id="master-volume-label">Volume: {masterVolume}dB</Typography>
          <Slider
            value={masterVolume}
            onChange={(_, value) => onMasterVolumeChange?.(value as number)}
            min={-60}
            max={0}
            step={1}
            aria-labelledby="master-volume-label"
            aria-label="Master volume control"
          />
        </CardContent>
      </Card>

      {/* Health Frequencies */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom id="health-freq-title">
            Health Frequencies
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Therapeutic frequencies for wellness (guidance only)
          </Typography>

          <Box
            sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
            role="group"
            aria-labelledby="health-freq-title"
          >
            {healthFrequencyPresets.map((preset) => (
              <Tooltip key={preset.id} title={preset.scientific_basis} arrow>
                <Button
                  variant={activePreset === preset.id ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => handlePresetActivate(preset)}
                  onKeyDown={(e) => handleKeyDown(e, preset)}
                  sx={{ justifyContent: 'flex-start' }}
                  aria-label={`Activate ${preset.name} - ${preset.description}`}
                  aria-pressed={activePreset === preset.id}
                >
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="body2" fontWeight="bold">
                      {preset.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {preset.description}
                    </Typography>
                  </Box>
                </Button>
              </Tooltip>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Node Parameters */}
      <Card sx={{ flexGrow: 1 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <SettingsIcon sx={{ mr: 1 }} aria-hidden="true" />
              <Typography variant="h6">Node Parameters</Typography>
            </Box>

            {selectedNode && (
              <Tooltip title="Delete Node">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => onNodeDelete?.(selectedNode.id)}
                  aria-label={`Delete ${selectedNode.type} node`}
                >
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {selectedNode && (
            <Chip
              label={selectedNode.type.toUpperCase()}
              size="small"
              color="primary"
              sx={{ mb: 2 }}
            />
          )}

          <Divider sx={{ mb: 2 }} />

          {renderNodeControls()}
        </CardContent>
      </Card>
    </Box>
  );
});
SidebarControls.displayName = 'SidebarControls';