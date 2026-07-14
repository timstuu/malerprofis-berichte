import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const db = new Database("malerplan.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'foreman', 'worker')) DEFAULT 'worker',
    remaining_leave_days INTEGER DEFAULT 30
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    customer TEXT,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES employees(id),
    project_id TEXT REFERENCES projects(id),
    date TEXT NOT NULL,
    duration REAL NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES employees(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    type TEXT DEFAULT 'vacation'
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    employee_id TEXT REFERENCES employees(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    work_days TEXT NOT NULL, -- JSON string
    tasks TEXT,
    materials TEXT,
    customer_name TEXT,
    signature TEXT, -- base64 image
    status TEXT CHECK(status IN ('draft', 'signed', 'sent')) DEFAULT 'draft'
  );
`);

// Seed Data if empty
const employeeCount = db.prepare("SELECT COUNT(*) as count FROM employees").get() as { count: number };
if (employeeCount.count === 0) {
  const insertEmp = db.prepare("INSERT INTO employees (id, first_name, last_name, role) VALUES (?, ?, ?, ?)");
  insertEmp.run(uuidv4(), "Max", "Mustermann", "admin");
  insertEmp.run(uuidv4(), "Hans", "Maler", "worker");
  
  const insertProj = db.prepare("INSERT INTO projects (id, name, customer) VALUES (?, ?, ?)");
  insertProj.run(uuidv4(), "Neubau Villa Sonnenschein", "Fam. Schmidt");
  insertProj.run(uuidv4(), "Renovierung Rathaus", "Stadtverwaltung");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' })); // Increase limit for signature images

  // API Routes
  app.get("/api/employees", (req, res) => {
    const employees = db.prepare("SELECT * FROM employees").all();
    res.json(employees);
  });

  app.get("/api/projects", (req, res) => {
    const projects = db.prepare("SELECT * FROM projects WHERE status = 'active'").all();
    res.json(projects);
  });

  app.get("/api/time-entries", (req, res) => {
    const entries = db.prepare(`
      SELECT t.*, p.name as project_name, e.first_name, e.last_name 
      FROM time_entries t
      JOIN projects p ON t.project_id = p.id
      JOIN employees e ON t.employee_id = e.id
      ORDER BY t.date DESC
    `).all();
    res.json(entries);
  });

  app.post("/api/time-entries", (req, res) => {
    const { employee_id, project_id, date, duration, description } = req.body;
    const id = uuidv4();
    db.prepare("INSERT INTO time_entries (id, employee_id, project_id, date, duration, description) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, employee_id, project_id, date, duration, description);
    res.status(201).json({ id });
  });

  app.get("/api/leave-requests", (req, res) => {
    const requests = db.prepare(`
      SELECT l.*, e.first_name, e.last_name 
      FROM leave_requests l
      JOIN employees e ON l.employee_id = e.id
    `).all();
    res.json(requests);
  });

  app.post("/api/leave-requests", (req, res) => {
    const { employee_id, start_date, end_date, type } = req.body;
    const id = uuidv4();
    db.prepare("INSERT INTO leave_requests (id, employee_id, start_date, end_date, type) VALUES (?, ?, ?, ?, ?)")
      .run(id, employee_id, start_date, end_date, type);
    res.status(201).json({ id });
  });

  app.patch("/api/leave-requests/:id", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE leave_requests SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  // Report Routes
  app.get("/api/reports", (req, res) => {
    const reports = db.prepare(`
      SELECT r.*, p.name as project_name, e.first_name, e.last_name 
      FROM reports r
      JOIN projects p ON r.project_id = p.id
      JOIN employees e ON r.employee_id = e.id
      ORDER BY r.created_at DESC
    `).all();
    res.json(reports);
  });

  app.post("/api/reports", (req, res) => {
    const { project_id, employee_id, work_days, tasks, materials, customer_name, signature, status } = req.body;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO reports (id, project_id, employee_id, work_days, tasks, materials, customer_name, signature, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id, employee_id, JSON.stringify(work_days), tasks, materials, customer_name, signature, status);
    res.status(201).json({ id });
  });

  app.post("/api/reports/:id/send", (req, res) => {
    // Simulate email sending
    db.prepare("UPDATE reports SET status = 'sent' WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Bericht wurde erfolgreich versendet." });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
