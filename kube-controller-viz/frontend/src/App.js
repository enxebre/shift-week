import React, { useState, useEffect } from 'react';
import ControllerViz from './components/ControllerViz';
import ControlPanel from './components/ControlPanel';
import { fetchControllerState } from './utils/api-client';

function App() {
  const [controllerState, setControllerState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    loadControllerState();
    
    // Set up polling if needed
    if (isPlaying) {
      const interval = setInterval(loadControllerState, 5000);
      return () => clearInterval(interval);
    }
  }, [isPlaying]);

  const loadControllerState = async () => {
    try {
      setIsLoading(true);
      const data = await fetchControllerState();
      setControllerState(data);
      setError(null);
    } catch (err) {
      setError(`Failed to load controller state: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSpeedChange = (newSpeed) => {
    setSpeed(newSpeed);
  };

  const handleRefresh = () => {
    loadControllerState();
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Kubernetes Controller Visualization</h1>
        {isLoading && <span>Loading...</span>}
        {error && <span className="error">{error}</span>}
      </header>
      
      <ControlPanel 
        isPlaying={isPlaying}
        speed={speed}
        onPlayPause={handlePlayPause}
        onSpeedChange={handleSpeedChange}
        onRefresh={handleRefresh}
      />
      
      <div className="visualization-container">
        {controllerState && (
          <ControllerViz 
            controllerState={controllerState} 
            isPlaying={isPlaying}
            speed={speed}
          />
        )}
        
        {controllerState && (
          <div className="stats-panel">
            <h3>Controller Stats</h3>
            <div className="stats-item">
              <span>Queue Length:</span>
              <span>{controllerState.queueLength}</span>
            </div>
            <div className="stats-item">
              <span>Processing Rate:</span>
              <span>{controllerState.processingRate.toFixed(2)} events/sec</span>
            </div>
            <div className="stats-item">
              <span>Events:</span>
              <span>{controllerState.events.length}</span>
            </div>
            <div className="stats-item">
              <span>Reconcile Steps:</span>
              <span>{controllerState.recentSteps.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App; 