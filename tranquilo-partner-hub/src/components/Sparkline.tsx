export function Sparkline({ values, color = 'var(--accent)' }: { values: number[]; color?: string }) {
  const width = 220;
  const height = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - 5 - ((value - min) / range) * (height - 10);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Tendência ilustrativa: ${values.join(', ')} pontos`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - 5 - ((value - min) / range) * (height - 10);
        return <circle key={`${index}-${value}`} cx={x} cy={y} r="3" fill={color} />;
      })}
    </svg>
  );
}
