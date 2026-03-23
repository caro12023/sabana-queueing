export default function KpiCard({ title, value, subtitle, icon: Icon, tone = 'blue' }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <div>
        <div className="kpi-title">{title}</div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-subtitle">{subtitle}</div>
      </div>
      {Icon ? (
        <div className="kpi-icon-wrap">
          <Icon size={20} />
        </div>
      ) : null}
    </div>
  );
}
