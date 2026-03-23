function asDate(value) {
  return value ? new Date(value) : null;
}

function minutesBetween(start, end) {
  const a = asDate(start);
  const b = asDate(end);
  if (!a || !b) return null;
  const result = (b.getTime() - a.getTime()) / 60000;
  return result >= 0 ? result : null;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function erlangC({ lambdaPerMin, muPerMin, servers }) {
  if (!lambdaPerMin || !muPerMin || !servers) return null;
  const c = Math.max(1, Number(servers));
  const a = lambdaPerMin / muPerMin;
  const rho = lambdaPerMin / (c * muPerMin);
  if (rho >= 1) {
    return { rho, pWait: 1, lq: null, wq: null, w: null, l: null, stable: false };
  }

  let sum = 0;
  for (let n = 0; n < c; n += 1) {
    sum += Math.pow(a, n) / factorial(n);
  }
  const tail = Math.pow(a, c) / (factorial(c) * (1 - rho));
  const p0 = 1 / (sum + tail);
  const pWait = tail * p0;
  const lq = (p0 * Math.pow(a, c) * rho) / (factorial(c) * Math.pow(1 - rho, 2));
  const wq = lambdaPerMin > 0 ? lq / lambdaPerMin : 0;
  const w = wq + 1 / muPerMin;
  const l = lambdaPerMin * w;
  return { rho, pWait, lq, wq, w, l, stable: true };
}

export function enrichCustomer(customer) {
  const waitMin = minutesBetween(customer.arrivalAt, customer.serviceStartAt);
  const serviceMin = minutesBetween(customer.serviceStartAt, customer.serviceEndAt);
  const systemMin = minutesBetween(customer.arrivalAt, customer.serviceEndAt);
  return {
    ...customer,
    waitMin,
    serviceMin,
    systemMin,
  };
}

export function detectBottleneck({ utilization, avgWaitMin, avgServiceMin, pWait, queueNow, lambdaPerHour, muPerHour, servers, serverLoadSpread }) {
  let type = 'balanced';
  let severity = 'low';
  const evidence = [];

  if (utilization >= 1) {
    type = 'unstable_capacity';
    severity = 'critical';
    evidence.push(`utilización ${utilization.toFixed(2)} ≥ 1`);
  } else if (utilization >= 0.85) {
    type = 'service_capacity';
    severity = 'high';
    evidence.push(`utilización alta ${utilization.toFixed(2)}`);
  }

  if (avgWaitMin > avgServiceMin && avgWaitMin > 0) {
    type = 'queue_before_service';
    if (severity === 'low') severity = 'medium';
    evidence.push(`espera ${avgWaitMin.toFixed(2)} min > servicio ${avgServiceMin.toFixed(2)} min`);
  }

  if (pWait !== null && pWait !== undefined && pWait >= 0.7) {
    if (severity === 'low') severity = 'medium';
    evidence.push(`probabilidad de espera ${(pWait * 100).toFixed(1)}%`);
  }

  if (queueNow >= Math.max(3, servers || 1)) {
    if (severity === 'low') severity = 'medium';
    evidence.push(`cola viva ${queueNow} cliente(s)`);
  }

  if (serverLoadSpread > 0.35) {
    type = 'server_imbalance';
    if (severity === 'low') severity = 'medium';
    evidence.push(`desbalance entre servidores ${(serverLoadSpread * 100).toFixed(1)}%`);
  }

  if (lambdaPerHour && muPerHour && lambdaPerHour > muPerHour * Math.max(1, servers || 1)) {
    type = 'temporal_peak';
    severity = severity === 'critical' ? 'critical' : 'high';
    evidence.push(`λ ${lambdaPerHour.toFixed(2)}/h supera capacidad observada`);
  }

  const summary = evidence.length
    ? `Cuello de botella: ${type}. Severidad ${severity}. Evidencia: ${evidence.join(', ')}.`
    : 'Sistema balanceado sin evidencia fuerte de cuello de botella.';

  return { type, severity, summary, evidence };
}

export function buildStudyAnalytics(study, sessions, rawCustomers) {
  const customers = rawCustomers
    .map(enrichCustomer)
    .sort((a, b) => new Date(a.arrivalAt).getTime() - new Date(b.arrivalAt).getTime());

  const observedMinutes = sessions.reduce((sum, session) => sum + (session.observedMinutes || minutesBetween(session.startTime, session.endTime) || 0), 0);
  const completed = customers.filter((customer) => customer.serviceEndAt);
  const waits = customers.map((customer) => customer.waitMin).filter((value) => value !== null);
  const services = completed.map((customer) => customer.serviceMin).filter((value) => value !== null);
  const systems = completed.map((customer) => customer.systemMin).filter((value) => value !== null);

  const interArrivalValues = [];
  for (let index = 1; index < customers.length; index += 1) {
    const diff = minutesBetween(customers[index - 1].arrivalAt, customers[index].arrivalAt);
    if (diff !== null) interArrivalValues.push(diff);
  }

  const avgServiceMin = average(services);
  const avgWaitMin = average(waits);
  const avgSystemMin = average(systems);
  const avgInterArrivalMin = average(interArrivalValues);

  const lambdaPerMin = observedMinutes > 0 ? customers.length / observedMinutes : 0;
  const lambdaPerHour = lambdaPerMin * 60;
  const muPerMin = avgServiceMin > 0 ? 1 / avgServiceMin : 0;
  const muPerHour = muPerMin * 60;
  const utilization = muPerMin > 0 ? lambdaPerMin / (Math.max(1, Number(study.serversCount)) * muPerMin) : 0;
  const queueMetrics = erlangC({ lambdaPerMin, muPerMin, servers: study.serversCount }) || {};

  const byServer = new Map();
  completed.forEach((customer) => {
    const label = customer.serverLabel || '1';
    const current = byServer.get(label) || { count: 0, totalService: 0 };
    current.count += 1;
    current.totalService += customer.serviceMin || 0;
    byServer.set(label, current);
  });

  const serverAverages = [...byServer.values()].map((item) => item.totalService / item.count).filter((value) => Number.isFinite(value));
  let serverLoadSpread = 0;
  if (serverAverages.length >= 2) {
    const max = Math.max(...serverAverages);
    const min = Math.min(...serverAverages);
    serverLoadSpread = max > 0 ? (max - min) / max : 0;
  }

  const queueNow = customers.filter((customer) => customer.status === 'waiting').length;
  const bottleneck = detectBottleneck({
    utilization,
    avgWaitMin,
    avgServiceMin,
    pWait: queueMetrics.pWait ?? null,
    queueNow,
    lambdaPerHour,
    muPerHour,
    servers: study.serversCount,
    serverLoadSpread,
  });

  const dailyMap = new Map();
  sessions.forEach((session) => {
    const key = asDate(session.date).toISOString().slice(0, 10);
    const bucket = dailyMap.get(key) || {
      date: key,
      dateLabel: key,
      observedMinutes: 0,
      arrivals: 0,
      completed: 0,
      waitValues: [],
      serviceValues: [],
      systemValues: [],
    };
    bucket.observedMinutes += session.observedMinutes || minutesBetween(session.startTime, session.endTime) || 0;
    dailyMap.set(key, bucket);
  });

  customers.forEach((customer) => {
    const key = asDate(customer.arrivalAt).toISOString().slice(0, 10);
    const bucket = dailyMap.get(key) || {
      date: key,
      dateLabel: key,
      observedMinutes: 0,
      arrivals: 0,
      completed: 0,
      waitValues: [],
      serviceValues: [],
      systemValues: [],
    };
    bucket.arrivals += 1;
    if (customer.waitMin !== null) bucket.waitValues.push(customer.waitMin);
    if (customer.serviceMin !== null) {
      bucket.completed += 1;
      bucket.serviceValues.push(customer.serviceMin);
    }
    if (customer.systemMin !== null) bucket.systemValues.push(customer.systemMin);
    dailyMap.set(key, bucket);
  });

  const dailySummary = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)).map((bucket) => ({
    date: bucket.date,
    dateLabel: bucket.date,
    observedMinutes: bucket.observedMinutes,
    arrivals: bucket.arrivals,
    completed: bucket.completed,
    avgWait: average(bucket.waitValues),
    avgService: average(bucket.serviceValues),
    avgSystem: average(bucket.systemValues),
  }));

  return {
    metrics: {
      observedMinutes,
      arrivals: customers.length,
      completedServices: completed.length,
      lambdaPerHour,
      muPerHour,
      utilization,
      avgInterArrivalMin,
      avgWaitMin,
      avgServiceMin,
      avgSystemMin,
      pWait: queueMetrics.pWait ?? null,
      lq: queueMetrics.lq ?? null,
      wq: queueMetrics.wq ?? null,
      l: queueMetrics.l ?? null,
      w: queueMetrics.w ?? null,
    },
    bottleneck,
    customers,
    dailySummary,
  };
}

export function buildEventLog(study, sessions, customers) {
  const events = [];

  sessions.forEach((session) => {
    events.push({
      stepType: 'INICIO_JORNADA',
      timestamp: session.startTime,
      study: study.name,
      customerCode: '',
      description: `Inicio de jornada de observación`,
    });
    if (session.endTime) {
      events.push({
        stepType: 'FIN_JORNADA',
        timestamp: session.endTime,
        study: study.name,
        customerCode: '',
        description: `Fin de jornada de observación`,
      });
    }
  });

  customers.forEach((customer) => {
    events.push({
      stepType: 'LLEGADA',
      timestamp: customer.arrivalAt,
      study: study.name,
      customerCode: customer.customerCode,
      description: `Llegó el cliente ${customer.customerCode}`,
    });
    if (customer.serviceStartAt) {
      events.push({
        stepType: 'INICIO_SERVICIO',
        timestamp: customer.serviceStartAt,
        study: study.name,
        customerCode: customer.customerCode,
        description: `Comenzó atención del cliente ${customer.customerCode}`,
      });
    }
    if (customer.serviceEndAt) {
      events.push({
        stepType: 'FIN_SERVICIO',
        timestamp: customer.serviceEndAt,
        study: study.name,
        customerCode: customer.customerCode,
        description: `Terminó atención del cliente ${customer.customerCode}`,
      });
    }
  });

  return events
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((event, index) => ({
      step: index + 1,
      eventType: event.stepType,
      timestamp: new Date(event.timestamp).toISOString(),
      customerCode: event.customerCode,
      description: event.description,
    }));
}
