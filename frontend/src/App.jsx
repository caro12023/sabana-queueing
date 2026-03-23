import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Download,
  Gauge,
  LoaderCircle,
  Play,
  Plus,
  Save,
  Square,
  Timer,
  Users,
  Waypoints,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from './services/api';
import KpiCard from './components/KpiCard';
import SectionCard from './components/SectionCard';
import { formatDateOnly, formatDateTime, formatMinutes, formatPercent, formatRate, formatStopwatch } from './utils/format';

const initialStudyForm = {
  name: 'Sabana Queueing Study',
  systemName: '',
  location: '',
  serversCount: 1,
  notes: '',
};

const initialManualForm = {
  arrivalAt: '',
  serviceStartAt: '',
  serviceEndAt: '',
  serverLabel: '1',
  customerType: '',
  notes: '',
};

export default function App() {
  const [studies, setStudies] = useState([]);
  const [currentStudyId, setCurrentStudyId] = useState(localStorage.getItem('sabana-current-study') || '');
  const [currentStudy, setCurrentStudy] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [studyForm, setStudyForm] = useState(initialStudyForm);
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('sabana-current-study', currentStudyId || '');
  }, [currentStudyId]);

  useEffect(() => {
    loadStudies();
  }, []);

  useEffect(() => {
    if (currentStudyId) {
      loadStudyBundle(currentStudyId);
    } else {
      setCurrentStudy(null);
      setDashboard(null);
      setCustomers([]);
      setSessions([]);
      setLoading(false);
    }
  }, [currentStudyId]);

  async function loadStudies() {
    try {
      const { data } = await api.get('/studies');
      setStudies(data);
      if (!currentStudyId && data.length) {
        setCurrentStudyId(data[0].id);
      }
    } catch (err) {
      setError(readError(err));
    }
  }

  async function loadStudyBundle(studyId) {
    setLoading(true);
    setError('');
    try {
      const [studyRes, dashboardRes, customersRes, sessionsRes] = await Promise.all([
        api.get(`/studies/${studyId}`),
        api.get(`/studies/${studyId}/dashboard`),
        api.get(`/studies/${studyId}/customers`),
        api.get(`/studies/${studyId}/sessions`),
      ]);
      setCurrentStudy(studyRes.data);
      setDashboard(dashboardRes.data);
      setCustomers(customersRes.data);
      setSessions(sessionsRes.data);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateStudy(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/studies', {
        ...studyForm,
        serversCount: Number(studyForm.serversCount) || 1,
      });
      setStudies((prev) => [data, ...prev]);
      setCurrentStudyId(data.id);
      setStudyForm(initialStudyForm);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateStudy() {
    if (!currentStudy) return;
    setSubmitting(true);
    setError('');
    try {
      await api.patch(`/studies/${currentStudy.id}`, {
        name: currentStudy.name,
        systemName: currentStudy.systemName,
        location: currentStudy.location,
        serversCount: Number(currentStudy.serversCount) || 1,
        notes: currentStudy.notes,
      });
      await loadStudies();
      await loadStudyBundle(currentStudy.id);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function startSessionNow() {
    if (!currentStudyId) return;
    setSubmitting(true);
    try {
      await api.post(`/studies/${currentStudyId}/sessions/start`);
      await loadStudyBundle(currentStudyId);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function stopSessionNow(sessionId) {
    setSubmitting(true);
    try {
      await api.post(`/sessions/${sessionId}/stop`);
      await loadStudyBundle(currentStudyId);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function registerArrivalNow() {
    if (!currentStudyId) return;
    setSubmitting(true);
    try {
      await api.post(`/studies/${currentStudyId}/customers/arrival`, {});
      await loadStudyBundle(currentStudyId);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function addManualCustomer(e) {
    e.preventDefault();
    if (!currentStudyId) return;
    setSubmitting(true);
    try {
      await api.post(`/studies/${currentStudyId}/customers/arrival`, manualForm);
      setManualForm(initialManualForm);
      await loadStudyBundle(currentStudyId);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function startService(customerId) {
    setSubmitting(true);
    try {
      await api.post(`/customers/${customerId}/start-service`, {});
      await loadStudyBundle(currentStudyId);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function finishService(customerId) {
    setSubmitting(true);
    try {
      await api.post(`/customers/${customerId}/finish-service`, {});
      await loadStudyBundle(currentStudyId);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function patchCustomer(customerId, payload) {
    setSubmitting(true);
    try {
      await api.patch(`/customers/${customerId}`, payload);
      await loadStudyBundle(currentStudyId);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const activeSession = useMemo(() => sessions.find((session) => !session.endTime) || null, [sessions]);
  const waitingCustomers = customers.filter((customer) => customer.status === 'waiting');
  const inServiceCustomers = customers.filter((customer) => customer.status === 'in_service');

  const sessionElapsed = activeSession
    ? Math.floor((now - new Date(activeSession.startTime).getTime()) / 1000)
    : null;

  const pieData = dashboard
    ? [
        { name: 'Ocupado', value: Math.min(Math.max((dashboard.metrics.utilization || 0) * 100, 0), 100) },
        { name: 'Disponible', value: Math.max(0, 100 - Math.min(Math.max((dashboard.metrics.utilization || 0) * 100, 0), 100)) },
      ]
    : [];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">SQ</div>
        <div>
          <div className="brand-name">Sabana Queueing</div>
          <div className="brand-copy">Medición elegante de colas, llegadas y tiempos de servicio.</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="hero">
          <div>
            <div className="pill">Queueing analytics · captura en vivo · exportación paso a paso</div>
            <h1>Sabana Queueing</h1>
            <p>
              App full stack para registrar clientes con ID automático, medir jornadas y servicios con cronómetro real,
              calcular λ y μ, y exportar el proceso completo a Excel.
            </p>
          </div>
          <div className="hero-actions">
            <a className="button secondary" href={currentStudyId ? `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/studies/${currentStudyId}/export/csv` : '#'}>
              <Download size={16} /> CSV
            </a>
            <a className={`button primary ${!currentStudyId ? 'disabled' : ''}`} href={currentStudyId ? `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/studies/${currentStudyId}/export/xlsx` : '#'}>
              <Save size={16} /> Excel paso a paso
            </a>
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}

        <div className="grid two-col">
          <SectionCard
            title="Crear estudio"
            description="Configura el sistema que vas a medir. Luego podrás capturar llegadas y servicios en vivo."
          >
            <form className="form-grid" onSubmit={handleCreateStudy}>
              <label>
                Nombre del proyecto
                <input value={studyForm.name} onChange={(e) => setStudyForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Sabana Queueing Study" />
              </label>
              <label>
                Sistema bajo estudio
                <input value={studyForm.systemName} onChange={(e) => setStudyForm((prev) => ({ ...prev, systemName: e.target.value }))} placeholder="Punto de comida / Registro / Parqueadero" />
              </label>
              <label>
                Lugar
                <input value={studyForm.location} onChange={(e) => setStudyForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Campus / edificio / clínica" />
              </label>
              <label>
                Número de servidores
                <input type="number" min="1" value={studyForm.serversCount} onChange={(e) => setStudyForm((prev) => ({ ...prev, serversCount: e.target.value }))} />
              </label>
              <label className="span-2">
                Notas
                <textarea value={studyForm.notes} onChange={(e) => setStudyForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Describe el alcance del sistema y observaciones importantes." />
              </label>
              <div className="span-2 row-end">
                <button className="button primary" disabled={submitting} type="submit">
                  {submitting ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Crear estudio
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Estudios" description="Selecciona el estudio que quieres operar ahora mismo.">
            <div className="study-list">
              {studies.length ? studies.map((study) => (
                <button key={study.id} className={`study-item ${currentStudyId === study.id ? 'active' : ''}`} onClick={() => setCurrentStudyId(study.id)}>
                  <div>
                    <strong>{study.name}</strong>
                    <span>{study.systemName || 'Sin sistema definido'}</span>
                  </div>
                  <span>{study.serversCount} servidor(es)</span>
                </button>
              )) : <div className="empty-state">Aún no hay estudios creados.</div>}
            </div>
          </SectionCard>
        </div>

        {loading ? <div className="loading-panel"><LoaderCircle className="spin" size={22} /> Cargando estudio...</div> : null}

        {currentStudy && dashboard ? (
          <>
            <div className="grid four-col">
              <KpiCard title="λ (tasa de llegada)" value={formatRate(dashboard.metrics.lambdaPerHour)} subtitle={`${dashboard.metrics.arrivals} llegadas en ${Math.round(dashboard.metrics.observedMinutes)} min observados`} icon={Users} tone="blue" />
              <KpiCard title="μ (tasa de servicio)" value={formatRate(dashboard.metrics.muPerHour)} subtitle={`Basada en ${formatMinutes(dashboard.metrics.avgServiceMin)}`} icon={Clock3} tone="navy" />
              <KpiCard title="Utilización ρ" value={formatPercent(dashboard.metrics.utilization)} subtitle={`${currentStudy.serversCount} servidor(es)`} icon={Gauge} tone="gold" />
              <KpiCard title="Espera promedio" value={formatMinutes(dashboard.metrics.avgWaitMin)} subtitle={`Wq estimado ${formatMinutes(dashboard.metrics.wq)}`} icon={Timer} tone="green" />
            </div>

            <div className="grid two-col wide-left">
              <SectionCard
                title="Consola de medición en vivo"
                description="Toca los botones y la app guardará las marcas de tiempo exactas. El cronómetro solo muestra el tiempo corriendo; los cálculos salen de esas marcas."
                actions={
                  <div className="inline-actions">
                    <button className="button primary" disabled={Boolean(activeSession) || submitting} onClick={startSessionNow}>
                      <Play size={16} /> Iniciar jornada
                    </button>
                    <button className="button secondary" disabled={!activeSession || submitting} onClick={() => stopSessionNow(activeSession.id)}>
                      <Square size={16} /> Finalizar jornada
                    </button>
                  </div>
                }
              >
                <div className="live-grid">
                  <div className="live-panel soft-blue">
                    <div className="live-label">Jornada activa</div>
                    <div className="live-number">{activeSession ? formatStopwatch(sessionElapsed) : '00:00:00'}</div>
                    <div className="live-copy">{activeSession ? `Desde ${formatDateTime(activeSession.startTime)}` : 'No hay jornada activa'}</div>
                  </div>
                  <div className="live-panel soft-gold">
                    <div className="live-label">Clientes en cola</div>
                    <div className="live-number">{waitingCustomers.length}</div>
                    <button className="button primary full" disabled={!currentStudyId || submitting} onClick={registerArrivalNow}>
                      <Plus size={16} /> Registrar llegada ahora
                    </button>
                  </div>
                  <div className="live-panel soft-green">
                    <div className="live-label">Servicios en curso</div>
                    <div className="live-number">{inServiceCustomers.length}</div>
                    <div className="mini-list">
                      {inServiceCustomers.length ? inServiceCustomers.slice(0, 2).map((customer) => (
                        <div key={customer.id}>{customer.customerCode} · {formatStopwatch(Math.floor((now - new Date(customer.serviceStartAt).getTime()) / 1000))}</div>
                      )) : 'No hay servicios activos.'}
                    </div>
                  </div>
                </div>

                <div className="workflow-card">
                  <strong>Flujo recomendado:</strong> iniciar jornada → registrar llegada → iniciar servicio → finalizar servicio → exportar Excel.
                </div>
              </SectionCard>

              <SectionCard title="Cuello de botella" description="Diagnóstico con evidencia numérica, severidad y explicación ejecutiva.">
                <div className={`bottleneck-card severity-${dashboard.bottleneck.severity}`}>
                  <div className="bottleneck-head">
                    <div>
                      <div className="eyebrow">Tipo</div>
                      <h3>{humanizeBottleneckType(dashboard.bottleneck.type)}</h3>
                    </div>
                    <span className="severity-pill">{dashboard.bottleneck.severity.toUpperCase()}</span>
                  </div>
                  <p className="bottleneck-summary">{dashboard.bottleneck.summary}</p>
                  <ul>
                    {dashboard.bottleneck.evidence.length ? dashboard.bottleneck.evidence.map((item) => <li key={item}>{item}</li>) : <li>Sin evidencia suficiente todavía.</li>}
                  </ul>
                </div>
              </SectionCard>
            </div>

            <div className="grid two-col wide-left">
              <SectionCard title="Dashboard diario" description="Compara llegadas, servicios completados y tendencias por día.">
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.dailySummary}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dateLabel" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="arrivals" name="Llegadas" radius={[12, 12, 0, 0]} fill="#1d4ed8" />
                      <Bar dataKey="completed" name="Atendidos" radius={[12, 12, 0, 0]} fill="#d97706" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard title="Uso del sistema" description="Distribución visual de la utilización promedio observada.">
                <div className="chart-wrap small">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip />
                      <Legend />
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={4}>
                        {pieData.map((item, index) => <Cell key={`${item.name}-${index}`} fill={index === 0 ? '#0f172a' : '#cbd5e1'} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>

            <div className="grid two-col wide-left">
              <SectionCard title="Tiempos promedio por día" description="Espera, servicio y tiempo total en el sistema.">
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboard.dailySummary}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dateLabel" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="avgWait" name="Espera prom." stroke="#dc2626" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="avgService" name="Servicio prom." stroke="#1d4ed8" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="avgSystem" name="Sistema prom." stroke="#16a34a" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard title="Edición del estudio" description="Ajusta la configuración principal y guarda cambios.">
                <div className="form-grid compact">
                  <label>
                    Nombre
                    <input value={currentStudy.name} onChange={(e) => setCurrentStudy((prev) => ({ ...prev, name: e.target.value }))} />
                  </label>
                  <label>
                    Sistema
                    <input value={currentStudy.systemName || ''} onChange={(e) => setCurrentStudy((prev) => ({ ...prev, systemName: e.target.value }))} />
                  </label>
                  <label>
                    Lugar
                    <input value={currentStudy.location || ''} onChange={(e) => setCurrentStudy((prev) => ({ ...prev, location: e.target.value }))} />
                  </label>
                  <label>
                    Servidores
                    <input type="number" min="1" value={currentStudy.serversCount || 1} onChange={(e) => setCurrentStudy((prev) => ({ ...prev, serversCount: e.target.value }))} />
                  </label>
                  <label className="span-2">
                    Notas
                    <textarea value={currentStudy.notes || ''} onChange={(e) => setCurrentStudy((prev) => ({ ...prev, notes: e.target.value }))} />
                  </label>
                  <div className="span-2 row-end">
                    <button className="button primary" disabled={submitting} onClick={handleUpdateStudy}>
                      <Save size={16} /> Guardar cambios
                    </button>
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="grid two-col wide-left">
              <SectionCard title="Agregar cliente manualmente" description="Úsalo para corregir un registro o cargar un caso que no alcanzaste a marcar en vivo.">
                <form className="form-grid compact" onSubmit={addManualCustomer}>
                  <label>
                    Llegada
                    <input type="datetime-local" value={manualForm.arrivalAt} onChange={(e) => setManualForm((prev) => ({ ...prev, arrivalAt: e.target.value }))} />
                  </label>
                  <label>
                    Inicio servicio
                    <input type="datetime-local" value={manualForm.serviceStartAt} onChange={(e) => setManualForm((prev) => ({ ...prev, serviceStartAt: e.target.value }))} />
                  </label>
                  <label>
                    Fin servicio
                    <input type="datetime-local" value={manualForm.serviceEndAt} onChange={(e) => setManualForm((prev) => ({ ...prev, serviceEndAt: e.target.value }))} />
                  </label>
                  <label>
                    Servidor
                    <input value={manualForm.serverLabel} onChange={(e) => setManualForm((prev) => ({ ...prev, serverLabel: e.target.value }))} />
                  </label>
                  <label>
                    Tipo cliente
                    <input value={manualForm.customerType} onChange={(e) => setManualForm((prev) => ({ ...prev, customerType: e.target.value }))} />
                  </label>
                  <label className="span-2">
                    Notas
                    <textarea value={manualForm.notes} onChange={(e) => setManualForm((prev) => ({ ...prev, notes: e.target.value }))} />
                  </label>
                  <div className="span-2 row-end">
                    <button className="button secondary" type="submit" disabled={submitting}>
                      <Plus size={16} /> Guardar cliente manual
                    </button>
                  </div>
                </form>
              </SectionCard>

              <SectionCard title="Lectura rápida" description="Resumen breve para usar en el reporte o en la presentación final.">
                <div className="insight-list">
                  <div><Activity size={18} /> <span>Clientes medidos: <strong>{dashboard.metrics.arrivals}</strong></span></div>
                  <div><Waypoints size={18} /> <span>Tiempo promedio entre llegadas: <strong>{formatMinutes(dashboard.metrics.avgInterArrivalMin)}</strong></span></div>
                  <div><Clock3 size={18} /> <span>Tiempo promedio de servicio: <strong>{formatMinutes(dashboard.metrics.avgServiceMin)}</strong></span></div>
                  <div><AlertTriangle size={18} /> <span>Probabilidad de espera: <strong>{formatPercent(dashboard.metrics.pWait)}</strong></span></div>
                  <div><BarChart3 size={18} /> <span>Personas en cola estimadas (Lq): <strong>{dashboard.metrics.lq?.toFixed(2) ?? '—'}</strong></span></div>
                  <div><Gauge size={18} /> <span>Tiempo promedio en sistema: <strong>{formatMinutes(dashboard.metrics.avgSystemMin)}</strong></span></div>
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Registros de clientes" description="Cada cliente tiene ID propio. Puedes iniciar y finalizar servicio desde la tabla; también exportas la secuencia completa paso a paso.">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Estado</th>
                      <th>Llegada</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th>Espera</th>
                      <th>Servicio</th>
                      <th>Sistema</th>
                      <th>Servidor</th>
                      <th>Tipo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.length ? customers.map((customer) => (
                      <tr key={customer.id}>
                        <td>
                          <div className="code-cell">{customer.customerCode}</div>
                          {customer.notes ? <small>{customer.notes}</small> : null}
                        </td>
                        <td><span className={`status-pill ${customer.status}`}>{humanizeStatus(customer.status)}</span></td>
                        <td>{formatDateTime(customer.arrivalAt)}</td>
                        <td>{formatDateTime(customer.serviceStartAt)}</td>
                        <td>{formatDateTime(customer.serviceEndAt)}</td>
                        <td>{formatMinutes(customer.waitMin)}</td>
                        <td>
                          {customer.status === 'in_service'
                            ? formatStopwatch(Math.floor((now - new Date(customer.serviceStartAt).getTime()) / 1000))
                            : formatMinutes(customer.serviceMin)}
                        </td>
                        <td>{formatMinutes(customer.systemMin)}</td>
                        <td>
                          <input
                            className="inline-input"
                            defaultValue={customer.serverLabel || ''}
                            onBlur={(e) => {
                              if (e.target.value !== (customer.serverLabel || '')) {
                                patchCustomer(customer.id, { serverLabel: e.target.value });
                              }
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="inline-input"
                            defaultValue={customer.customerType || ''}
                            onBlur={(e) => {
                              if (e.target.value !== (customer.customerType || '')) {
                                patchCustomer(customer.id, { customerType: e.target.value });
                              }
                            }}
                          />
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="button tiny primary" disabled={customer.status !== 'waiting' || submitting} onClick={() => startService(customer.id)}>
                              <Play size={14} /> Iniciar
                            </button>
                            <button className="button tiny secondary" disabled={customer.status !== 'in_service' || submitting} onClick={() => finishService(customer.id)}>
                              <Square size={14} /> Finalizar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="11"><div className="empty-state">Aún no hay clientes registrados.</div></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        ) : null}
      </main>
    </div>
  );
}

function readError(err) {
  return err?.response?.data?.error || err?.message || 'Ocurrió un error.';
}

function humanizeStatus(status) {
  const map = {
    waiting: 'En cola',
    in_service: 'En servicio',
    completed: 'Finalizado',
    cancelled: 'Cancelado',
  };
  return map[status] || status;
}

function humanizeBottleneckType(type) {
  const map = {
    balanced: 'Sistema balanceado',
    unstable_capacity: 'Capacidad inestable',
    service_capacity: 'Capacidad de servicio saturada',
    queue_before_service: 'Cola antes del servicio',
    server_imbalance: 'Desbalance entre servidores',
    temporal_peak: 'Pico temporal de demanda',
  };
  return map[type] || type;
}
