import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { PresetDropdown } from './PresetDropdown';
import { HealthFrequencyPreset } from '../types/db.types';

const mockTheme = createTheme();

const mockPreset: HealthFrequencyPreset = {
  id: 'test-preset',
  name: 'Test Preset',
  frequency: 440,
  description: 'Test description',
  scientific_basis: 'Test scientific basis'
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {component}
    </ThemeProvider>
  );
};

describe('PresetDropdown', () => {
  it('should render without crashing', () => {
    renderWithTheme(<PresetDropdown />);
    
    expect(screen.getByText('Select Health Frequency')).toBeInTheDocument();
  });

  it('should display selected preset', () => {
    renderWithTheme(
      <PresetDropdown selectedPreset={mockPreset} />
    );
    
    expect(screen.getByText('Test Preset')).toBeInTheDocument();
    expect(screen.getByText('440Hz')).toBeInTheDocument();
  });

  it('should open dropdown menu when clicked', async () => {
    renderWithTheme(<PresetDropdown />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText('Brainwaves')).toBeInTheDocument();
      expect(screen.getByText('Solfeggio')).toBeInTheDocument();
      expect(screen.getByText('Natural')).toBeInTheDocument();
      expect(screen.getByText('Research')).toBeInTheDocument();
    });
  });

  it('should call onPresetSelect when a preset is selected', async () => {
    const mockOnPresetSelect = vi.fn();
    renderWithTheme(
      <PresetDropdown onPresetSelect={mockOnPresetSelect} />
    );
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      const gamma40Item = screen.getByText('Gamma 40Hz');
      fireEvent.click(gamma40Item);
    });
    
    expect(mockOnPresetSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'gamma40',
        frequency: 40,
        name: 'Gamma 40Hz'
      })
    );
  });

  it('should display frequency values correctly', async () => {
    renderWithTheme(<PresetDropdown />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText('40Hz')).toBeInTheDocument(); // Gamma 40Hz
      expect(screen.getByText('528Hz')).toBeInTheDocument(); // Solfeggio 528Hz
      expect(screen.getByText('432Hz')).toBeInTheDocument(); // Natural 432Hz
    });
  });

  it('should show warning disclaimer', async () => {
    renderWithTheme(<PresetDropdown />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/For wellness guidance only/)).toBeInTheDocument();
    });
  });

  it('should categorize presets correctly', async () => {
    renderWithTheme(<PresetDropdown />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      // Check category headers
      expect(screen.getByText('Brainwaves')).toBeInTheDocument();
      expect(screen.getByText('Solfeggio')).toBeInTheDocument();
      expect(screen.getByText('Natural')).toBeInTheDocument();
      expect(screen.getByText('Research')).toBeInTheDocument();
    });
  });

  it('should close menu when a preset is selected', async () => {
    renderWithTheme(<PresetDropdown />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      const gamma40Item = screen.getByText('Gamma 40Hz');
      fireEvent.click(gamma40Item);
    });
    
    // Menu should close
    await waitFor(() => {
      expect(screen.queryByText('Brainwaves')).not.toBeInTheDocument();
    });
  });

  it('should highlight selected preset in dropdown', async () => {
    const selectedPreset = {
      id: 'gamma40',
      name: 'Gamma 40Hz',
      frequency: 40,
      description: 'Cognitive enhancement and focus',
      scientific_basis: 'Studies on gamma waves and cognitive function'
    };

    renderWithTheme(
      <PresetDropdown selectedPreset={selectedPreset} />
    );
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      const gamma40Item = screen.getByText('Gamma 40Hz').closest('[role="menuitem"]');
      expect(gamma40Item).toHaveAttribute('aria-selected', 'true');
    });
  });
});