import React, { useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';

interface FileRecord {
  path: string;
  page: number;
}

const pidef = (window as any).pidef;

export function WelcomeScreen() {
  const { pdfDoc, loadFile } = useAppContext();
  const [recentFiles, setRecentFiles] = useState<FileRecord[]>([]);

  useEffect(() => {
    pidef.getRecentFiles().then(setRecentFiles);
  }, [pdfDoc]); // re-fetch when PDF opened or closed

  if (pdfDoc) return null;

  return (
    <div id="welcome-screen">
      <div id="welcome-hint">Open a PDF to start reading</div>
      <div id="recent-files-section">
        <div id="recent-files-label">Recent Files</div>
        <ul id="recent-files-list">
          {recentFiles.map(f => {
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
