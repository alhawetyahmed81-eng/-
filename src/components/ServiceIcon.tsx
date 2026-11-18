import React from 'react';
import {
  Building2,
  Compass,
  Cpu,
  Droplets,
  Grid,
  Hammer,
  Layers,
  Maximize2,
  PaintRoller,
  Shield,
  Sparkles,
  Umbrella,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  Droplets,
  PaintRoller,
  Hammer,
  Compass,
  Layers,
  Grid,
  Maximize2,
  Wind,
  Cpu,
  Shield,
  Building2,
  Umbrella,
  Sparkles,
  Wrench,
};

export const ServiceIcon: React.FC<{ name: string; className?: string }> = ({
  name,
  className = 'w-5 h-5',
}) => {
  const Icon = ICON_MAP[name] || Wrench;
  return <Icon className={className} />;
};
