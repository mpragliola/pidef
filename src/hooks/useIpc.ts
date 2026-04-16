// src/hooks/useIpc.ts
import { useEffect } from 'react';
import { useAppContext } from '../AppContext';

const pidef = (window as any).pidef;

export function useIpc() {
  const { loadFile } = useAppContext();

  useEffect(() => {
    pidef.onOpenFile((path: string) => {
      loadFile(path);
    });
    pidef.onToggleFullscreen(() => {
      pidef.toggleFullscreen();
    });
  }, [loadFile]);
}
