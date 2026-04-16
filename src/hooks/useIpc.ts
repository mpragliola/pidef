/**
 * src/hooks/useIpc.ts
 *
 * IPC (Inter-Process Communication) bridge between Electron's main process
 * and this renderer process.
 *
 * In Electron, the main process handles OS-level concerns: the native menu,
 * file dialogs, the application lifecycle, fullscreen toggling, etc.  When
 * the user picks "Open file" from the native menu or drops a file onto the
 * dock icon, the main process sends an IPC message to the renderer.
 *
 * The preload script (src/preload.ts) exposes a safe, sandboxed `window.pidef`
 * API that wraps ipcRenderer.on() listeners.  This hook calls those listeners
 * once on mount so that the React world reacts to OS-level events.
 */

import { useEffect } from 'react';
import { useAppContext } from '../AppContext';

// Cast window.pidef to `any` because its shape is defined in preload.ts and
// is not included in the TypeScript project's type declarations.
const pidef = (window as any).pidef;

/**
 * Wires up Electron IPC event handlers for the lifetime of the component
 * that calls this hook (typically the root <App> component).
 *
 * Handlers registered:
 *   - `onOpenFile`         — fires when the main process wants the renderer to
 *                            open a specific file (e.g. from the native menu or
 *                            a CLI argument).  Delegates to `loadFile` from
 *                            the app context.
 *   - `onToggleFullscreen` — fires when the main process requests a fullscreen
 *                            toggle (e.g. F11 accelerator handled in main.ts).
 *                            Calls back into `pidef.toggleFullscreen()` which
 *                            asks the main process to actually resize the window.
 */
export function useIpc() {
  const { loadFile } = useAppContext();

  useEffect(() => {
    pidef.onOpenFile((path: string) => {
      loadFile(path);
    });
    pidef.onToggleFullscreen(() => {
      pidef.toggleFullscreen();
    });

    // No cleanup / unsubscribe is needed here.
    //
    // The preload's ipcRenderer.on() registration is set-and-forget: the
    // native IPC channel only exists while the BrowserWindow is alive, so
    // there is nothing to leak.  When the window is closed the entire renderer
    // process is torn down, which implicitly clears all listeners.
    //
    // Re-registering on every render would stack duplicate listeners, which is
    // why the effect intentionally has no return value and the dependency array
    // below is tightly scoped.
  }, [loadFile]);
  // `loadFile` is in the dependency array so that if AppProvider ever replaces
  // the callback (e.g. after a full context reset), the handler is re-registered
  // pointing at the fresh function reference rather than a stale closure.
}
