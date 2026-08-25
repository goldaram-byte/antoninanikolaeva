import "dotenv/config";
import express from "express";
import cors from "cors";
import { join } from "node:path";

import authRoutes from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import branchesRoutes from "./routes/branches.js";
import clientsRoutes from "./routes/clients.js";
import subsRoutes from "./routes/subscriptions.js";
import paymentsRoutes from "./routes/payments.js";
import dashboardRoutes from "./routes/dashboard.js";
import scheduleRoutes from "./routes/schedule.js";
import attendanceRoutes from "./routes/attendance.js";
import personalRoutes from "./routes/personal.js";
import loyaltyRoutes from "./routes/loyalty.js";
import funnelRoutes from "./routes/funnel.js";
import tasksRoutes from "./routes/tasks.js";
import salaryRoutes from "./routes/salary.js";
import importRoutes from "./routes/import.js";
import employeesRoutes from "./routes/employees.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(",") || "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "karate-crm-server" }));

app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/branches", branchesRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/subscriptions", subsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/personal", personalRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/funnel", funnelRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/salary", salaryRoutes);
app.use("/api/import", importRoutes);
app.use("/api/employees", employeesRoutes);

// Прод-режим: один процесс отдаёт и API, и собранный фронтенд (SPA)
if (process.env.CLIENT_DIST) {
  app.use(express.static(process.env.CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(join(process.env.CLIENT_DIST, "index.html"));
  });
}

// Единый обработчик ошибок
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Внутренняя ошибка" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Сервер «Школа каратэ» запущен на :${PORT}`));
