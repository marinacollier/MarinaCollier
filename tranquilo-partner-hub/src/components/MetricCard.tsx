import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { DemoBadge } from './ui';

export function MetricCard({ label, value, hint, trend, icon, demoLabel = 'DADO FICTÍCIO' }: { label: string; value: string; hint: string; trend?: 'up' | 'down' | 'flat'; icon?: ReactNode; demoLabel?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-card-top"><span className="metric-icon">{icon}</span><DemoBadge>{demoLabel}</DemoBadge></div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className={`metric-hint metric-hint--${trend ?? 'flat'}`}>
        {trend === 'up' ? <ArrowUpRight size={14} /> : trend === 'down' ? <ArrowDownRight size={14} /> : <Minus size={14} />}
        <span>{hint}</span>
      </div>
    </div>
  );
}
