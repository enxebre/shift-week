import React from 'react';

const ControlPanel = ({ isPlaying, speed, onPlayPause, onSpeedChange, onRefresh }) => {
  return (
    <div className="control-panel">
      <button onClick={onPlayPause}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      
      <div>
        <label htmlFor="speed-slider">Speed: {speed}x</label>
        <input
          id="speed-slider"
          type="range"
          min="0.1"
          max="3"
          step="0.1"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          style={{ marginLeft: '10px', width: '100px' }}
        />
      </div>
      
      <button onClick={onRefresh}>
        Refresh
      </button>
    </div>
  );
};

export default ControlPanel; 