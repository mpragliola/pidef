import React from 'react';

const BRIGHTNESS_MIN = 0.1;
const BRIGHTNESS_MAX = 1.0;

interface Props {
  brightness: number;
  visible: boolean;
}

export function BrightnessHud({ brightness, visible }: Props) {
  const pct = ((brightness - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN)) * 100;
  return (
    <div id="brightness-hud" className={visible ? 'visible' : ''}>
      <div id="brightness-fill" style={{ height: `${pct.toFixed(1)}%` }} />
    </div>
  );
}
