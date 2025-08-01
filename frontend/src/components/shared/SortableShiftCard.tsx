import { FC } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ShiftCard } from './ShiftCard';
import { Schedule as ScheduleType } from '@/types';

interface SortableShiftCardProps {
  schedule: ScheduleType;
  onClick: () => void;
}

export const SortableShiftCard: FC<SortableShiftCardProps> = ({ schedule, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: schedule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ShiftCard schedule={schedule} onClick={onClick} />
    </div>
  );
}; 