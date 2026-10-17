import { ArrowUpRight, CalendarDays, Check, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PrepTask } from '../types';
import { Checkbox } from './ui';

export function TaskRow({ task, checked, onToggle, compact = false }: { task: PrepTask; checked: boolean; onToggle: () => void; compact?: boolean }) {
  return (
    <div className={`task-row ${checked ? 'task-row--done' : ''} ${compact ? 'task-row--compact' : ''}`}>
      <Checkbox checked={checked} onChange={onToggle} label={`${checked ? 'Desmarcar' : 'Marcar'}: ${task.title}`} />
      <div className="task-row-copy">
        <div className="task-row-title">{task.title}</div>
        {!compact && <div className="task-row-meta"><span>{task.owner}</span><span className="meta-separator">·</span><span><CalendarDays size={12} />{task.dueLabel}</span></div>}
      </div>
      {task.resource && !compact && <Link className="task-resource-link" to={`/conhecimento?playbook=${encodeURIComponent(task.resource)}`} title="Abrir conteúdo relacionado"><span>Guia</span><ArrowUpRight size={14} /></Link>}
      {compact && <span className="task-row-status">{checked ? <Check size={14} /> : <Circle size={12} />}</span>}
    </div>
  );
}
