import XLSX from 'xlsx';
import { buildEventLog, buildStudyAnalytics } from './metrics.js';

export function buildWorkbookBuffer(study, sessions, customers) {
  const analytics = buildStudyAnalytics(study, sessions, customers);
  const eventLog = buildEventLog(study, sessions, analytics.customers);
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet([
    {
      study_name: study.name,
      system_name: study.systemName,
      location: study.location,
      servers_count: study.serversCount,
      observed_minutes: analytics.metrics.observedMinutes,
      arrivals: analytics.metrics.arrivals,
      completed_services: analytics.metrics.completedServices,
      lambda_per_hour: analytics.metrics.lambdaPerHour,
      mu_per_hour: analytics.metrics.muPerHour,
      utilization: analytics.metrics.utilization,
      avg_interarrival_min: analytics.metrics.avgInterArrivalMin,
      avg_wait_min: analytics.metrics.avgWaitMin,
      avg_service_min: analytics.metrics.avgServiceMin,
      avg_system_min: analytics.metrics.avgSystemMin,
      estimated_p_wait: analytics.metrics.pWait,
      estimated_lq: analytics.metrics.lq,
      estimated_wq: analytics.metrics.wq,
      bottleneck_type: analytics.bottleneck.type,
      bottleneck_severity: analytics.bottleneck.severity,
      bottleneck_summary: analytics.bottleneck.summary,
    },
  ]);

  const sessionsSheet = XLSX.utils.json_to_sheet(sessions.map((session) => ({
    id: session.id,
    date: new Date(session.date).toISOString().slice(0, 10),
    start_time: new Date(session.startTime).toISOString(),
    end_time: session.endTime ? new Date(session.endTime).toISOString() : '',
    observed_minutes: session.observedMinutes,
  })));

  const customersSheet = XLSX.utils.json_to_sheet(analytics.customers.map((customer) => ({
    customer_code: customer.customerCode,
    status: customer.status,
    arrival_at: customer.arrivalAt ? new Date(customer.arrivalAt).toISOString() : '',
    service_start_at: customer.serviceStartAt ? new Date(customer.serviceStartAt).toISOString() : '',
    service_end_at: customer.serviceEndAt ? new Date(customer.serviceEndAt).toISOString() : '',
    wait_min: customer.waitMin,
    service_min: customer.serviceMin,
    system_min: customer.systemMin,
    server_label: customer.serverLabel,
    customer_type: customer.customerType,
    notes: customer.notes,
  })));

  const dailySheet = XLSX.utils.json_to_sheet(analytics.dailySummary);
  const stepSheet = XLSX.utils.json_to_sheet(eventLog);

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  XLSX.utils.book_append_sheet(workbook, stepSheet, 'Paso_a_paso');
  XLSX.utils.book_append_sheet(workbook, customersSheet, 'Clientes');
  XLSX.utils.book_append_sheet(workbook, sessionsSheet, 'Sesiones');
  XLSX.utils.book_append_sheet(workbook, dailySheet, 'Diario');

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}

export function buildCsv(study, sessions, customers) {
  const eventLog = buildEventLog(study, sessions, customers);
  const rows = [
    ['step', 'eventType', 'timestamp', 'customerCode', 'description'],
    ...eventLog.map((event) => [event.step, event.eventType, event.timestamp, event.customerCode, event.description]),
  ];
  return rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\n');
}

function escapeCsv(value) {
  const safe = value === null || value === undefined ? '' : String(value);
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}
