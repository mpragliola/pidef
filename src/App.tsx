// src/App.tsx
import React, { useEffect } from 'react';
import { AppProvider } from './AppProvider';
import { useAppContext } from './AppContext';
import { useIpc } from './hooks/useIpc';
import { Toolbar } from './components/Toolbar';
import { NavBar } from './components/NavBar';

function AppInner() {
  useIpc();
  const { rotationSteps } = useAppContext();

  useEffect(() => {
    document.body.classList.remove('rotate-90', 'rotate-180', 'rotate-270');
    if (rotationSteps === 1) document.body.classList.add('rotate-90');
    else if (rotationSteps === 2) document.body.classList.add('rotate-180');
    else if (rotationSteps === 3) document.body.classList.add('rotate-270');
  }, [rotationSteps]);

  return (
    <>
      <Toolbar />
      <NavBar />
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
