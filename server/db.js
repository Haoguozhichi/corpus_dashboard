const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'data.sqlite');
const JSON_PATH = path.join(__dirname, 'data.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

// 自动备份（保留最近5个）
function backup() {
  if (!fs.existsSync(DB_PATH)) return;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `data-${ts}.sqlite`));
    // 保留最近5个
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('data-') && f.endsWith('.sqlite')).sort().reverse();
    for (const f of files.slice(5)) fs.unlinkSync(path.join(BACKUP_DIR, f));
  } catch { /* backup is best-effort */ }
}

// ========== 内存数据（路由层操作对象，与 SQLite 双向同步） ==========
let data = { experiments: [] };

// sql.js Database 实例（init 后赋值）
let db;

// 评测结果的标准字段（其余字段归入 extra_fields JSON 列）
const STD_RESULT_FIELDS = new Set([
  'id', 'group_id', 'test_case_id',
  'model_response', 'is_correct', 'runtime_ms', 'token_count',
  'reason', 'annotation', 'think',
  'ai_scores', 'traj_diagnosis', 'trajectory',
  'sub_category',
]);

// ========== SQLite 表结构 ==========
function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL, description TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'evaluation', date TEXT NOT NULL,
    owner TEXT DEFAULT '', ai_report TEXT, conclusion TEXT,
    created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
    question TEXT NOT NULL, expected_answer TEXT DEFAULT '', category_tag TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS groups_t (
    id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
    name TEXT NOT NULL, model TEXT DEFAULT '', eval_dataset TEXT DEFAULT '',
    parameters TEXT DEFAULT '{}', error_clusters TEXT,
    created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS training_metrics (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL,
    accuracy REAL DEFAULT 0, precision REAL DEFAULT 0,
    recall REAL DEFAULT 0, f1_score REAL DEFAULT 0,
    token_count REAL DEFAULT 0, runtime REAL DEFAULT 0,
    loss_curve TEXT DEFAULT '[]', accuracy_curve TEXT DEFAULT '[]',
    custom_metrics TEXT DEFAULT '{}'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS evaluation_results (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL, test_case_id TEXT NOT NULL,
    model_response TEXT DEFAULT '', is_correct INTEGER DEFAULT 0,
    score REAL, runtime_ms REAL DEFAULT 0, token_count REAL DEFAULT 0,
    reason TEXT, annotation TEXT, think TEXT,
    ai_scores TEXT, traj_diagnosis TEXT, trajectory TEXT,
    sub_category TEXT, custom_scores TEXT,
    extra_fields TEXT DEFAULT '{}'
  )`);
}

// ========== SQLite → 内存 ==========
function readDataFromSQLite() {
  const expRows = execAll('SELECT * FROM experiments ORDER BY created_at');
  const tcRows = execAll('SELECT * FROM test_cases');
  const grpRows = execAll('SELECT * FROM groups_t');
  const tmRows = execAll('SELECT * FROM training_metrics');
  const erRows = execAll('SELECT * FROM evaluation_results');

  // 直接构建 experiments → groups → results 嵌套结构（无 categories 层级）
  const expMap = new Map();

  const experiments = expRows.map((e) => {
    const exp = {
      id: e.id, name: e.name,
      description: e.description, type: e.type, date: e.date,
      owner: e.owner || '', created_at: e.created_at,
      ai_report: e.ai_report || undefined,
      conclusion: e.conclusion || undefined,
      groups: [], test_cases: [],
    };
    expMap.set(exp.id, exp);
    return exp;
  });

  for (const tc of tcRows) {
    const exp = expMap.get(tc.experiment_id);
    if (exp) exp.test_cases.push({
      id: tc.id, experiment_id: tc.experiment_id,
      question: tc.question, expected_answer: tc.expected_answer,
      category_tag: tc.category_tag || '',
    });
  }

  const grpMap = new Map();
  for (const g of grpRows) {
    let parameters = {};
    try { parameters = JSON.parse(g.parameters || '{}'); } catch {}
    let errorClusters = undefined;
    try { errorClusters = g.error_clusters ? JSON.parse(g.error_clusters) : undefined; } catch {}

    const group = {
      id: g.id, experiment_id: g.experiment_id, name: g.name,
      model: g.model || '', eval_dataset: g.eval_dataset || '',
      parameters, created_at: g.created_at,
      error_clusters: errorClusters,
      evaluation_results: [],
    };
    grpMap.set(group.id, group);
    const exp = expMap.get(group.experiment_id);
    if (exp) exp.groups.push(group);
  }

  for (const tm of tmRows) {
    const group = grpMap.get(tm.group_id);
    if (group) {
      group.training_metrics = {
        id: tm.id,
        accuracy: tm.accuracy ?? 0, precision: tm.precision ?? 0,
        recall: tm.recall ?? 0, f1_score: tm.f1_score ?? 0,
        token_count: tm.token_count ?? 0, runtime: tm.runtime ?? 0,
        loss_curve: tryParseJSON(tm.loss_curve, []),
        accuracy_curve: tryParseJSON(tm.accuracy_curve, []),
        custom_metrics: tryParseJSON(tm.custom_metrics, {}),
      };
    }
  }

  for (const er of erRows) {
    const group = grpMap.get(er.group_id);
    if (group) {
      const extra = tryParseJSON(er.extra_fields, {});
      group.evaluation_results.push({
        ...extra,
        id: er.id, group_id: er.group_id, test_case_id: er.test_case_id,
        model_response: er.model_response || '',
        is_correct: er.is_correct ?? 0,
        runtime_ms: er.runtime_ms ?? 0,
        token_count: er.token_count ?? 0,
        reason: er.reason || undefined,
        annotation: er.annotation || undefined,
        think: er.think || undefined,
        ai_scores: tryParseJSON(er.ai_scores, undefined),
        traj_diagnosis: er.traj_diagnosis || undefined,
        trajectory: tryParseJSON(er.trajectory, undefined),
        sub_category: er.sub_category || undefined,
      });
    }
  }

  data.experiments = experiments;
}

/** 执行 SELECT 并返回对象数组 */
function execAll(sql) {
  const results = db.exec(sql);
  if (!results || results.length === 0) return [];
  const { columns, values } = results[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function tryParseJSON(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ========== 内存 → SQLite ==========
function writeDataToSQLite() {
  db.run('DELETE FROM evaluation_results');
  db.run('DELETE FROM training_metrics');
  db.run('DELETE FROM groups_t');
  db.run('DELETE FROM test_cases');
  db.run('DELETE FROM experiments');

  const insertExp = db.prepare('INSERT INTO experiments VALUES (?,?,?,?,?,?,?,?,?)');
  const insertTC = db.prepare('INSERT INTO test_cases VALUES (?,?,?,?,?)');
  const insertGrp = db.prepare('INSERT INTO groups_t VALUES (?,?,?,?,?,?,?,?)');
  const insertTM = db.prepare('INSERT INTO training_metrics VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insertER = db.prepare('INSERT INTO evaluation_results VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

  for (const exp of data.experiments) {
    insertExp.run([
      exp.id, exp.name, exp.description || '',
      exp.type, exp.date, exp.owner || '',
      exp.ai_report || null, exp.conclusion || null,
      exp.created_at,
    ]);
    for (const tc of (exp.test_cases || [])) {
      insertTC.run([tc.id, tc.experiment_id, tc.question, tc.expected_answer || '', tc.category_tag || '']);
    }
    for (const g of (exp.groups || [])) {
      insertGrp.run([
        g.id, g.experiment_id, g.name, g.model || '', g.eval_dataset || '',
        JSON.stringify(g.parameters || {}),
        g.error_clusters ? JSON.stringify(g.error_clusters) : null,
        g.created_at,
      ]);
      if (g.training_metrics) {
        const m = g.training_metrics;
        insertTM.run([
          m.id, g.id,
          m.accuracy ?? 0, m.precision ?? 0, m.recall ?? 0, m.f1_score ?? 0,
          m.token_count ?? 0, m.runtime ?? 0,
          JSON.stringify(m.loss_curve || []),
          JSON.stringify(m.accuracy_curve || []),
          JSON.stringify(m.custom_metrics || {}),
        ]);
      }
      for (const er of (g.evaluation_results || [])) {
        const extra = {};
        for (const key of Object.keys(er)) {
          if (!STD_RESULT_FIELDS.has(key)) extra[key] = er[key];
        }
        insertER.run([
          er.id, er.group_id, er.test_case_id,
          er.model_response || '', er.is_correct ?? 0,
          null, er.runtime_ms ?? 0, er.token_count ?? 0,
          er.reason || null, er.annotation || null, er.think || null,
          er.ai_scores ? JSON.stringify(er.ai_scores) : null,
          er.traj_diagnosis || null,
          er.trajectory ? JSON.stringify(er.trajectory) : null,
          er.sub_category || null,
          null,
          JSON.stringify(extra),
        ]);
      }
    }
  }

  insertExp.free();
  insertTC.free();
  insertGrp.free();
  insertTM.free();
  insertER.free();
}

// ========== 持久化到磁盘（原子写入 + debounce） ==========
let saveTimer = null;
let savePending = false;

function save() {
  if (saveTimer) { savePending = true; return; } // 已有定时器，标记待保存
  writeDataToSQLite();
  saveTimer = setTimeout(() => {
    if (savePending) { writeDataToSQLite(); savePending = false; }
    const buffer = db.export();
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, Buffer.from(buffer));
    fs.renameSync(tmpPath, DB_PATH);
    saveTimer = null;
  }, 50); // 50ms 内合并写入
}

// 立即写入（用于关键操作后）
let lastBackup = 0;
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; savePending = false; }
  writeDataToSQLite();
  const buffer = db.export();
  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, Buffer.from(buffer));
  fs.renameSync(tmpPath, DB_PATH);
  // 每小时自动备份一次
  if (Date.now() - lastBackup > 3600000) { backup(); lastBackup = Date.now(); }
}

// ========== 初始化（异步：需加载 sql.js WASM） ==========
async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    // 已有 SQLite 数据库 → 直接加载
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    readDataFromSQLite();
    console.log(`📂 已加载 SQLite 数据库 (${countAll()})`);
  } else if (fs.existsSync(JSON_PATH)) {
    // 旧 JSON 文件 → 迁移到 SQLite
    console.log('📦 检测到 data.json，正在迁移到 SQLite...');
    db = new SQL.Database();
    createTables();
    const old = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    // 兼容旧格式：categories[].experiments[] 或直接 experiments[]
    if (old.categories) {
      data.experiments = [];
      for (const c of old.categories) {
        for (const e of (c.experiments || [])) {
          delete e.category_id;
          data.experiments.push(e);
        }
      }
    } else if (old.experiments) {
      data.experiments = old.experiments;
    }
    save();
    const backupPath = JSON_PATH.replace('.json', '.backup.json');
    fs.renameSync(JSON_PATH, backupPath);
    console.log(`✅ 迁移完成，旧文件备份为 data.backup.json`);
  } else {
    // 全新启动 → 建空表
    db = new SQL.Database();
    createTables();
    save();
    console.log('📂 已创建空数据库');
  }
}

function countAll() {
  let groups = 0, results = 0;
  for (const e of data.experiments) {
    groups += (e.groups || []).length;
    for (const g of (e.groups || [])) {
      results += (g.evaluation_results || []).length;
    }
  }
  return `${data.experiments.length} 个实验, ${groups} 个实验组, ${results} 条评测结果`;
}

// ========== 查询辅助函数（与旧接口完全兼容） ==========
function findExp(id) { return data.experiments.find((e) => e.id === id) || null; }
function findGroup(id) { for (const e of data.experiments) for (const g of (e.groups || [])) { if (g.id === id) return g; } return null; }
function findTC(id) { for (const e of data.experiments) for (const tc of (e.test_cases || [])) { if (tc.id === id) return tc; } return null; }

module.exports = { data, save, saveNow, findExp, findGroup, findTC, init };
