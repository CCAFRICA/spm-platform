'use client';

import { useState, useEffect } from 'react';

/**
 * HF-312 — is the Vialuce theme active? Reads `data-theme` (server-rendered on <html>) after mount.
 * Starts false so SSR/first-paint matches the non-Vialuce shell; flips true post-mount for Vialuce
 * users. Single detection used by the shell offset + the Vialuce topbar (mirrors ChromeSidebar's
 * inline OB-221 detection). Dark/Bliss return false → existing shell unchanged.
 */
export function useIsVialuce(): boolean {
  const [isVialuce, setIsVialuce] = useState(false);
  useEffect(() => {
    setIsVialuce(document.documentElement.getAttribute('data-theme') === 'vialuce');
  }, []);
  return isVialuce;
}
