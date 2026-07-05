import React, { useMemo } from 'react';
import {
  Card, Col, Row, Typography, Table, Statistic, Empty, Tag, Divider, Spin,
} from 'antd';
import { SwapOutlined, CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { useData } from '../context/DataContext';
import type { ExperimentGroup } from '../types';

const { Title, Paragraph } = Typography;

const ComparePage: React.FC = () => {
  const { experimentId } = useParams<{ experimentId: string }>();
  const [searchParams] = useSearchParams();
  const { experimentDetail, experimentLoading, setCompareGroups } = useData();

  const leftId = searchParams.get('left');
  const rightId = searchParams.get('right');

  // Context 同步
  React.useEffect(() => {
    if (leftId && rightId) setCompareGroups(leftId, rightId);
  }, [leftId, rightId, setCompareGroups]);

  // 只在首次加载时显示 spinner，刷新时保持已有内容
  if (!experimentDetail && experimentLoading) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;

  const experiment = experimentDetail;
  const leftGroup = experiment?.groups?.find((g) => g.id === leftId) ?? null;
  const rightGroup = experiment?.groups?.find((g) => g.id === rightId) ?? null;

  if (!experiment || !leftGroup || !rightGroup) {
    return <Empty description="请从仪表盘选择两个实验组" style={{ marginTop: 80 }} />;
  }

  const L = leftGroup;
  const R = rightGroup;
  const isTraining = experiment.type === 'training';

  // ====== Training 对比 ======
  if (isTraining && L.metrics && R.metrics) {
    const lm = L.metrics, rm = R.metrics;

    const metricsBarData = [
      { metric: '准确率', [L.name]: +(lm.accuracy * 100).toFixed(2), [R.name]: +(rm.accuracy * 100).toFixed(2) },
      { metric: 'F1 Score', [L.name]: +(lm.f1_score * 100).toFixed(2), [R.name]: +(rm.f1_score * 100).toFixed(2) },
      { metric: '精确率', [L.name]: +(lm.precision * 100).toFixed(2), [R.name]: +(rm.precision * 100).toFixed(2) },
      { metric: '召回率', [L.name]: +(lm.recall * 100).toFixed(2), [R.name]: +(rm.recall * 100).toFixed(2) },
    ];

    // 参数差异
    const allKeys = [...new Set([...Object.keys(L.parameters || {}), ...Object.keys(R.parameters || {})])];
    const paramDiffData = allKeys.map((k) => ({
      key: k, parameter: k,
      [L.name]: String(L.parameters?.[k] ?? '—'),
      [R.name]: String(R.parameters?.[k] ?? '—'),
      same: String(L.parameters?.[k] ?? '') === String(R.parameters?.[k] ?? ''),
    }));

    // 曲线对比
    const maxLen = Math.max((lm.loss_curve || []).length, (rm.loss_curve || []).length);
    const curveData = Array.from({ length: maxLen }, (_, i) => ({
      step: i + 1,
      [`${L.name} Loss`]: lm.loss_curve?.[i] ?? null,
      [`${R.name} Loss`]: rm.loss_curve?.[i] ?? null,
      [`${L.name} Acc`]: lm.accuracy_curve?.[i] ?? null,
      [`${R.name} Acc`]: rm.accuracy_curve?.[i] ?? null,
    }));

    return (
      <div>
        <HeaderTags L={L} R={R} experimentName={experiment.name} />

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <StatCard title="准确率" value={lm.accuracy} suffix="%" diff={lm.accuracy - rm.accuracy} />
          <StatCard title="F1" value={lm.f1_score} suffix="%" diff={lm.f1_score - rm.f1_score} />
          <StatCard title="Token" value={lm.token_count} raw />
          <StatCard title="运行时间" value={lm.runtime} raw isTime />
        </Row>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={12}><Card><Statistic title={`${R.name} 准确率`} value={(rm.accuracy * 100).toFixed(2)} suffix="%" /></Card></Col>
          <Col span={12}><Card><Statistic title={`${R.name} F1`} value={(rm.f1_score * 100).toFixed(2)} suffix="%" /></Card></Col>
        </Row>

        <Card title="📊 关键指标对比" style={{ borderRadius: 8, marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={metricsBarData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey={L.name} fill="#1677ff" radius={[4, 4, 0, 0]} />
              <Bar dataKey={R.name} fill="#ff4d4f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="🔧 参数差异" style={{ borderRadius: 8, marginBottom: 24 }}>
          <Table columns={[
            { title: '参数', dataIndex: 'parameter', width: 180 },
            { title: L.name, dataIndex: L.name, render: (v: string, r: { same: boolean }) => <span style={{ color: r.same ? undefined : '#1677ff', fontWeight: r.same ? undefined : 600 }}>{v}</span> },
            { title: R.name, dataIndex: R.name, render: (v: string, r: { same: boolean }) => <span style={{ color: r.same ? undefined : '#ff4d4f', fontWeight: r.same ? undefined : 600 }}>{v}</span> },
          ]} dataSource={paramDiffData} pagination={false} size="middle" bordered
            rowClassName={(r: { same: boolean }) => r.same ? '' : 'param-diff-row'} />
        </Card>

        {curveData.length > 0 && (
          <Card title="📈 训练曲线对比" style={{ borderRadius: 8 }}>
            <Title level={5}>Loss 轨迹</Title>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={curveData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="step" /><YAxis /><Tooltip /><Legend />
                <Line type="monotone" dataKey={`${L.name} Loss`} stroke="#1677ff" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey={`${R.name} Loss`} stroke="#ff4d4f" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            <Divider />
            <Title level={5}>Accuracy 轨迹</Title>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={curveData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="step" /><YAxis /><Tooltip /><Legend />
                <Line type="monotone" dataKey={`${L.name} Acc`} stroke="#1677ff" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey={`${R.name} Acc`} stroke="#ff4d4f" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    );
  }

  // ====== Evaluation 对比 ======
  const Lacc = L.accuracy ?? 0;
  const Racc = R.accuracy ?? 0;
  const Lcorrect = L.correctCount ?? 0;
  const Rcorrect = R.correctCount ?? 0;
  const Ltotal = L.resultCount ?? 0;
  const Rtotal = R.resultCount ?? 0;

  // 共同测试用例对比
  const Lresults = L.results || [];
  const Rresults = R.results || [];
  const Lmap = new Map(Lresults.map((r) => [r.test_case_id, r]));
  const Rmap = new Map(Rresults.map((r) => [r.test_case_id, r]));
  const commonIds = [...new Set([...Lmap.keys()].filter((id) => Rmap.has(id)))];
  const commonCompareData = commonIds.map((tcId) => {
    const lr = Lmap.get(tcId)!;
    const rr = Rmap.get(tcId)!;
    return {
      key: tcId,
      question: lr.question || '',
      expected_answer: lr.expected_answer || '',
      [L.name + ' 回答']: lr.model_response || '',
      [R.name + ' 回答']: rr.model_response || '',
      [L.name + ' ✓']: lr.is_correct ? '✅' : '❌',
      [R.name + ' ✓']: rr.is_correct ? '✅' : '❌',
    };
  });

  return (
    <div>
      <HeaderTags L={L} R={R} experimentName={experiment.name} />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title={`${L.name} 准确率`} value={(Lacc * 100).toFixed(1)} suffix="%" valueStyle={{ color: Lacc >= Racc ? '#52c41a' : '#1677ff' }} />
            <div style={{ fontSize: 12, color: '#999' }}>{Lcorrect}/{Ltotal} 正确</div></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title={`${R.name} 准确率`} value={(Racc * 100).toFixed(1)} suffix="%" valueStyle={{ color: Racc >= Lacc ? '#52c41a' : '#ff4d4f' }} />
            <div style={{ fontSize: 12, color: '#999' }}>{Rcorrect}/{Rtotal} 正确</div></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="正确率差值" value={((Lacc - Racc) * 100).toFixed(1)} suffix="个百分点" /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="共同不一致" value={commonIds.filter((id) => { const l = Lmap.get(id)!, r = Rmap.get(id)!; return l.is_correct !== r.is_correct; }).length} suffix="题" /></Card>
        </Col>
      </Row>

      <Card title="📊 准确率对比" style={{ borderRadius: 8, marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={[
            { metric: '准确率', [L.name]: +(Lacc * 100).toFixed(1), [R.name]: +(Racc * 100).toFixed(1) },
          ]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="metric" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Bar dataKey={L.name} fill="#1677ff" radius={[4, 4, 0, 0]} />
            <Bar dataKey={R.name} fill="#ff4d4f" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 多维评分对比 */}
      {(() => {
        const Lscores: Record<string, number[]> = {};
        Lresults.forEach((r) => { if (r.custom_scores) Object.entries(r.custom_scores).forEach(([k, v]) => { if (!Lscores[k]) Lscores[k] = []; Lscores[k].push(v); }); });
        const Rscores: Record<string, number[]> = {};
        Rresults.forEach((r) => { if (r.custom_scores) Object.entries(r.custom_scores).forEach(([k, v]) => { if (!Rscores[k]) Rscores[k] = []; Rscores[k].push(v); }); });
        const allDims = [...new Set([...Object.keys(Lscores), ...Object.keys(Rscores)])];
        if (allDims.length > 0) {
          const barData = allDims.map((dim) => ({
            dimension: dim,
            [L.name]: Lscores[dim] ? +(Lscores[dim].reduce((s, v) => s + v, 0) / Lscores[dim].length * 100).toFixed(1) : 0,
            [R.name]: Rscores[dim] ? +(Rscores[dim].reduce((s, v) => s + v, 0) / Rscores[dim].length * 100).toFixed(1) : 0,
          }));
          return (
            <Card title="📐 多维评分对比" style={{ borderRadius: 8, marginBottom: 24 }}>
              <ResponsiveContainer width="100%" height={Math.max(200, allDims.length * 50)}>
                <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="dimension" width={80} /><Tooltip /><Legend />
                  <Bar dataKey={L.name} fill="#1677ff" radius={[0, 4, 4, 0]} /><Bar dataKey={R.name} fill="#ff4d4f" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          );
        }
        return null;
      })()}

      <Card title="🔧 参数差异" style={{ borderRadius: 8, marginBottom: 24 }}>
        <Table columns={[
          { title: '参数', dataIndex: 'parameter', width: 180 },
          { title: L.name, dataIndex: L.name, render: (v: string, r: { same: boolean }) => <span style={{ color: r.same ? undefined : '#1677ff', fontWeight: r.same ? undefined : 600 }}>{v}</span> },
          { title: R.name, dataIndex: R.name, render: (v: string, r: { same: boolean }) => <span style={{ color: r.same ? undefined : '#ff4d4f', fontWeight: r.same ? undefined : 600 }}>{v}</span> },
        ]} dataSource={(() => {
          const allKeys = [...new Set([...Object.keys(L.parameters || {}), ...Object.keys(R.parameters || {})])];
          return allKeys.map((k) => ({ key: k, parameter: k, [L.name]: String(L.parameters?.[k] ?? '—'), [R.name]: String(R.parameters?.[k] ?? '—'), same: String(L.parameters?.[k] ?? '') === String(R.parameters?.[k] ?? '') }));
        })()} pagination={false} size="middle" bordered rowClassName={(r: { same: boolean }) => r.same ? '' : 'param-diff-row'} />
      </Card>

      {commonCompareData.length > 0 && (
        <Card title="📋 共同测试用例回答对比" style={{ borderRadius: 8 }}>
          <Table
            dataSource={commonCompareData}
            columns={[
              { title: '题目', dataIndex: 'question', width: 200, ellipsis: true },
              { title: '标准答案', dataIndex: 'expected_answer', width: 150, ellipsis: true },
              { title: L.name + ' 回答', dataIndex: L.name + ' 回答', width: 250, render: (t: string) => <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 120, overflow: 'auto' }}>{t}</div> },
              { title: R.name + ' 回答', dataIndex: R.name + ' 回答', width: 250, render: (t: string) => <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 120, overflow: 'auto' }}>{t}</div> },
              { title: L.name, dataIndex: L.name + ' ✓', width: 50, align: 'center' as const },
              { title: R.name, dataIndex: R.name + ' ✓', width: 50, align: 'center' as const },
            ]}
            pagination={{ pageSize: 10 }}
            size="small"
            bordered
            scroll={{ x: 1000 }}
          />
        </Card>
      )}
    </div>
  );
};

// ====== 子组件 ======
function HeaderTags({ L, R, experimentName }: { L: ExperimentGroup; R: ExperimentGroup; experimentName: string }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <Tag color="blue" style={{ fontSize: 16, padding: '4px 12px' }}>{L.name}</Tag>
        <SwapOutlined style={{ fontSize: 20, color: '#999' }} />
        <Tag color="red" style={{ fontSize: 16, padding: '4px 12px' }}>{R.name}</Tag>
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>实验: {experimentName}</Paragraph>
    </>
  );
}

function StatCard({ title, value, suffix, diff, raw, isTime }: {
  title: string; value: number; suffix?: string; diff?: number; raw?: boolean; isTime?: boolean;
}) {
  const display = raw
    ? (isTime ? (() => { const h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; })() : value > 0 ? value.toLocaleString() : 'N/A')
    : (value * 100).toFixed(2);
  return (
    <Col xs={12} sm={6}>
      <Card>
        <Statistic title={title} value={display} suffix={!raw ? suffix : undefined} valueStyle={{ color: diff !== undefined ? (diff >= 0 ? '#52c41a' : '#ff4d4f') : undefined }} />
        {diff !== undefined && <div style={{ fontSize: 12, color: diff >= 0 ? '#52c41a' : '#ff4d4f' }}>vs {' '}{(diff * 100).toFixed(2)} 百分点</div>}
      </Card>
    </Col>
  );
}

export default ComparePage;
