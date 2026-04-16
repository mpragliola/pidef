/**
 * WelcomeScreen.tsx
 *
 * The landing screen that fills the viewport whenever no PDF is currently
 * loaded. It shows a brief usage hint and a list of recently opened files so
 * the user can quickly re-open something without going through the file dialog.
 *
 * The component is always rendered in the component tree but returns `null`
 * when a PDF is open, so it effectively appears and disappears in place
 * without unmounting/remounting between opens.
 */

import React, { useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';

/** Shape of a single entry in the recent-files list returned by the main process. */
interface FileRecord {
  /** Absolute filesystem path to the PDF. */
  path: string;
  /** The page number that was active when the file was last closed. */
  page: number;
}

/** Electron preload bridge — typed as `any` because it lives outside TypeScript's reach. */
const pidef = (window as any).pidef;

/**
 * WelcomeScreen — shown when no PDF is loaded; hidden (null render) while one is open.
 *
 * Fetches the recent-files list from the main process over IPC and displays each
 * entry as a clickable row. Clicking a row calls `loadFile` from the app context,
 * which opens the PDF and causes this component to disappear (see null guard below).
 */
export function WelcomeScreen() {
  const { pdfDoc, loadFile } = useAppContext();
  const [recentFiles, setRecentFiles] = useState<FileRecord[]>([]);

  useEffect(() => {
    // Re-fetch the recent-files list whenever `pdfDoc` changes.
    // This covers two cases in a single effect:
    //   • PDF opened  → pdfDoc becomes non-null; we refresh so the newly opened
    //     file appears in the list next time the screen is shown.
    //   • PDF closed  → pdfDoc becomes null; the welcome screen re-appears and
    //     we want the list to be up-to-date immediately.
    pidef.getRecentFiles().then(setRecentFiles);
  }, [pdfDoc]); // re-fetch when PDF opened or closed

  // Conditional render guard: while a PDF is loaded this component has nothing
  // to show, so return null to leave the canvas visible without unmounting the
  // component (keeps the effect registered and preserves recent-files state).
  if (pdfDoc) return null;

  return (
    <div id="welcome-screen">
      <div id="welcome-hint">Open a PDF to start reading</div>
      <div id="recent-files-section">
        <div id="recent-files-label">Recent Files</div>
        <ul id="recent-files-list">
          {recentFiles.map(f => {
            // Strip the directory path and show only the filename as the primary label.
            const filename = f.path.split('/').pop() || f.path;
            return (
              <li key={f.path} onClick={() => loadFile(f.path)}>
                <div className="filename">{filename}</div>
                <div className="filepath">{f.path}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
