export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateOnly(value) {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatMinutes(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(digits)} min`;
}

export function formatRate(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(2)}/h`;
}

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export function formatStopwatch(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds) || seconds < 0) return '00:00:00';
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
