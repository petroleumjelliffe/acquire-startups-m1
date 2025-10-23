// src/components/YourTurnIndicator.tsx
import React from 'react';

export const YourTurnIndicator: React.FC = () => {
  return (
    <div className="your-turn-indicator">
      <div className="your-turn-indicator-content">
        <span className="your-turn-indicator-icon">👉</span>
        <span className="your-turn-indicator-text">It's your turn now!</span>
      </div>
    </div>
  );
};
