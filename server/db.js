const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'data.sqlite');
const JSON_PATH = path.join(__dirname, 'data.json');

// ========== 内存数据（路由层操作对象，与 SQLite 双向同步） ==========
let data = { categories: [] };

// sql.js Database 实例（init 后赋值）
let db;

// 评测结果的标准字段（其余字段归入 extra_fields JSON 列）
const STD_RESULT_FIELDS = new Set([
  'id', 'group_id', 'test_case_id',
  'model_response', 'is_correct', 'score', 'runtime_ms', 'token_count',
  'reason', 'annotation', 'think',
  'ai_scores', 'traj_diagnosis', 'trajectory',
  'sub_category', 'custom_scores',
]);

// ========== SQLite 表结构 ==========
function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY, category_id TEXT NOT NULL,
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
  const catRows = execAll('SELECT * FROM categories ORDER BY created_at');
  const expRows = execAll('SELECT * FROM experiments');
  const tcRows = execAll('SELECT * FROM test_cases');
  const grpRows = execAll('SELECT * FROM groups_t');
  const tmRows = execAll('SELECT * FROM training_metrics');
  const erRows = execAll('SELECT * FROM evaluation_results');

  // 构建 categories → experiments → groups → results 嵌套结构
  const categories = catRows.map((c) => ({
    id: c.id, name: c.name, description: c.description, created_at: c.created_at,
    experiments: [],
  }));

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const expMap = new Map();

  for (const e of expRows) {
    const exp = {
      id: e.id, category_id: e.category_id, name: e.name,
      description: e.description, type: e.type, date: e.date,
      owner: e.owner || '', created_at: e.created_at,
      ai_report: e.ai_report || undefined,
      conclusion: e.conclusion || undefined,
      groups: [], test_cases: [],
    };
    expMap.set(exp.id, exp);
    const cat = catMap.get(exp.category_id);
    if (cat) cat.experiments.push(exp);
  }

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
        ...extra, // 自定义字段
        id: er.id, group_id: er.group_id, test_case_id: er.test_case_id,
        model_response: er.model_response || '',
        is_correct: er.is_correct ?? 0,
        score: er.score ?? undefined,
        runtime_ms: er.runtime_ms ?? 0,
        token_count: er.token_count ?? 0,
        reason: er.reason || undefined,
        annotation: er.annotation || undefined,
        think: er.think || undefined,
        ai_scores: tryParseJSON(er.ai_scores, undefined),
        traj_diagnosis: er.traj_diagnosis || undefined,
        trajectory: tryParseJSON(er.trajectory, undefined),
        sub_category: er.sub_category || undefined,
        custom_scores: tryParseJSON(er.custom_scores, undefined),
      });
    }
  }

  data.categories = categories;
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
  db.run('DELETE FROM categories');

  const insertCat = db.prepare('INSERT INTO categories VALUES (?,?,?,?)');
  const insertExp = db.prepare('INSERT INTO experiments VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insertTC = db.prepare('INSERT INTO test_cases VALUES (?,?,?,?,?)');
  const insertGrp = db.prepare('INSERT INTO groups_t VALUES (?,?,?,?,?,?,?,?)');
  const insertTM = db.prepare('INSERT INTO training_metrics VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insertER = db.prepare('INSERT INTO evaluation_results VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

  for (const cat of data.categories) {
    insertCat.run([cat.id, cat.name, cat.description || '', cat.created_at]);
    for (const exp of (cat.experiments || [])) {
      insertExp.run([
        exp.id, exp.category_id, exp.name, exp.description || '',
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
          // 分离标准字段和自定义字段
          const extra = {};
          for (const key of Object.keys(er)) {
            if (!STD_RESULT_FIELDS.has(key)) extra[key] = er[key];
          }
          insertER.run([
            er.id, er.group_id, er.test_case_id,
            er.model_response || '', er.is_correct ?? 0,
            er.score ?? null, er.runtime_ms ?? 0, er.token_count ?? 0,
            er.reason || null, er.annotation || null, er.think || null,
            er.ai_scores ? JSON.stringify(er.ai_scores) : null,
            er.traj_diagnosis || null,
            er.trajectory ? JSON.stringify(er.trajectory) : null,
            er.sub_category || null,
            er.custom_scores ? JSON.stringify(er.custom_scores) : null,
            JSON.stringify(extra),
          ]);
        }
      }
    }
  }

  insertCat.free();
  insertExp.free();
  insertTC.free();
  insertGrp.free();
  insertTM.free();
  insertER.free();
}

// ========== 持久化到磁盘（原子写入） ==========
function save() {
  writeDataToSQLite();
  const buffer = db.export();
  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, Buffer.from(buffer));
  fs.renameSync(tmpPath, DB_PATH);
}

// ========== 种子数据 ==========
function seed() {
  console.log('🌱 插入 seed 数据...');

  const cat1Id = uuidv4();
  const cat2Id = uuidv4();
  const cat3Id = uuidv4();

  const now = () => new Date().toISOString();

  data.categories = [
    {
      id: cat1Id, name: '大语言模型评测',
      description: '围绕大语言模型在多个下游任务上的表现进行系统评测，涵盖不同模型架构、微调策略与推理配置的对比实验。',
      created_at: now(),
      experiments: [
        {
          id: uuidv4(), category_id: cat1Id, name: 'GPT 系列模型指令遵循能力对比',
          description: '对比 GPT-3.5-Turbo、GPT-4-Turbo、GPT-4o 在 AlpacaEval 上的表现。',
          type: 'evaluation', date: '2026-05-12', created_at: now(),
          groups: [],
          test_cases: [],
        },
        {
          id: uuidv4(), category_id: cat1Id, name: 'LoRA 微调策略效果验证',
          description: '在 LLaMA-3-8B 上对比 Full Fine-Tune、LoRA (r=8)、LoRA (r=64)。',
          type: 'training', date: '2026-06-03', created_at: now(),
          groups: [],
          test_cases: [],
        },
      ],
    },
    {
      id: cat2Id, name: '图像分类研究',
      description: '在 ImageNet-1K 和 CIFAR-100 上对不同骨干网络进行消融实验。',
      created_at: now(),
      experiments: [
        {
          id: uuidv4(), category_id: cat2Id, name: 'ResNet 架构变体 ImageNet 分类对比',
          description: '比较 ResNet-50、ResNet-101、ResNeXt-50。',
          type: 'training', date: '2026-04-20', created_at: now(),
          groups: [],
          test_cases: [],
        },
        {
          id: uuidv4(), category_id: cat2Id, name: '数据增强策略消融实验',
          description: '对比 RandomCrop、MixUp、CutMix、RandAugment。',
          type: 'training', date: '2026-06-15', created_at: now(),
          groups: [],
          test_cases: [],
        },
      ],
    },
    {
      id: cat3Id, name: '文本分类与 NER 基线',
      description: '在多个中文 NLP 基准上评测主流预训练模型。',
      created_at: now(),
      experiments: [
        {
          id: uuidv4(), category_id: cat3Id, name: '中文 NER 模型效果对比',
          description: '在 MSRA-NER 上对比 BERT-base、RoBERTa-large、ELECTRA-base。',
          type: 'evaluation', date: '2026-03-08', created_at: now(),
          groups: [],
          test_cases: [],
        },
      ],
    },
  ];

  // === GPT 实验 ===
  const gptExp = data.categories[0].experiments[0];
  gptExp.test_cases = [
    { id: uuidv4(), experiment_id: gptExp.id, question: '将以下句子翻译成英文：今天天气真好。', expected_answer: 'The weather is really nice today.', category_tag: '翻译' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '请用Python写一个快速排序算法。', expected_answer: 'def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[0]\n    left = [x for x in arr[1:] if x <= pivot]\n    right = [x for x in arr[1:] if x > pivot]\n    return quicksort(left) + [pivot] + quicksort(right)', category_tag: '代码生成' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '法国首都是哪里？', expected_answer: '巴黎', category_tag: '知识问答' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '请解释什么是机器学习中的过拟合。', expected_answer: '过拟合是指模型在训练数据上表现很好，但在未见过的测试数据上表现很差的现象。', category_tag: '概念解释' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '计算 123 * 456 的结果。', expected_answer: '56088', category_tag: '数学计算' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '请将 "Hello, how are you?" 翻译成中文。', expected_answer: '你好，你怎么样？', category_tag: '翻译' },
  ];

  const grpGpt35 = {
    id: uuidv4(), experiment_id: gptExp.id, name: 'GPT-3.5-Turbo', model: 'gpt-3.5-turbo-0125',
    parameters: { temperature: 0.7, max_tokens: 2048 }, created_at: now(),
  };
  const grpGpt4 = {
    id: uuidv4(), experiment_id: gptExp.id, name: 'GPT-4o', model: 'gpt-4o-2024-05-13',
    parameters: { temperature: 0.7, max_tokens: 4096 }, created_at: now(),
  };

  grpGpt35.evaluation_results = gptExp.test_cases.map((tc, i) => {
    const responses = [
      { resp: 'Translate the following sentence into English: The weather is really nice today.', correct: 0, score: 0.0, rt: 320, tok: 45 },
      { resp: 'def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[0]\n    left = [x for x in arr[1:] if x <= pivot]\n    right = [x for x in arr[1:] if x > pivot]\n    return quicksort(left) + [pivot] + quicksort(right)', correct: 1, score: 1.0, rt: 580, tok: 120 },
      { resp: '巴黎', correct: 1, score: 1.0, rt: 210, tok: 28 },
      { resp: '过拟合是机器学习中模型在训练数据上表现良好但在新数据上表现差的现象。', correct: 1, score: 0.85, rt: 450, tok: 95 },
      { resp: '56088', correct: 1, score: 1.0, rt: 180, tok: 22 },
      { resp: '你好，你怎么样？', correct: 1, score: 1.0, rt: 250, tok: 35 },
    ];
    const r = responses[i];
    return { id: uuidv4(), group_id: grpGpt35.id, test_case_id: tc.id, model_response: r.resp, is_correct: r.correct, score: r.score, runtime_ms: r.rt, token_count: r.tok };
  });

  grpGpt4.evaluation_results = gptExp.test_cases.map((tc, i) => {
    const responses = [
      { resp: 'The weather is really nice today.', correct: 1, score: 1.0, rt: 280, tok: 40 },
      { resp: 'def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[0]\n    left = [x for x in arr[1:] if x <= pivot]\n    right = [x for x in arr[1:] if x > pivot]\n    return quicksort(left) + [pivot] + quicksort(right)', correct: 1, score: 1.0, rt: 520, tok: 105 },
      { resp: '巴黎是法国的首都。', correct: 1, score: 1.0, rt: 190, tok: 25 },
      { resp: '过拟合（Overfitting）是机器学习中的一个核心问题，指的是模型在训练数据上达到了很高的准确率，但在验证集或测试集上表现显著下降。', correct: 1, score: 1.0, rt: 620, tok: 150 },
      { resp: '56088', correct: 1, score: 1.0, rt: 160, tok: 20 },
      { resp: '你好，你怎么样？', correct: 1, score: 1.0, rt: 230, tok: 32 },
    ];
    const r = responses[i];
    return { id: uuidv4(), group_id: grpGpt4.id, test_case_id: tc.id, model_response: r.resp, is_correct: r.correct, score: r.score, runtime_ms: r.rt, token_count: r.tok };
  });

  gptExp.groups = [grpGpt35, grpGpt4];

  // === LoRA 实验 (training) ===
  const loraExp = data.categories[0].experiments[1];
  loraExp.groups = [
    { id: uuidv4(), experiment_id: loraExp.id, name: 'Full Fine-Tune', model: 'LLaMA-3-8B (Full FT)', parameters: { lr: '2e-5', batch_size: 32, epochs: 3, trainable_params: '8.03B' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.851, precision: 0.848, recall: 0.855, f1_score: 0.851, token_count: 2400000, runtime: 14400, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: loraExp.id, name: 'LoRA (r=8)', model: 'LLaMA-3-8B + LoRA r=8', parameters: { lr: '5e-4', batch_size: 64, epochs: 5, trainable_params: '4.2M' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.823, precision: 0.819, recall: 0.827, f1_score: 0.823, token_count: 2400000, runtime: 2800, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: loraExp.id, name: 'LoRA (r=64)', model: 'LLaMA-3-8B + LoRA r=64', parameters: { lr: '5e-4', batch_size: 64, epochs: 5, trainable_params: '33.6M' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.841, precision: 0.837, recall: 0.845, f1_score: 0.841, token_count: 2400000, runtime: 5200, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: loraExp.id, name: 'QLoRA (r=64, 4bit)', model: 'LLaMA-3-8B + QLoRA 4bit', parameters: { lr: '5e-4', batch_size: 64, epochs: 5, trainable_params: '33.6M' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.819, precision: 0.814, recall: 0.823, f1_score: 0.818, token_count: 2400000, runtime: 3500, loss_curve: [], accuracy_curve: [] } },
  ];

  // === ResNet (training) ===
  const rnExp = data.categories[1].experiments[0];
  rnExp.groups = [
    { id: uuidv4(), experiment_id: rnExp.id, name: 'ResNet-50', model: 'ResNet-50', parameters: { lr: 0.1, batch_size: 256, epochs: 90, optimizer: 'SGD' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.761, precision: 0.758, recall: 0.764, f1_score: 0.761, token_count: 0, runtime: 32400, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: rnExp.id, name: 'ResNet-101', model: 'ResNet-101', parameters: { lr: 0.1, batch_size: 256, epochs: 90, optimizer: 'SGD' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.774, precision: 0.771, recall: 0.777, f1_score: 0.774, token_count: 0, runtime: 46800, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: rnExp.id, name: 'ResNeXt-50', model: 'ResNeXt-50-32x4d', parameters: { lr: 0.1, batch_size: 256, epochs: 90, optimizer: 'SGD' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.791, precision: 0.788, recall: 0.794, f1_score: 0.791, token_count: 0, runtime: 43200, loss_curve: [], accuracy_curve: [] } },
  ];

  // === 数据增强 (training) ===
  const augExp = data.categories[1].experiments[1];
  augExp.groups = [
    { id: uuidv4(), experiment_id: augExp.id, name: 'Baseline (RandomCrop)', model: 'ResNet-50 + RandomCrop', parameters: { augment: 'RandomCrop+Flip' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.723, precision: 0.72, recall: 0.726, f1_score: 0.723, token_count: 0, runtime: 18000, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: augExp.id, name: 'MixUp (α=0.2)', model: 'ResNet-50 + MixUp', parameters: { augment: 'MixUp α=0.2' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.758, precision: 0.755, recall: 0.762, f1_score: 0.758, token_count: 0, runtime: 19800, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: augExp.id, name: 'CutMix (α=1.0)', model: 'ResNet-50 + CutMix', parameters: { augment: 'CutMix α=1.0' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.774, precision: 0.771, recall: 0.778, f1_score: 0.774, token_count: 0, runtime: 20500, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: augExp.id, name: 'RandAugment', model: 'ResNet-50 + RandAugment', parameters: { augment: 'RandAugment N=2 M=14' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.801, precision: 0.798, recall: 0.804, f1_score: 0.801, token_count: 0, runtime: 22500, loss_curve: [], accuracy_curve: [] } },
  ];

  // === NER 实验 (evaluation) ===
  const nerExp = data.categories[2].experiments[0];
  nerExp.test_cases = [
    { id: uuidv4(), experiment_id: nerExp.id, question: '张三在北京大学读书。', expected_answer: 'PER:张三 ORG:北京大学', category_tag: '人物+机构' },
    { id: uuidv4(), experiment_id: nerExp.id, question: '华为发布了Mate 60 Pro手机。', expected_answer: 'ORG:华为 PRO:Mate 60 Pro', category_tag: '机构+产品' },
    { id: uuidv4(), experiment_id: nerExp.id, question: '习近平主席访问了法国。', expected_answer: 'PER:习近平 LOC:法国', category_tag: '人物+地点' },
    { id: uuidv4(), experiment_id: nerExp.id, question: '2024年奥运会将在巴黎举办。', expected_answer: 'DAT:2024年 EVE:奥运会 LOC:巴黎', category_tag: '时间+事件+地点' },
  ];

  const grpBert = { id: uuidv4(), experiment_id: nerExp.id, name: 'BERT-base-Chinese', model: 'bert-base-chinese', parameters: { lr: '3e-5', batch_size: 32, epochs: 10 }, created_at: now() };
  const grpRoBerta = { id: uuidv4(), experiment_id: nerExp.id, name: 'RoBERTa-large-Chinese', model: 'hfl/roberta-large-chinese', parameters: { lr: '2e-5', batch_size: 16, epochs: 8 }, created_at: now() };

  grpBert.evaluation_results = nerExp.test_cases.map((tc, i) => {
    const responses = [
      { resp: 'PER:张三 ORG:北京大学', correct: 1, rt: 45, tok: 120 },
      { resp: 'ORG:华为 PRO:Mate 60 Pro', correct: 1, rt: 52, tok: 140 },
      { resp: 'PER:习近平 LOC:法国', correct: 1, rt: 38, tok: 105 },
      { resp: 'DAT:2024年 EVE:奥运会 LOC:巴黎', correct: 1, rt: 48, tok: 130 },
    ];
    const r = responses[i];
    return { id: uuidv4(), group_id: grpBert.id, test_case_id: tc.id, model_response: r.resp, is_correct: r.correct, score: r.correct ? 1 : 0, runtime_ms: r.rt, token_count: r.tok };
  });

  grpRoBerta.evaluation_results = nerExp.test_cases.map((tc, i) => {
    const responses = [
      { resp: 'PER:张三 ORG:北京大学', correct: 1, rt: 78, tok: 200 },
      { resp: 'ORG:华为 PRO:Mate 60 Pro', correct: 1, rt: 85, tok: 220 },
      { resp: 'PER:习近平 LOC:法国', correct: 1, rt: 72, tok: 190 },
      { resp: 'DAT:2024年 EVE:奥运会 LOC:巴黎', correct: 1, rt: 80, tok: 210 },
    ];
    const r = responses[i];
    return { id: uuidv4(), group_id: grpRoBerta.id, test_case_id: tc.id, model_response: r.resp, is_correct: r.correct, score: r.correct ? 1 : 0, runtime_ms: r.rt, token_count: r.tok };
  });

  nerExp.groups = [grpBert, grpRoBerta];

  // === Agent评测 ===
  const cat4Id = uuidv4();
  data.categories.push({
    id: cat4Id, name: 'Agent评测',
    description: '评测AI Agent在复杂任务上的执行能力。导入含轨迹数据的评测结果将自动切换为Agent风格展示。',
    created_at: now(),
    experiments: [],
  });

  const agentExp = {
    id: uuidv4(), category_id: cat4Id, name: 'WebAgent 网页导航评测',
    description: '评测Agent在模拟网页环境中完成信息检索和操作任务的能力，记录每步执行轨迹。',
    type: 'evaluation', date: '2026-06-20', created_at: now(),
    groups: [], test_cases: [],
  };
  data.categories[3].experiments.push(agentExp);

  agentExp.test_cases = [
    { id: uuidv4(), experiment_id: agentExp.id, question: '在百度搜索"人工智能最新进展"，并总结前三条结果的标题', expected_answer: '搜索成功并返回三条相关结果', category_tag: '搜索' },
    { id: uuidv4(), experiment_id: agentExp.id, question: '登录GitHub，找到trending页面中star最多的Python项目，告诉我项目名和star数', expected_answer: '成功导航并提取项目信息', category_tag: '导航+提取' },
    { id: uuidv4(), experiment_id: agentExp.id, question: '打开天气网站，查询北京今天的气温和湿度', expected_answer: '返回气温和湿度数据', category_tag: '信息检索' },
    { id: uuidv4(), experiment_id: agentExp.id, question: '在购物网站搜索"机械键盘"，按价格从低到高排序，告诉我最便宜的三款产品名称', expected_answer: '列出三款产品名称和价格', category_tag: '搜索+排序' },
    { id: uuidv4(), experiment_id: agentExp.id, question: '将一段中文字符串翻译成英文后，再用英文在Wikipedia上搜索相关条目', expected_answer: '翻译并完成搜索', category_tag: '多步操作' },
  ];

  const grpGpt4Agent = {
    id: uuidv4(), experiment_id: agentExp.id, name: 'GPT-4o Agent', model: 'gpt-4o + ReAct',
    parameters: { temperature: 0.5, max_steps: 10, tool_set: 'web_search, click, type, scroll' }, created_at: now(),
  };
  const grpClaudeAgent = {
    id: uuidv4(), experiment_id: agentExp.id, name: 'Claude Agent', model: 'claude-sonnet-5 + ReAct',
    parameters: { temperature: 0.5, max_steps: 10, tool_set: 'web_search, click, type, scroll' }, created_at: now(),
  };

  grpGpt4Agent.evaluation_results = agentExp.test_cases.map((tc, i) => {
    const cases = [
      {
        resp: '搜索成功，找到3条相关结果',
        correct: 1, score: 0.9, rt: 3200, tok: 450,
        trajectory: [
          { step: 1, thought: '需要打开百度搜索', action: 'navigate("https://www.baidu.com")', observation: '页面加载成功' },
          { step: 2, thought: '在搜索框输入关键词', action: 'type("search-box", "人工智能最新进展")', observation: '输入完成' },
          { step: 3, thought: '点击搜索按钮', action: 'click("search-btn")', observation: '搜索结果已显示' },
          { step: 4, thought: '提取前三条结果的标题', action: 'extract(".result-item h3", 3)', observation: '已提取3条标题' },
        ],
        custom_scores: { search_accuracy: 1.0, extraction_quality: 0.9, efficiency: 0.8 },
      },
      {
        resp: '找到项目: anthropic/claude-code, 15.2k stars',
        correct: 1, score: 0.85, rt: 5800, tok: 720,
        trajectory: [
          { step: 1, thought: '先导航到GitHub', action: 'navigate("https://github.com")', observation: 'GitHub首页加载成功' },
          { step: 2, thought: '点击Trending链接', action: 'click("Trending")', observation: 'Trending页面加载中' },
          { step: 3, thought: '选择Python语言过滤', action: 'click("Python-filter")', observation: '已过滤Python项目' },
          { step: 4, thought: '获取第一个项目信息', action: 'extract(".Box-row:first-child")', observation: '提取到项目信息' },
          { step: 5, thought: 'star数需要转换', action: 'parse_number("15.2k")', observation: '约15200 stars' },
        ],
        custom_scores: { search_accuracy: 0.9, extraction_quality: 0.85, efficiency: 0.7 },
      },
      {
        resp: '北京今天气温22°C，湿度45%',
        correct: 1, score: 1.0, rt: 2500, tok: 350,
        trajectory: [
          { step: 1, thought: '需要打开天气网站', action: 'navigate("https://weather.com")', observation: '天气网站加载成功' },
          { step: 2, thought: '搜索北京天气', action: 'type("search", "北京")', observation: '输入完成' },
          { step: 3, thought: '提取气温和湿度', action: 'extract(".temp,.humidity")', observation: '气温22°C，湿度45%' },
        ],
        custom_scores: { search_accuracy: 1.0, extraction_quality: 1.0, efficiency: 1.0 },
      },
      {
        resp: '错误: 购物网站搜索结果解析失败，工具返回超时',
        correct: 0, score: 0.2, rt: 8000, tok: 680,
        trajectory: [
          { step: 1, thought: '打开购物网站', action: 'navigate("https://shop.example.com")', observation: '页面加载成功' },
          { step: 2, thought: '搜索机械键盘', action: 'type("search", "机械键盘")', observation: '搜索框输入完成' },
          { step: 3, thought: '点击价格排序', action: 'click("sort-price-asc")', observation: '排序中...' },
          { step: 4, thought: '提取前三个产品', action: 'extract(".product-item", 3)', observation: 'Error: 提取超时，页面结构异常' },
          { step: 5, thought: '页面结构可能变化了，尝试重试', action: 'retry("extract", ".product-card", 3)', observation: 'Error: 仍然超时' },
          { step: 6, thought: '无法完成提取，标记为失败', action: 'report_error("提取超时")', observation: '任务失败' },
        ],
        custom_scores: { search_accuracy: 0.5, extraction_quality: 0.0, efficiency: 0.1, error_recovery: 0.2 },
      },
      {
        resp: '翻译: "AI is developing rapidly" → Wikipedia搜索返回Artificial Intelligence条目',
        correct: 1, score: 0.8, rt: 4200, tok: 550,
        trajectory: [
          { step: 1, thought: '先翻译中文字符串', action: 'translate("人工智能发展迅速")', observation: 'AI is developing rapidly' },
          { step: 2, thought: '用翻译结果搜索Wikipedia', action: 'navigate("https://en.wikipedia.org")', observation: 'Wikipedia加载成功' },
          { step: 3, thought: '搜索AI development', action: 'type("search", "AI is developing rapidly")', observation: '输入完成' },
          { step: 4, thought: '查看搜索结果', action: 'click("search-btn")', observation: '跳转到Artificial Intelligence条目' },
          { step: 5, thought: '任务完成', action: 'done()', observation: '成功找到相关条目' },
        ],
        custom_scores: { search_accuracy: 0.9, extraction_quality: 0.8, efficiency: 0.75 },
      },
    ];
    const r = cases[i];
    return { id: uuidv4(), group_id: grpGpt4Agent.id, test_case_id: tc.id, model_response: r.resp, is_correct: r.correct, score: r.score, runtime_ms: r.rt, token_count: r.tok, trajectory: r.trajectory, custom_scores: r.custom_scores };
  });

  grpClaudeAgent.evaluation_results = agentExp.test_cases.map((tc, i) => {
    const cases = [
      {
        resp: '搜索成功，找到3条相关结果，已总结标题',
        correct: 1, score: 0.95, rt: 2800, tok: 380,
        trajectory: [
          { step: 1, thought: '导航到百度', action: 'navigate("https://www.baidu.com")', observation: '页面加载成功' },
          { step: 2, thought: '输入搜索关键词', action: 'type("search-box", "人工智能最新进展")', observation: '输入完成' },
          { step: 3, thought: '点击搜索', action: 'click("search-btn")', observation: '搜索完成' },
          { step: 4, thought: '提取结果', action: 'extract(".result-item h3", 3)', observation: '成功提取3条标题' },
        ],
        custom_scores: { search_accuracy: 1.0, extraction_quality: 0.95, efficiency: 0.9 },
      },
      {
        resp: '找到: anthropic/claude-code, 15.2k stars',
        correct: 1, score: 0.9, rt: 4800, tok: 620,
        trajectory: [
          { step: 1, thought: '打开GitHub', action: 'navigate("https://github.com")', observation: 'GitHub加载成功' },
          { step: 2, thought: '进入Trending', action: 'click("Trending")', observation: 'Trending页面显示' },
          { step: 3, thought: '选Python', action: 'click("Python-filter")', observation: '过滤完成' },
          { step: 4, thought: '提取项目名和stars', action: 'extract(".Box-row:first-child")', observation: 'claude-code, 15.2k stars' },
        ],
        custom_scores: { search_accuracy: 0.95, extraction_quality: 0.9, efficiency: 0.8 },
      },
      {
        resp: '北京今天气温22°C，湿度45%',
        correct: 1, score: 1.0, rt: 2100, tok: 300,
        trajectory: [
          { step: 1, thought: '打开天气网站', action: 'navigate("https://weather.com")', observation: '加载成功' },
          { step: 2, thought: '搜索北京', action: 'type("search", "北京")', observation: '输入完成' },
          { step: 3, thought: '提取数据', action: 'extract(".temp,.humidity")', observation: '22°C, 45%' },
        ],
        custom_scores: { search_accuracy: 1.0, extraction_quality: 1.0, efficiency: 1.0 },
      },
      {
        resp: '产品列表: 品牌A ¥99, 品牌B ¥129, 品牌C ¥149',
        correct: 1, score: 0.85, rt: 6500, tok: 580,
        trajectory: [
          { step: 1, thought: '打开购物网站', action: 'navigate("https://shop.example.com")', observation: '页面加载成功' },
          { step: 2, thought: '搜索机械键盘', action: 'type("search", "机械键盘")', observation: '输入完成' },
          { step: 3, thought: '点击排序', action: 'click("sort-price-asc")', observation: '正在排序...' },
          { step: 4, thought: '提取前三个', action: 'extract(".product-card", 3)', observation: '品牌A ¥99, 品牌B ¥129, 品牌C ¥149' },
          { step: 5, thought: '提取成功', action: 'done()', observation: '任务完成' },
        ],
        custom_scores: { search_accuracy: 0.9, extraction_quality: 0.85, efficiency: 0.7, error_recovery: 0.9 },
      },
      {
        resp: '翻译: "AI is developing rapidly" → Wikipedia条目已找到',
        correct: 1, score: 0.85, rt: 3800, tok: 480,
        trajectory: [
          { step: 1, thought: '翻译中文', action: 'translate("人工智能发展迅速")', observation: 'AI is developing rapidly' },
          { step: 2, thought: '打开Wikipedia', action: 'navigate("https://en.wikipedia.org")', observation: '加载成功' },
          { step: 3, thought: '搜索翻译结果', action: 'type("search", "AI is developing rapidly")', observation: '输入完成' },
          { step: 4, thought: '查看条目', action: 'click("search-btn")', observation: '跳转到AI条目' },
        ],
        custom_scores: { search_accuracy: 0.95, extraction_quality: 0.85, efficiency: 0.8 },
      },
    ];
    const r = cases[i];
    return { id: uuidv4(), group_id: grpClaudeAgent.id, test_case_id: tc.id, model_response: r.resp, is_correct: r.correct, score: r.score, runtime_ms: r.rt, token_count: r.tok, trajectory: r.trajectory, custom_scores: r.custom_scores };
  });

  agentExp.groups = [grpGpt4Agent, grpClaudeAgent];

  save();
  console.log('✅ Seed 数据已写入');
}

// ========== 初始化（异步：需加载 sql.js WASM） ==========
async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    // 已有 SQLite 数据库 → 直接加载
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    readDataFromSQLite();
    console.log(`📂 已加载 SQLite 数据库 (${data.categories.length} 个类别, ${countAll()})`);
  } else if (fs.existsSync(JSON_PATH)) {
    // 旧 JSON 文件 → 迁移到 SQLite
    console.log('📦 检测到 data.json，正在迁移到 SQLite...');
    db = new SQL.Database();
    createTables();
    const old = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    data.categories = old.categories || [];
    save();
    // 迁移后保留 JSON 文件作为备份
    const backupPath = JSON_PATH.replace('.json', '.backup.json');
    fs.renameSync(JSON_PATH, backupPath);
    console.log(`✅ 迁移完成 (${data.categories.length} 个类别)，旧文件备份为 data.backup.json`);
  } else {
    // 全新启动 → 建表 + seed
    db = new SQL.Database();
    createTables();
    seed();
  }
}

function countAll() {
  let exps = 0, groups = 0, results = 0;
  for (const c of data.categories) {
    exps += (c.experiments || []).length;
    for (const e of (c.experiments || [])) {
      groups += (e.groups || []).length;
      for (const g of (e.groups || [])) {
        results += (g.evaluation_results || []).length;
      }
    }
  }
  return `${exps} 个实验, ${groups} 个实验组, ${results} 条评测结果`;
}

// ========== 查询辅助函数（与旧接口完全兼容） ==========
function findCat(id) { return data.categories.find((c) => c.id === id); }
function findExp(id) { for (const c of data.categories) { const e = c.experiments.find((e) => e.id === id); if (e) return e; } return null; }
function findGroup(id) { for (const c of data.categories) for (const e of c.experiments) for (const g of (e.groups || [])) { if (g.id === id) return g; } return null; }
function findTC(id) { for (const c of data.categories) for (const e of c.experiments) for (const tc of (e.test_cases || [])) { if (tc.id === id) return tc; } return null; }

module.exports = { data, save, findCat, findExp, findGroup, findTC, init };
