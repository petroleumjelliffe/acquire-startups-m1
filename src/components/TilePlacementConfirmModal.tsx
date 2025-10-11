// src/components/TilePlacementConfirmModal.tsx
import React from 'react';
import { Coord } from '../utils/gameHelpers';

interface TilePlacementConfirmModalProps {
  tile: Coord;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TilePlacementConfirmModal: React.FC<TilePlacementConfirmModalProps> = ({
  tile,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Confirm Tile Placement</h2>
        <p className="text-gray-700 mb-6">
          Place tile <span className="font-bold text-blue-600">{tile}</span>?
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
