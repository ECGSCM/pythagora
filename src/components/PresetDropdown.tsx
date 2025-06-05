import React, { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  Chip
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Science as ScienceIcon,
  Favorite as FavoriteIcon,
  Nature as NatureIcon,
  Psychology as PsychologyIcon
} from '@mui/icons-material';
import { HealthFrequencyPreset } from '../types/db.types';

interface PresetDropdownProps {
  onPresetSelect?: (preset: HealthFrequencyPreset) => void;
  selectedPreset?: HealthFrequencyPreset | null;
}

const presetCategories = {
  brainwaves: {
    name: 'Brainwaves',
    icon: <PsychologyIcon />,
    presets: [
      {
        id: 'gamma40',
        name: 'Gamma 40Hz',
        frequency: 40,
        description: 'Cognitive enhancement and focus',
        scientific_basis: 'Studies on gamma waves and cognitive function'
      },
      {
        id: 'beta20',
        name: 'Beta 20Hz',
        frequency: 20,
        description: 'Alert concentration state',
        scientific_basis: 'Associated with active thinking and problem solving'
      },
      {
        id: 'alpha10',
        name: 'Alpha 10Hz',
        frequency: 10,
        description: 'Relaxed awareness',
        scientific_basis: 'Linked to calm, relaxed mental state'
      },
      {
        id: 'theta6',
        name: 'Theta 6Hz',
        frequency: 6,
        description: 'Deep meditation and creativity',
        scientific_basis: 'Associated with deep meditation and REM sleep'
      }
    ]
  },
  solfeggio: {
    name: 'Solfeggio',
    icon: <FavoriteIcon />,
    presets: [
      {
        id: 'solfeggio396',
        name: '396Hz - Liberation',
        frequency: 396,
        description: 'Release fear and guilt',
        scientific_basis: 'Traditional healing frequency'
      },
      {
        id: 'solfeggio417',
        name: '417Hz - Change',
        frequency: 417,
        description: 'Facilitate positive change',
        scientific_basis: 'Associated with breaking negative patterns'
      },
      {
        id: 'solfeggio528',
        name: '528Hz - Love',
        frequency: 528,
        description: 'Love and DNA repair',
        scientific_basis: 'Research on stress hormone reduction'
      },
      {
        id: 'solfeggio639',
        name: '639Hz - Connection',
        frequency: 639,
        description: 'Enhance relationships',
        scientific_basis: 'Promotes harmony and communication'
      },
      {
        id: 'solfeggio741',
        name: '741Hz - Expression',
        frequency: 741,
        description: 'Self-expression and solutions',
        scientific_basis: 'Supports problem-solving abilities'
      },
      {
        id: 'solfeggio852',
        name: '852Hz - Intuition',
        frequency: 852,
        description: 'Spiritual awareness',
        scientific_basis: 'Associated with higher consciousness'
      }
    ]
  },
  natural: {
    name: 'Natural',
    icon: <NatureIcon />,
    presets: [
      {
        id: 'schumann783',
        name: 'Schumann 7.83Hz',
        frequency: 7.83,
        description: 'Earth resonance frequency',
        scientific_basis: 'Matches Earth\'s electromagnetic field'
      },
      {
        id: 'tuning432',
        name: 'A=432Hz',
        frequency: 432,
        description: 'Natural tuning standard',
        scientific_basis: 'Some studies suggest relaxation benefits'
      },
      {
        id: 'fibonacci144',
        name: 'Fibonacci 144Hz',
        frequency: 144,
        description: 'Sacred geometry frequency',
        scientific_basis: 'Based on mathematical patterns in nature'
      }
    ]
  },
  scientific: {
    name: 'Research',
    icon: <ScienceIcon />,
    presets: [
      {
        id: 'healing110',
        name: '110Hz - Healing',
        frequency: 110,
        description: 'Archaeological healing frequency',
        scientific_basis: 'Found in ancient healing chambers'
      },
      {
        id: 'rife1550',
        name: 'Rife 1550Hz',
        frequency: 1550,
        description: 'Cellular regeneration',
        scientific_basis: 'Based on Rife frequency research'
      }
    ]
  }
};

export const PresetDropdown: React.FC<PresetDropdownProps> = ({
  onPresetSelect,
  selectedPreset
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handlePresetSelect = (preset: HealthFrequencyPreset) => {
    onPresetSelect?.(preset);
    handleClose();
  };

  return (
    <>
      <Button
        variant="outlined"
        onClick={handleClick}
        endIcon={<ExpandMoreIcon />}
        sx={{
          minWidth: 200,
          justifyContent: 'space-between',
          textTransform: 'none'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {selectedPreset ? (
            <>
              <Chip 
                label={`${selectedPreset.frequency}Hz`} 
                size="small" 
                color="primary" 
              />
              <Typography variant="body2">
                {selectedPreset.name}
              </Typography>
            </>
          ) : (
            <Typography variant="body2">
              Select Health Frequency
            </Typography>
          )}
        </Box>
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            maxHeight: 400,
            width: 350
          }
        }}
      >
        {Object.entries(presetCategories).map(([categoryKey, category]) => (
          <div key={categoryKey}>
            <MenuItem disabled>
              <ListItemIcon>
                {category.icon}
              </ListItemIcon>
              <ListItemText>
                <Typography variant="subtitle2" fontWeight="bold">
                  {category.name}
                </Typography>
              </ListItemText>
            </MenuItem>
            
            {category.presets.map((preset) => (
              <MenuItem
                key={preset.id}
                onClick={() => handlePresetSelect(preset)}
                selected={selectedPreset?.id === preset.id}
                sx={{ pl: 4 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip 
                        label={`${preset.frequency}Hz`} 
                        size="small" 
                        variant="outlined"
                      />
                      <Typography variant="body2">
                        {preset.name}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {preset.description}
                    </Typography>
                  }
                />
              </MenuItem>
            ))}
            
            <Divider />
          </div>
        ))}
        
        <MenuItem onClick={handleClose} sx={{ justifyContent: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            ⚠️ For wellness guidance only - not medical treatment
          </Typography>
        </MenuItem>
      </Menu>
    </>
  );
};