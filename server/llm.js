// LLM 配置与调用模块
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'llm_config.json');

// 默认配置
let config = {
  apiUrl: 'http://localhost:8000/v1/chat/completions',
  modelName: 'gpt-4o',
  apiKey: '',
};

// 加载配置
if (fs.existsSync(CONFIG_PATH)) {
  try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }; } catch {}
}

function getConfig() { return { ...config }; }

function saveConfig(newConfig) {
  config = { ...config, ...newConfig };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

// 通用 LLM 调用
async function callLLM(messages, options = {}) {
  const { temperature = 0.3, max_tokens = 2000 } = options;
  const res = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      temperature,
      max_tokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// ====== 1. 错误诊断 ======
async function diagnoseError(question, expectedAnswer, modelResponse) {
  const prompt = `你是一个严谨的AI评测专家。请分析以下评测用例中模型回答错误的原因。

【题目】
${question}

【标准答案】
${expectedAnswer}

【模型回答】
${modelResponse}

请按以下格式回答（简洁，不超过200字）：
1. 错误类型：（如：事实错误 / 逻辑错误 / 格式不符 / 遗漏关键信息）
2. 具体问题：
3. 可能根因：`;

  return callLLM([{ role: 'user', content: prompt }], { temperature: 0.1, max_tokens: 500 });
}

// ====== 2. 批量自动标注（多维度评分） ======
async function autoAnnotate(question, expectedAnswer, modelResponse) {
  const prompt = `你是一个严格的AI评测专家。请仔细对比【标准答案】和【模型回答】，从以下四个维度评分。

【题目】
${question}

【标准答案】
${expectedAnswer}

【模型回答】
${modelResponse}

评分标准：
- 正确性（0~1）：事实是否与标准答案一致
  1.0=完全一致  0.7-0.9=基本正确有轻微偏差  0.4-0.6=部分正确  0-0.3=错误
- 完整性（0~1）：是否覆盖标准答案的关键信息点
  1.0=全部覆盖  0.5-0.9=覆盖主要信息  0-0.4=遗漏重要信息
- 简洁性（0~1）：是否简洁无冗余
  1.0=简洁精炼  0.5-0.9=稍有冗余  0-0.4=严重啰嗦或过度简略
- 规范性（0~1）：输出格式是否符合题目要求
  1.0=格式规范  0.5-0.9=基本规范  0-0.4=格式混乱

请先给出一句话评语，然后严格按JSON格式输出评分：
{"正确性":0.0,"完整性":0.0,"简洁性":0.0,"规范性":0.0}`;

  const text = await callLLM([{ role: 'user', content: prompt }], { temperature: 0.1, max_tokens: 400 });
  try {
    return extractJSON(text);
  } catch {
    return { error: 'parse_failed', raw: text.slice(0, 500) };
  }
}

// ====== 3. 错误聚类分析 ======
async function clusterErrors(errorCases) {
  const casesText = errorCases.map((c, i) =>
    `${i + 1}. 题目：${(c.question || '').slice(0, 80)}\n   回答：${(c.model_response || '').slice(0, 120)}`
  ).join('\n');

  const count = errorCases.length;
  const prompt = `你是一个AI评测分析专家。以下是一个模型在评测中的全部 ${count} 条错误用例。请仔细阅读每一条，根据错误的本质原因进行自然聚类（聚类数量不作限制，完全由数据决定）。

【错误用例】
${casesText}

请严格按JSON格式输出，归类每条错误（caseIndices为错误用例的序号）：
{
  "clusters": [
    { "name": "错误类型名称", "description": "详细说明", "count": 0, "caseIndices": [1, 3] }
  ],
  "summary": "整体评价和改进方向（100字以内）"
}`;

  const text = await callLLM([{ role: 'user', content: prompt }], { temperature: 0.3, max_tokens: 4000 });
  try {
    return extractJSON(text);
  } catch {
    return { error: 'parse_failed', raw: text.slice(0, 1000) };
  }
}

/** 从LLM返回文本中提取JSON对象 */
function extractJSON(text) {
  // 1. 尝试提取 ```json ... ``` 代码块
  let match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (match) return JSON.parse(match[1]);
  // 2. 尝试提取 ``` ... ``` 代码块
  match = text.match(/```\s*([\s\S]*?)\s*```/);
  if (match) return JSON.parse(match[1]);
  // 3. 找到第一个 { 和最后一个 }，尝试提取
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  // 4. 直接尝试解析整个文本
  return JSON.parse(text.trim());
}

// ====== 4. 对比评析 ======
async function compareAnalysis(question, expectedAnswer, responseA, correctA, responseB, correctB, nameA, nameB) {
  const prompt = `你是一个AI评测对比专家。请对比分析两个模型在同一题上的表现差异。

【题目】${question}
【标准答案】${expectedAnswer}

【${nameA}】(${correctA ? '正确' : '错误'})
${responseA}

【${nameB}】(${correctB ? '正确' : '错误'})
${responseB}

请分析（不超过200字）：
1. 两者回答的核心差异在哪里
2. 哪个更好，为什么
3. 如果有错误的，根因是什么`;

  return callLLM([{ role: 'user', content: prompt }], { temperature: 0.2, max_tokens: 600 });
}

// ====== 5. Agent 轨迹诊断 ======
async function diagnoseTrajectory(question, trajectory, isCorrect) {
  const trajText = JSON.stringify(trajectory, null, 2);

  const prompt = `你是一个Agent系统诊断专家。请仔细审查以下Agent执行任务的完整轨迹，重点分析每一步的合理性和工具执行情况。

【任务】${question}
【执行轨迹】
${trajText}

请按以下格式诊断（${isCorrect ? '任务成功，分析关键成功因素' : '任务失败，诊断具体问题'}，300字以内）：

1. 步数概览：共几步，每步分别做了什么
2. 不合理步骤：哪些步骤存在逻辑问题（如重复操作、不必要的调用、顺序错误）
3. 工具执行问题：哪些步骤的工具调用出错（如参数错误、返回异常、选择不当的工具）
4. ${isCorrect ? '成功关键' : '根因诊断'}：${isCorrect ? '哪些关键步骤保证了任务成功' : '失败的根本原因是什么'}
5. 优化建议：针对不合理步骤和工具问题给出具体改进方案`;

  return callLLM([{ role: 'user', content: prompt }], { temperature: 0.2, max_tokens: 1000 });
}

// ====== 7. 实验报告生成 ======
async function generateReport(experimentInfo) {
  const { name, type, groups } = experimentInfo;
  const groupSummaries = groups.map((g, i) =>
    `${i + 1}. ${g.name} — 准确率: ${((g.accuracy || 0) * 100).toFixed(1)}%, 总数: ${g.resultCount || g.results?.length || 0}`
  ).join('\n');

  const prompt = `你是一个AI实验分析专家。请为以下AI实验生成一份简洁的实验报告（Markdown格式）。

【实验名称】${name}
【实验类型】${type === 'evaluation' ? '评测实验' : type === 'agent_evaluation' ? 'Agent评测' : type}
【实验组】
${groupSummaries}

请生成Markdown报告，包含：
## 实验概览
## 各组表现对比
## 关键发现（2-3点）
## 改进建议（2-3点）

控制在500字以内，语言简洁专业。`;

  return callLLM([{ role: 'user', content: prompt }], { temperature: 0.3, max_tokens: 1500 });
}

module.exports = {
  getConfig, saveConfig,
  diagnoseError, autoAnnotate, clusterErrors, compareAnalysis, diagnoseTrajectory, generateReport,
};
