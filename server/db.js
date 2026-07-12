const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'data.json');

// ========== 内存数据库 ==========
let data = {
  categories: [],
};

// ========== 持久化 ==========
function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function load() {
  if (fs.existsSync(DB_PATH)) {
    try {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      return true;
    } catch { /* corrupt file, re-seed */ }
  }
  return false;
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

  // 为评测实验添加测试用例
  const gptExp = data.categories[0].experiments[0];
  gptExp.test_cases = [
    { id: uuidv4(), experiment_id: gptExp.id, question: '将以下句子翻译成英文：今天天气真好。', expected_answer: 'The weather is really nice today.', category_tag: '翻译' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '请用Python写一个快速排序算法。', expected_answer: 'def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[0]\n    left = [x for x in arr[1:] if x <= pivot]\n    right = [x for x in arr[1:] if x > pivot]\n    return quicksort(left) + [pivot] + quicksort(right)', category_tag: '代码生成' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '法国首都是哪里？', expected_answer: '巴黎', category_tag: '知识问答' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '请解释什么是机器学习中的过拟合。', expected_answer: '过拟合是指模型在训练数据上表现很好，但在未见过的测试数据上表现很差的现象。', category_tag: '概念解释' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '计算 123 * 456 的结果。', expected_answer: '56088', category_tag: '数学计算' },
    { id: uuidv4(), experiment_id: gptExp.id, question: '请将 "Hello, how are you?" 翻译成中文。', expected_answer: '你好，你怎么样？', category_tag: '翻译' },
  ];

  // GPT 实验组 + 评测结果
  const grpGpt35 = {
    id: uuidv4(), experiment_id: gptExp.id, name: 'GPT-3.5-Turbo', model: 'gpt-3.5-turbo-0125',
    parameters: { temperature: 0.7, max_tokens: 2048 }, created_at: now(),
  };
  const grpGpt4 = {
    id: uuidv4(), experiment_id: gptExp.id, name: 'GPT-4o', model: 'gpt-4o-2024-05-13',
    parameters: { temperature: 0.7, max_tokens: 4096 }, created_at: now(),
  };

  // 为评测结果添加 evaluation_results 字段
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

  // LoRA 实验 (training)
  const loraExp = data.categories[0].experiments[1];
  loraExp.groups = [
    { id: uuidv4(), experiment_id: loraExp.id, name: 'Full Fine-Tune', model: 'LLaMA-3-8B (Full FT)', parameters: { lr: '2e-5', batch_size: 32, epochs: 3, trainable_params: '8.03B' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.851, precision: 0.848, recall: 0.855, f1_score: 0.851, token_count: 2400000, runtime: 14400, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: loraExp.id, name: 'LoRA (r=8)', model: 'LLaMA-3-8B + LoRA r=8', parameters: { lr: '5e-4', batch_size: 64, epochs: 5, trainable_params: '4.2M' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.823, precision: 0.819, recall: 0.827, f1_score: 0.823, token_count: 2400000, runtime: 2800, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: loraExp.id, name: 'LoRA (r=64)', model: 'LLaMA-3-8B + LoRA r=64', parameters: { lr: '5e-4', batch_size: 64, epochs: 5, trainable_params: '33.6M' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.841, precision: 0.837, recall: 0.845, f1_score: 0.841, token_count: 2400000, runtime: 5200, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: loraExp.id, name: 'QLoRA (r=64, 4bit)', model: 'LLaMA-3-8B + QLoRA 4bit', parameters: { lr: '5e-4', batch_size: 64, epochs: 5, trainable_params: '33.6M' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.819, precision: 0.814, recall: 0.823, f1_score: 0.818, token_count: 2400000, runtime: 3500, loss_curve: [], accuracy_curve: [] } },
  ];

  // ResNet (training)
  const rnExp = data.categories[1].experiments[0];
  rnExp.groups = [
    { id: uuidv4(), experiment_id: rnExp.id, name: 'ResNet-50', model: 'ResNet-50', parameters: { lr: 0.1, batch_size: 256, epochs: 90, optimizer: 'SGD' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.761, precision: 0.758, recall: 0.764, f1_score: 0.761, token_count: 0, runtime: 32400, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: rnExp.id, name: 'ResNet-101', model: 'ResNet-101', parameters: { lr: 0.1, batch_size: 256, epochs: 90, optimizer: 'SGD' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.774, precision: 0.771, recall: 0.777, f1_score: 0.774, token_count: 0, runtime: 46800, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: rnExp.id, name: 'ResNeXt-50', model: 'ResNeXt-50-32x4d', parameters: { lr: 0.1, batch_size: 256, epochs: 90, optimizer: 'SGD' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.791, precision: 0.788, recall: 0.794, f1_score: 0.791, token_count: 0, runtime: 43200, loss_curve: [], accuracy_curve: [] } },
  ];

  // 数据增强 (training)
  const augExp = data.categories[1].experiments[1];
  augExp.groups = [
    { id: uuidv4(), experiment_id: augExp.id, name: 'Baseline (RandomCrop)', model: 'ResNet-50 + RandomCrop', parameters: { augment: 'RandomCrop+Flip' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.723, precision: 0.72, recall: 0.726, f1_score: 0.723, token_count: 0, runtime: 18000, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: augExp.id, name: 'MixUp (α=0.2)', model: 'ResNet-50 + MixUp', parameters: { augment: 'MixUp α=0.2' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.758, precision: 0.755, recall: 0.762, f1_score: 0.758, token_count: 0, runtime: 19800, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: augExp.id, name: 'CutMix (α=1.0)', model: 'ResNet-50 + CutMix', parameters: { augment: 'CutMix α=1.0' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.774, precision: 0.771, recall: 0.778, f1_score: 0.774, token_count: 0, runtime: 20500, loss_curve: [], accuracy_curve: [] } },
    { id: uuidv4(), experiment_id: augExp.id, name: 'RandAugment', model: 'ResNet-50 + RandAugment', parameters: { augment: 'RandAugment N=2 M=14' }, created_at: now(), training_metrics: { id: uuidv4(), accuracy: 0.801, precision: 0.798, recall: 0.804, f1_score: 0.801, token_count: 0, runtime: 22500, loss_curve: [], accuracy_curve: [] } },
  ];

  // NER 实验 (evaluation)
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

  // ======== 类别 4: Agent评测 (agent_evaluation) ========
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

  // Agent 测试用例
  agentExp.test_cases = [
    { id: uuidv4(), experiment_id: agentExp.id, question: '在百度搜索"人工智能最新进展"，并总结前三条结果的标题', expected_answer: '搜索成功并返回三条相关结果', category_tag: '搜索' },
    { id: uuidv4(), experiment_id: agentExp.id, question: '登录GitHub，找到trending页面中star最多的Python项目，告诉我项目名和star数', expected_answer: '成功导航并提取项目信息', category_tag: '导航+提取' },
    { id: uuidv4(), experiment_id: agentExp.id, question: '打开天气网站，查询北京今天的气温和湿度', expected_answer: '返回气温和湿度数据', category_tag: '信息检索' },
    { id: uuidv4(), experiment_id: agentExp.id, question: '在购物网站搜索"机械键盘"，按价格从低到高排序，告诉我最便宜的三款产品名称', expected_answer: '列出三款产品名称和价格', category_tag: '搜索+排序' },
    { id: uuidv4(), experiment_id: agentExp.id, question: '将一段中文字符串翻译成英文后，再用英文在Wikipedia上搜索相关条目', expected_answer: '翻译并完成搜索', category_tag: '多步操作' },
  ];

  // Agent 实验组: GPT-4o Agent
  const grpGpt4Agent = {
    id: uuidv4(), experiment_id: agentExp.id, name: 'GPT-4o Agent', model: 'gpt-4o + ReAct',
    parameters: { temperature: 0.5, max_steps: 10, tool_set: 'web_search, click, type, scroll' }, created_at: now(),
  };
  // Agent 实验组: Claude Agent
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
          { step: 5, thought: 'star数需要转换', action: 'parse_number("15.2k")', observation: '约15200 stars', error: false },
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
          { step: 4, thought: '提取前三个产品', action: 'extract(".product-item", 3)', observation: 'Error: 提取超时，页面结构异常', tool: 'extract' },
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

// ========== 初始化 ==========
function init() {
  if (!load()) {
    seed();
  }
}

init();

// ========== 查询辅助函数 ==========
function findCat(id) { return data.categories.find((c) => c.id === id); }
function findExp(id) { for (const c of data.categories) { const e = c.experiments.find((e) => e.id === id); if (e) return e; } return null; }
function findGroup(id) { for (const c of data.categories) for (const e of c.experiments) for (const g of (e.groups || [])) { if (g.id === id) return g; } return null; }
function findTC(id) { for (const c of data.categories) for (const e of c.experiments) for (const tc of (e.test_cases || [])) { if (tc.id === id) return tc; } return null; }

module.exports = { data, save, findCat, findExp, findGroup, findTC };
