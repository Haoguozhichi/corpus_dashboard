const fs = require('fs');

const taskTypes = {
  '网页搜索': [
    ['搜索北京今日天气和空气质量','返回气温、湿度、AQI指数','搜索完成: 22°C, 湿度45%, AQI 85',true],
    ['搜索2024年AI领域十大突破','返回10条相关新闻标题','找到8条相关新闻并总结',false],
    ['搜索Python 3.13版本发布说明','返回发布说明链接和摘要','Python 3.13已发布,主要更新:GIL优化、JIT编译器',true],
    ['在百度搜索机械键盘推荐','返回前10条搜索结果标题','搜索完成,返回10条结果',true],
    ['搜索附近评分最高的咖啡店','返回3家咖啡店信息','找到3家:星巴克4.3,瑞幸4.1,Tim Hortons 4.5',true],
    ['搜索如何部署Docker容器','返回教程链接和步骤','找到5篇教程,已提取关键步骤',true],
    ['搜索今天美股行情','返回道指、纳指、标普500','搜索超时,只获取到道指数据',false],
    ['搜索最受欢迎的JavaScript框架','返回排名和简介','React排名第一,其次是Vue和Angular',true],
  ],
  '网页导航': [
    ['打开GitHub并找到trending页面','成功导航到trending','导航成功,trending页面显示25个项目',true],
    ['登录公司邮箱查看未读邮件','显示3封未读邮件','登录成功,3封未读邮件来自PM',true],
    ['导航到天气网站查询未来7天天气','返回7天天气预报','加载成功,已提取7天数据',true],
    ['打开购物网站并将商品加入购物车','商品成功加入购物车','点击购买按钮超时,商品已加入购物车但未购买',false],
    ['导航到公司Wiki搜索部署文档','返回2篇相关文档','找到2篇文档并打开',true],
    ['打开腾讯文档并创建新表格','创建成功','表格已创建,名称为月度报告',true],
    ['导航到AWS控制台查看EC2实例状态','返回实例列表','3个实例正在运行,1个已停止',true],
    ['打开Notion页面并添加今日待办','添加成功','已添加3条待办事项',true],
  ],
  '多步任务': [
    ['查询航班并预订机票','返回航班信息和预订确认号','找到3个航班,预订MU5101成功',true],
    ['对比3个电商平台的商品价格后发送邮件报告','邮件已发送','完成价格对比并发送报告给manager@test.com',true],
    ['翻译中文文档到英文后上传到Google Drive','上传成功','翻译完成,文件已上传,链接已保存',true],
    ['抓取网页表格数据并生成CSV文件','CSV文件已生成','表格有12行5列,CSV已保存',true],
    ['预订会议室并发送日历邀请','邀请已发送','预订了3号会议室,邀请已发送给5人',false],
    ['计算上月销售额并生成图表','图表已生成','销售额为12.5万,环比增长8%',true],
    ['从PDF中提取表格数据并导入数据库','导入成功','提取了3个表格共45行数据,已导入MySQL',true],
    ['监控服务器状态发现异常并发送告警','告警已发送','检测到CPU使用率90%,已发送钉钉告警',true],
  ],
};

const models = [
  ['GPT-4o Agent','gpt-4o',0.05],
  ['Claude-Sonnet Agent','claude-sonnet-5',0.08],
  ['Gemini Agent','gemini-2.5-pro',0.15],
  ['LLaMA-3 Agent','llama-3-70b',0.22],
  ['DeepSeek Agent','deepseek-chat',0.28],
  ['Qwen Agent','qwen2.5-72b',0.18],
];

function mkTrajectory(isCorrect) {
  const traj = [
    { step: 1, thought: '分析用户请求,确定任务目标和所需工具', action: 'parse_task', observation: '任务目标已明确' },
    { step: 2, thought: '打开相关网页或应用', action: 'navigate', observation: '页面加载成功' },
    { step: 3, thought: '执行核心操作', action: isCorrect ? 'execute' : 'retry_search', observation: isCorrect ? '操作完成' : 'Error: 操作超时,返回码500', tool: isCorrect ? 'api' : 'http' },
    { step: 4, thought: '验证结果并格式化输出', action: 'format', observation: isCorrect ? '结果已格式化' : '无法获取有效结果' },
  ];
  if (isCorrect) {
    traj.push({ step: 5, thought: '任务完成', action: 'done', observation: '成功完成' });
  }
  return traj;
}

function mkResults(arr, noise) {
  return arr.map(([q,a,r,c]) => {
    const isCorrect = noise ? (Math.random() > noise ? c : !c) : c;
    return {
      question: q, expected_answer: a, model_response: r,
      is_correct: isCorrect,
      score: isCorrect ? 0.8 + Math.random() * 0.2 : Math.random() * 0.3,
      runtime_ms: 1200 + Math.floor(Math.random() * 5000),
      token_count: 180 + Math.floor(Math.random() * 600),
      reason: isCorrect ? '' : '工具调用失败或返回不完整',
      difficulty: Math.random() > 0.5 ? 'hard' : Math.random() > 0.3 ? 'medium' : 'easy',
      tool_count: isCorrect ? 4 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3),
      trajectory: mkTrajectory(isCorrect),
    };
  });
}

const groups = models.map(([name, model, noise]) => ({
  group_name: name, model: model, eval_dataset: 'AgentBench-v3',
  variables: { temperature: 0.5, max_steps: 10, tools: 'web_search,navigate,api_call' },
  results: {
    '网页搜索': mkResults(taskTypes['网页搜索'], noise),
    '网页导航': mkResults(taskTypes['网页导航'], noise),
    '多步任务': mkResults(taskTypes['多步任务'], noise),
  },
}));

const out = __dirname + '/../sample_agent_v3.json';
fs.writeFileSync(out, JSON.stringify(groups, null, 2));
const total = groups.reduce((s,g) => s + Object.values(g.results).flat().length, 0);
console.log('Created sample_agent_v3.json: ' + groups.length + ' groups, ' + total + ' results');
