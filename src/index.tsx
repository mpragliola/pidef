/**
 * src/index.tsx
 *
 * Vite entry point for the renderer process.
 *
 * In Electron the renderer process is essentially a Chromium browser tab.
 * Vite bundles this file (and all its imports) into dist/renderer.js, which
 * is loaded by src/index.html.  Everything that happens in React — state,
 * events, PDF rendering — originates from this file.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// `document.getElementById('root')` is typed as `HTMLElement | null` by
// TypeScript because it cannot statically prove the element exists.  The
// non-null assertion (!) is safe here because:
//   1. src/index.html always contains <div id="root"></div>.
//   2. This script is deferred / placed at the bottom of <body>, so the DOM
//      is fully parsed before this code runs.
// If the element were somehow missing, the `!` would surface a clear crash
// at createRoot() rather than a silent null-pointer later.
const container = document.getElementById('root')!;

// createRoot() is the React 18 API for concurrent-mode rendering.
// It takes the host DOM node and returns a root object whose .render() method
// mounts the React tree into that node.
const root = createRoot(container);
root.render(<App />);
