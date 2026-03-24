import { useState, DragEvent } from 'react';

interface DragDropHandlers {
  onDragStart: (event: DragEvent, data: string) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent, onDropCallback: (data: string) => void) => void;
  isDragging: boolean;
}

export function useDragAndDrop(): DragDropHandlers {
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = (event: DragEvent, data: string) => {
    event.dataTransfer.setData('text/plain', data);
    setIsDragging(true);
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const onDrop = (event: DragEvent, onDropCallback: (data: string) => void) => {
    event.preventDefault();
    const data = event.dataTransfer.getData('text/plain');
    onDropCallback(data);
    setIsDragging(false);
  };

  return {
    onDragStart,
    onDragOver,
    onDrop,
    isDragging,
  };
}
