import React from 'react';
import { GameProvider } from './context/GameContext';
import { Desktop } from './components/desktop/Desktop';

function App() {
  return (
    <GameProvider>
      <Desktop />
    </GameProvider>
  );
}

export default App;
