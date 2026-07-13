import React, { useMemo, useState } from 'react';
import {
  Card, Col, Row, Typography, Table, Statistic, Empty, Tag, Spin, Input, Button, Modal,
} from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined, SearchOutlined, RobotOutlined } from '@ant-design/icons';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { useData } from '../context/DataContext';
import { llmCompareAnalysis } from '../api/endpoints';
import type { ExperimentGroup } from '../types';

const { Title, Paragraph } = Typography;

const COLORS = ['#1677ff', '#ff4d4f', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

const ComparePage: React.FC = () => {
  const { experimentId } = useParams<{ experimentId: string }>();
  const [searchParams] = useSearchParams();
  const { experimentDetail, experimentLoading, setCompareGroups } = useData();

  const groupIds = (searchParams.get('groups') || '').split(',').filter(Boolean);

  // Context 同步
  React.useEffect(() => {
    if (groupIds.length >= 2) setCompareGroups(groupIds);
  }, [searchParams.get('groups'), setCompareGroups]);

  if (!experimentDetail) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;

  const experiment = experimentDetail;
  const groups = groupIds.map((id) => experiment?.groups?.find((g) => g.id === id)).filter(Boolean) as ExperimentGroup[];

  if (!experiment || groups.length < 2) {
    return <Empty description="请从仪表盘选择至少两个实验组" style={{ marginTop: 80 }} />;
  }

  const isTraining = experiment.type === 'training';
  const names = groups.map((g) => g.name);

  // ====== Training 对比 ======
  if (isTraining) {
    const metricsList = groups.map((g) => g.metrics).filter(Boolean);
    if (metricsList.length === 0) return <Empty description="所选实验组无训练指标" style={{ marginTop: 80 }} />;

    // 指标柱状图
    const metricsBarData = [
      { metric: '准确率', ...Object.fromEntries(groups.map((g, i) => [g.name, +((g.metrics?.accuracy ?? 0) * 100).toFixed(2)])) },
      { metric: 'F1 Score', ...Object.fromEntries(groups.map((g, i) => [g.name, +((g.metrics?.f1_score ?? 0) * 100).toFixed(2)])) },
      { metric: '精确率', ...Object.fromEntries(groups.map((g, i) => [g.name, +((g.metrics?.precision ?? 0) * 100).toFixed(2)])) },
      { metric: '召回率', ...Object.fromEntries(groups.map((g, i) => [g.name, +((g.metrics?.recall ?? 0) * 100).toFixed(2)])) },
    ];

    // 参数差异
    const allParamKeys = [...new Set(groups.flatMap((g) => Object.keys(g.parameters || {})))];
    const paramData = allParamKeys.map((k) => ({
      key: k, parameter: k,
      ...Object.fromEntries(groups.map((g) => [g.name, String(g.parameters?.[k] ?? '—')])),
    }));

    const paramColumns = [
      { title: '变量', dataIndex: 'parameter', width: 150 },
      ...groups.map((g, i) => ({
        title: <span style={{ color: COLORS[i % COLORS.length] }}>{g.name}</span>,
        dataIndex: g.name,
        key: g.name,
        render: (v: string) => v,
      })),
    ];

    // Loss 曲线对比
    const maxLen = Math.max(...groups.map((g) => (g.metrics?.loss_curve || []).length));
    const curveData = maxLen > 0 ? Array.from({ length: maxLen }, (_, i) => ({
      step: i + 1,
      ...Object.fromEntries(groups.flatMap((g) => [
        [`${g.name} Loss`, g.metrics?.loss_curve?.[i] ?? null],
        [`${g.name} Acc`, g.metrics?.accuracy_curve?.[i] ?? null],
      ])),
    })) : [];

    return (
      <div>
        <HeaderLine groups={groups} experimentName={experiment.name} />
        <Title level={5} style={{ marginBottom: 16 }}>📊 指标对比</Title>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={metricsBarData}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="metric" /><YAxis domain={[0, 100]} /><Tooltip /><Legend />
            {groups.map((g, i) => <Bar key={g.id} dataKey={g.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={60} />)}
          </BarChart>
        </ResponsiveContainer>

        <Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>🔧 变量差异</Title>
        <Table columns={paramColumns} dataSource={paramData} pagination={false} size="small" bordered scroll={{ x: 200 + groups.length * 150 }} />

        {curveData.length > 0 && (
          <>
            <Title level={5} style={{ marginTop: 24 }}>📈 Loss 轨迹</Title>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={curveData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="step" /><YAxis /><Tooltip /><Legend />
                {groups.map((g, i) => <Line key={g.id} type="monotone" dataKey={`${g.name} Loss`} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />)}
              </LineChart>
            </ResponsiveContainer>
            <Title level={5} style={{ marginTop: 16 }}>📈 Accuracy 轨迹</Title>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={curveData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="step" /><YAxis /><Tooltip /><Legend />
                {groups.map((g, i) => <Line key={g.id} type="monotone" dataKey={`${g.name} Acc`} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />)}
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    );
  }

  // ====== 评测 / Agent 对比 ======
  const [llmResult, setLlmResult] = useState('');
  const [llmOpen, setLlmOpen] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);

  const handleCompareAnalysis = async () => {
    setLlmOpen(true); setLlmLoading(true); setLlmResult('分析中...');
    const parts: string[] = [];
    const sample = commonData.filter((d) => {
      const results = groups.map((g) => d[`${g.name}_ok`] as string);
      return results.some((v) => v !== results[0]); // 找出有分歧的行
    }).slice(0, 5);
    for (const row of sample) {
      try {
        const res = await llmCompareAnalysis({
          question: row.question as string,
          expected_answer: row.expected_answer as string,
          responseA: row[`${groups[0].name}_resp`] as string,
          correctA: row[`${groups[0].name}_ok`] === 'correct',
          responseB: row[`${groups[1].name}_resp`] as string,
          correctB: row[`${groups[1].name}_ok`] === 'correct',
          nameA: groups[0].name,
          nameB: groups[1].name,
        });
        parts.push(`## ${row.question?.slice(0, 40)}...\n${res.result}\n`);
      } catch { parts.push('分析失败\n'); }
    }
    setLlmResult(parts.join('\n---\n'));
    setLlmLoading(false);
  };

  const isAgent = experiment.type === 'agent_evaluation';
  const [evalFilter, setEvalFilter] = useState('');
  const [resultFilter, setResultFilter] = useState<string | null>(null); // 'correct' | 'incorrect' | null

  const allResults = groups.map((g) => g.results || []);
  const allIds = [...new Set(allResults.flat().map((r) => r.test_case_id))];

  // 共同测试用例对比
  const commonData = allIds.map((tcId, idx) => {
    const row: Record<string, unknown> = { key: tcId, _idx: idx + 1 };
    groups.forEach((g) => {
      const r = (g.results || []).find((x) => x.test_case_id === tcId);
      row[`${g.name}_resp`] = r?.model_response || '';
      row[`${g.name}_ok`] = r ? (r.is_correct ? 'correct' : 'incorrect') : '';
    });
    const first = groups[0]?.results?.find((x) => x.test_case_id === tcId);
    row.question = first?.question || '';
    row.expected_answer = first?.expected_answer || '';
    // Store correctness as raw value for filtering
    row._anyCorrect = groups.some((g) => {
      const r = (g.results || []).find((x) => x.test_case_id === tcId);
      return r?.is_correct;
    });
    row._allCorrect = groups.every((g) => {
      const r = (g.results || []).find((x) => x.test_case_id === tcId);
      return r?.is_correct;
    });
    return row;
  });

  // 过滤
  const filteredCommon = commonData.filter((row) => {
    if (evalFilter && !(row.question as string || '').toLowerCase().includes(evalFilter.toLowerCase())) return false;
    if (resultFilter === 'correct' && !row._allCorrect) return false;
    if (resultFilter === 'incorrect' && row._anyCorrect) return false;
    if (resultFilter === 'partial' && (row._allCorrect || !row._anyCorrect)) return false;
    return true;
  });

  const resultFilters = [
    { text: '全部正确', value: 'correct' },
    { text: '部分正确', value: 'partial' },
    { text: '全部错误', value: 'incorrect' },
  ];

  const commonColumns = [
    { title: '#', dataIndex: '_idx', width: 40, align: 'center' as const },
    { title: '题目', dataIndex: 'question', width: 220, ellipsis: true,
      sorter: (a: any, b: any) => (a.question || '').localeCompare(b.question || ''),
      render: (t: string) => <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{t}</span> },
    { title: '标准答案', dataIndex: 'expected_answer', width: 160, ellipsis: true, render: (t: string) => <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{t}</span> },
    ...groups.flatMap((g, i) => [
      { title: g.name, dataIndex: `${g.name}_resp`, width: 200, render: (t: string) => <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 100, overflow: 'auto' }}>{t || '-'}</div> },
      { title: '✓', dataIndex: `${g.name}_ok`, width: 40, align: 'center' as const, render: (v: string) => v === 'correct' ? '✅' : v === 'incorrect' ? '❌' : '-', filters: [{ text: '✅', value: 'correct' }, { text: '❌', value: 'incorrect' }], onFilter: (val: any, record: any) => record[`${g.name}_ok`] === val },
    ]),
  ];

  // 准确率对比
  const accData = [
    { metric: '准确率', ...Object.fromEntries(groups.map((g) => [g.name, +((g.accuracy ?? 0) * 100).toFixed(1)])) },
  ];

  // 工具调用对比 (Agent only)
  const toolData = isAgent ? groups.map((g) => {
    const results = g.results || [];
    const totalTools = results.reduce((s, r) => {
      if (!r.trajectory) return s;
      return s + r.trajectory.filter((step: any) => step.tool || step.action).length;
    }, 0);
    const totalErrors = results.reduce((s, r) => {
      if (!r.trajectory) return s;
      return s + r.trajectory.filter((step: any) => (step.observation || '').toLowerCase().includes('error')).length;
    }, 0);
    return { name: g.name, avgTools: results.length ? (totalTools / results.length).toFixed(1) : '0', totalErrors };
  }) : [];

  // 变量差异
  const allParamKeys2 = [...new Set(groups.flatMap((g) => Object.keys(g.parameters || {})))];
  const paramData2 = allParamKeys2.map((k) => ({
    key: k, parameter: k,
    ...Object.fromEntries(groups.map((g) => [g.name, String(g.parameters?.[k] ?? '—')])),
  }));
  const paramColumns2 = [
    { title: '变量', dataIndex: 'parameter', width: 150 },
    ...groups.map((g, i) => ({ title: <span style={{ color: COLORS[i % COLORS.length] }}>{g.name}</span>, dataIndex: g.name, key: g.name })),
  ];

  return (
    <div>
      <HeaderLine groups={groups} experimentName={experiment.name} />

      <Button icon={<RobotOutlined />} onClick={handleCompareAnalysis} loading={llmLoading} style={{ marginBottom: 16 }}>
        AI 对比评析
      </Button>

      <Title level={5} style={{ marginBottom: 16 }}>📊 准确率对比</Title>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={accData}>
          <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="metric" /><YAxis domain={[0, 100]} /><Tooltip /><Legend />
          {groups.map((g, i) => <Bar key={g.id} dataKey={g.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={60} />)}
        </BarChart>
      </ResponsiveContainer>

      {isAgent && toolData.length > 0 && (
        <>
          <Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>🔧 工具调用对比</Title>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[{ metric: '平均工具调用', ...Object.fromEntries(toolData.map((t: any) => [t.name, +t.avgTools])) }]}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="metric" /><YAxis /><Tooltip /><Legend />
              {groups.map((g, i) => <Bar key={g.id} dataKey={g.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={60} />)}
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      <Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>🔧 变量差异</Title>
      <Table columns={paramColumns2} dataSource={paramData2} pagination={false} size="small" bordered scroll={{ x: 200 + groups.length * 150 }} />

      {commonData.length > 0 && (
        <>
          <Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>
            📋 共同用例回答对比
            <span style={{ fontWeight: 400, fontSize: 13, color: '#888', marginLeft: 12 }}>
              共 {filteredCommon.length}/{commonData.length} 条
            </span>
          </Title>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Input size="small" placeholder="搜索题目..." prefix={<SearchOutlined />} value={evalFilter} onChange={(e) => setEvalFilter(e.target.value)} allowClear style={{ width: 220 }} />
            <Tag.CheckableTag checked={resultFilter === null} onChange={() => setResultFilter(null)}>全部</Tag.CheckableTag>
            <Tag.CheckableTag checked={resultFilter === 'correct'} onChange={() => setResultFilter(resultFilter === 'correct' ? null : 'correct')}>全部正确</Tag.CheckableTag>
            <Tag.CheckableTag checked={resultFilter === 'partial'} onChange={() => setResultFilter(resultFilter === 'partial' ? null : 'partial')}>部分正确</Tag.CheckableTag>
            <Tag.CheckableTag checked={resultFilter === 'incorrect'} onChange={() => setResultFilter(resultFilter === 'incorrect' ? null : 'incorrect')}>全部错误</Tag.CheckableTag>
          </div>
          <Table columns={commonColumns} dataSource={filteredCommon} pagination={{ pageSize: 15 }} size="small" bordered scroll={{ x: 600 + groups.length * 220 }} />
        </>
      )}

      <Modal title="AI 对比评析" open={llmOpen} onCancel={() => setLlmOpen(false)} footer={null} width={700}>
        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto', background: '#fafafa', padding: 12, borderRadius: 4, fontSize: 13 }}>
          {llmResult || '分析中...'}
        </div>
      </Modal>
    </div>
  );
};

function HeaderLine({ groups, experimentName }: { groups: ExperimentGroup[]; experimentName: string }) {
  const COLORS = ['#1677ff', '#ff4d4f', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {groups.map((g, i) => (
          <Tag key={g.id} color={COLORS[i % COLORS.length]} style={{ fontSize: 14, padding: '2px 10px' }}>{g.name}</Tag>
        ))}
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>实验: {experimentName}（{groups.length} 组对比）</Paragraph>
    </>
  );
}

export default ComparePage;
