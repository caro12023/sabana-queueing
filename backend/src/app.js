import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { prisma } from './prisma.js';
import { buildWorkbookBuffer, buildCsv } from './exporters.js';
import { buildStudyAnalytics, enrichCustomer } from './metrics.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Sabana Queueing API' });
});

app.get('/api/studies', async (_req, res) => {
  const studies = await prisma.study.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(studies);
});

app.post('/api/studies', async (req, res) => {
  const { name, systemName, location, serversCount, notes } = req.body || {};
  if (!name || !systemName) {
    return res.status(400).json({ error: 'name y systemName son obligatorios.' });
  }
  const study = await prisma.study.create({
    data: {
      name,
      systemName,
      location: location || null,
      serversCount: Number(serversCount) || 1,
      notes: notes || null,
    },
  });
  res.status(201).json(study);
});

app.get('/api/studies/:id', async (req, res) => {
  const study = await prisma.study.findUnique({ where: { id: req.params.id } });
  if (!study) return res.status(404).json({ error: 'Estudio no encontrado.' });
  res.json(study);
});

app.patch('/api/studies/:id', async (req, res) => {
  const { name, systemName, location, serversCount, notes } = req.body || {};
  const study = await prisma.study.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(systemName !== undefined ? { systemName } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(serversCount !== undefined ? { serversCount: Number(serversCount) || 1 } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  });
  res.json(study);
});

app.get('/api/studies/:id/sessions', async (req, res) => {
  const sessions = await prisma.observationSession.findMany({
    where: { studyId: req.params.id },
    orderBy: { startTime: 'desc' },
  });
  res.json(sessions);
});

app.post('/api/studies/:id/sessions/start', async (req, res) => {
  const active = await prisma.observationSession.findFirst({
    where: { studyId: req.params.id, endTime: null },
  });
  if (active) return res.status(400).json({ error: 'Ya existe una jornada activa.' });

  const now = new Date();
  const session = await prisma.observationSession.create({
    data: {
      studyId: req.params.id,
      date: startOfDay(now),
      startTime: now,
    },
  });
  res.status(201).json(session);
});

app.post('/api/sessions/:id/stop', async (req, res) => {
  const session = await prisma.observationSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: 'Jornada no encontrada.' });
  if (session.endTime) return res.status(400).json({ error: 'La jornada ya fue cerrada.' });

  const now = new Date();
  const observedMinutes = (now.getTime() - new Date(session.startTime).getTime()) / 60000;
  const updated = await prisma.observationSession.update({
    where: { id: req.params.id },
    data: { endTime: now, observedMinutes },
  });
  res.json(updated);
});

app.get('/api/studies/:id/customers', async (req, res) => {
  const customers = await prisma.customer.findMany({
    where: { studyId: req.params.id },
    orderBy: { arrivalAt: 'asc' },
  });
  res.json(customers.map(enrichCustomer));
});

app.post('/api/studies/:id/customers/arrival', async (req, res) => {
  const study = await prisma.study.findUnique({ where: { id: req.params.id } });
  if (!study) return res.status(404).json({ error: 'Estudio no encontrado.' });

  const body = req.body || {};
  const arrivalAt = body.arrivalAt ? new Date(body.arrivalAt) : new Date();
  const activeSession = await prisma.observationSession.findFirst({
    where: { studyId: req.params.id, endTime: null },
    orderBy: { startTime: 'desc' },
  });

  const dailyCount = await prisma.customer.count({
    where: {
      studyId: req.params.id,
      arrivalAt: {
        gte: startOfDay(arrivalAt),
        lt: endOfDay(arrivalAt),
      },
    },
  });

  const customerCode = buildCustomerCode(arrivalAt, dailyCount + 1);
  const serviceStartAt = body.serviceStartAt ? new Date(body.serviceStartAt) : null;
  const serviceEndAt = body.serviceEndAt ? new Date(body.serviceEndAt) : null;

  if (serviceEndAt && !serviceStartAt) {
    return res.status(400).json({ error: 'No puedes guardar fin de servicio sin inicio de servicio.' });
  }
  if (serviceStartAt && serviceStartAt < arrivalAt) {
    return res.status(400).json({ error: 'La hora de inicio de servicio no puede ser menor que la llegada.' });
  }
  if (serviceEndAt && serviceEndAt < serviceStartAt) {
    return res.status(400).json({ error: 'La hora de fin de servicio no puede ser menor que el inicio.' });
  }

  const status = serviceEndAt ? 'completed' : serviceStartAt ? 'in_service' : 'waiting';

  const customer = await prisma.customer.create({
    data: {
      studyId: req.params.id,
      sessionId: activeSession?.id || null,
      customerCode,
      arrivalAt,
      serviceStartAt,
      serviceEndAt,
      serverLabel: body.serverLabel || '1',
      customerType: body.customerType || null,
      notes: body.notes || null,
      status,
    },
  });
  res.status(201).json(customer);
});

app.post('/api/customers/:id/start-service', async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });
  if (customer.serviceStartAt) return res.status(400).json({ error: 'El servicio ya inició.' });

  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data: {
      serviceStartAt: new Date(),
      status: 'in_service',
      ...(req.body?.serverLabel ? { serverLabel: req.body.serverLabel } : {}),
    },
  });
  res.json(updated);
});

app.post('/api/customers/:id/finish-service', async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });
  if (!customer.serviceStartAt) return res.status(400).json({ error: 'No puedes finalizar un servicio sin hora de inicio.' });
  if (customer.serviceEndAt) return res.status(400).json({ error: 'El servicio ya fue finalizado.' });

  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data: {
      serviceEndAt: new Date(),
      status: 'completed',
      ...(req.body?.serverLabel ? { serverLabel: req.body.serverLabel } : {}),
    },
  });
  res.json(updated);
});

app.patch('/api/customers/:id', async (req, res) => {
  const body = req.body || {};
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const nextArrival = body.arrivalAt === undefined ? customer.arrivalAt : new Date(body.arrivalAt);
  const nextServiceStart = body.serviceStartAt === undefined ? customer.serviceStartAt : body.serviceStartAt ? new Date(body.serviceStartAt) : null;
  const nextServiceEnd = body.serviceEndAt === undefined ? customer.serviceEndAt : body.serviceEndAt ? new Date(body.serviceEndAt) : null;

  if (nextServiceEnd && !nextServiceStart) {
    return res.status(400).json({ error: 'No puedes dejar fin de servicio sin inicio de servicio.' });
  }
  if (nextServiceStart && nextServiceStart < new Date(nextArrival)) {
    return res.status(400).json({ error: 'La hora de inicio de servicio no puede ser menor que la llegada.' });
  }
  if (nextServiceEnd && nextServiceStart && nextServiceEnd < nextServiceStart) {
    return res.status(400).json({ error: 'La hora de fin de servicio no puede ser menor que el inicio.' });
  }

  const status = nextServiceEnd ? 'completed' : nextServiceStart ? 'in_service' : (body.status || 'waiting');

  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data: {
      ...(body.arrivalAt !== undefined ? { arrivalAt: nextArrival } : {}),
      ...(body.serviceStartAt !== undefined ? { serviceStartAt: nextServiceStart } : {}),
      ...(body.serviceEndAt !== undefined ? { serviceEndAt: nextServiceEnd } : {}),
      ...(body.serverLabel !== undefined ? { serverLabel: body.serverLabel || null } : {}),
      ...(body.customerType !== undefined ? { customerType: body.customerType || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
      status,
    },
  });
  res.json(updated);
});

app.get('/api/studies/:id/dashboard', async (req, res) => {
  const study = await prisma.study.findUnique({ where: { id: req.params.id } });
  if (!study) return res.status(404).json({ error: 'Estudio no encontrado.' });

  const [sessions, customers] = await Promise.all([
    prisma.observationSession.findMany({ where: { studyId: req.params.id }, orderBy: { startTime: 'asc' } }),
    prisma.customer.findMany({ where: { studyId: req.params.id }, orderBy: { arrivalAt: 'asc' } }),
  ]);

  res.json(buildStudyAnalytics(study, sessions, customers));
});

app.get('/api/studies/:id/export/xlsx', async (req, res) => {
  const study = await prisma.study.findUnique({ where: { id: req.params.id } });
  if (!study) return res.status(404).json({ error: 'Estudio no encontrado.' });

  const [sessions, customers] = await Promise.all([
    prisma.observationSession.findMany({ where: { studyId: req.params.id }, orderBy: { startTime: 'asc' } }),
    prisma.customer.findMany({ where: { studyId: req.params.id }, orderBy: { arrivalAt: 'asc' } }),
  ]);

  const buffer = buildWorkbookBuffer(study, sessions, customers);
  const filename = `${slugify(study.systemName || study.name)}_paso_a_paso.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

app.get('/api/studies/:id/export/csv', async (req, res) => {
  const study = await prisma.study.findUnique({ where: { id: req.params.id } });
  if (!study) return res.status(404).json({ error: 'Estudio no encontrado.' });

  const [sessions, customers] = await Promise.all([
    prisma.observationSession.findMany({ where: { studyId: req.params.id }, orderBy: { startTime: 'asc' } }),
    prisma.customer.findMany({ where: { studyId: req.params.id }, orderBy: { arrivalAt: 'asc' } }),
  ]);

  const csv = buildCsv(study, sessions, customers);
  const filename = `${slugify(study.systemName || study.name)}_paso_a_paso.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function buildCustomerCode(date, sequence) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `SQ-${y}${m}${d}-${String(sequence).padStart(4, '0')}`;
}

function slugify(value) {
  return String(value || 'sabana_queueing')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export default app;
