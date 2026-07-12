const fs = require('fs');

const subCats = {
  '地理': [
    ['法国首都是哪里？', '巴黎', '巴黎是法国的首都。', true, '基础地理知识题，法国首都是巴黎。'],
    ['太阳系中最大的行星是什么？', '木星', '木星是太阳系中最大的行星。', true, '木星体积是地球的1300倍，质量是其他行星总和的2.5倍。'],
    ['地球上最干燥的大洲是什么？', '南极洲', '南极洲是地球上最干燥的大洲。', true, '南极洲年降水量不足50mm，是地球上最干燥的大洲。'],
  ],
  '数学': [
    ['计算 123 * 456', '56088', '123 * 456 = 56088', true, '竖式计算：123*400=49200, 123*56=6888, 合计56088。'],
    ['勾股定理公式是什么？', 'a^2+b^2=c^2', 'a^2+b^2=c^2。', true, '直角三角形两直角边平方和等于斜边平方。'],
    ['光速是多少m/s？', '约3e8 m/s', '光速约为3e8 m/s。', true, '真空中光速精确值为299792458 m/s。'],
  ],
  '翻译': [
    ['将Hello翻译成中文', '你好', '你好。', true, 'Hello对应的中文是你好，这是基本翻译题。'],
    ['将Good morning翻译成法语', 'Bonjour', 'Bonjour。', true, '法语中Bonjour表示你好/早上好，是最基本的问候语。'],
  ],
  '科学': [
    ['水的沸点是多少？', '100C', '100摄氏度。', true, '在标准大气压下水沸点为100摄氏度。'],
    ['解释光合作用', '光能转化为化学能的过程', '植物利用光能将CO2和H2O转化为有机物和O2的过程。', true, '6CO2+6H2O光能> C6H12O6+6O2。'],
    ['一杯水在太空中会怎样？', '水会沸腾然后冻结', '水在真空中会同时沸腾和冻结。', true, '真空沸点降低，水迅速沸腾气化带走热量导致剩余水结冰。'],
  ],
  '编程': [
    ['写Python函数计算斐波那契第n项', 'def fib(n):...', 'def fib(n):return n if n<=1 else fib(n-1)+fib(n-2)', true, '使用递归或迭代计算，时间复杂度O(2^n)，可优化为O(n)。'],
    ['什么是机器学习的过拟合？', '模型在训练集表现好但测试集表现差', '过拟合指模型过度学习训练数据中的噪声，导致泛化能力下降。', true, '原因：模型复杂度过高、训练数据不足。解决：正则化、Dropout、数据增强、早停。'],
  ],
  '文学': [
    ['鲁迅的原名是什么？', '周树人', '鲁迅原名周树人，字豫才。', true, '鲁迅(1881-1936)，原名周樟寿，后改名周树人，\"鲁迅\"是其笔名。'],
    ['第二次世界大战在哪一年结束？', '1945', '二战于1945年结束。', true, '1945年5月德国投降，8月日本投降。'],
  ],
};

const groups = [
  { name: 'GPT-4o', model: 'gpt-4o', noise: 0.05 },
  { name: 'GPT-4-Turbo', model: 'gpt-4-turbo', noise: 0.12 },
  { name: 'Claude-Sonnet', model: 'claude-sonnet-5', noise: 0.08 },
  { name: 'Gemini-2.5', model: 'gemini-2.5-pro', noise: 0.15 },
  { name: 'DeepSeek-Chat', model: 'deepseek-chat', noise: 0.2 },
];

const data = groups.map((g) => ({
  group_name: g.name,
  model: g.model,
  eval_dataset: 'GeneralQA',
  variables: { temperature: 0.7 },
  results: Object.fromEntries(
    Object.entries(subCats).map(([cat, qs]) => [
      cat,
      qs.map(([q, a, r, c, think]) => {
        const isCorrect = Math.random() > g.noise ? c : !c;
        return {
          question: q,
          expected_answer: a,
          model_response: r,
          is_correct: isCorrect,
          score: isCorrect ? 0.8 + Math.random() * 0.2 : Math.random() * 0.3,
          runtime_ms: 80 + Math.floor(Math.random() * 300),
          token_count: 10 + Math.floor(Math.random() * 50),
          reason: isCorrect ? '' : '回答有误',
          think,
        };
      }),
    ]),
  ),
}));

const out = __dirname + '/../sample_eval_subcat.json';
fs.writeFileSync(out, JSON.stringify(data, null, 2));
const total = data.reduce((s, g) => s + Object.values(g.results).flat().length, 0);
console.log('Created sample_eval_subcat.json: ' + data.length + ' groups, ' + Object.keys(subCats).length + ' sub-cats, ' + total + ' results');
