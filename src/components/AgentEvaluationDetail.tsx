import React, { useState, useEffect, useMemo } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Button, Modal, Input, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  ThunderboltOutlined, ToolOutlined, WarningOutlined, UploadOutlined, SearchOutlined, EditOutlined,
  BulbOutlined, EyeOutlined,
} from '@ant-design/icons';
import type { ExperimentGroup, TestCase, EvaluationResult, TrajectoryStep } from '../types';
import { fetchResults, updateResult } from '../api/endpoints';
import ResultsUploader from './ResultsUploader';
import TrajectoryViewer from './TrajectoryViewer';
import CustomScoresChart from './CustomScoresChart';

const { Title } = Typography;

interface Props {
  group: ExperimentGroup;
  experimentName: string;
  experimentId: string;
  testCases: TestCase[];
  onRefresh: () => void;
}

function computeTrajectoryStats(trajectory?: TrajectoryStep[]) {
  if (!trajectory || trajectory.length === 0) return { toolCalls: 0, errorTools: 0, totalSteps: 0 };
  const toolCalls = trajectory.filter((s) => s.tool || s.action).length;
  const errorTools = trajectory.filter((s) =>
    (s.observation || '').toLowerCase().includes('error') ||
    (s.tool_output || '').toLowerCase().includes('error'),
  ).length;
  return { toolCalls, errorTools, totalSteps: trajectory.length };
}

const AgentEvaluationDetail: React.FC<Props> = ({ group, experimentName, experimentId, testCases, onRefresh }) => {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [allResults, setAllResults] = useState<EvaluationResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [trajModal, setTrajModal] = useState<EvaluationResult | null>(null);
  const [showThink, setShowThink] = useState(false);
  const [editingAnno, setEditingAnno] = useState<string | null>(null);
  const [annoText, setAnnoText] = useState('');
  const [savingAnno, setSavingAnno] = useState(false);

  const loadResults = async () => {
    setResultsLoading(true);
    try { const data = await fetchResults(group.id); setAllResults(data.results || []); }
    catch { setAllResults(group.results || []); }
    finally { setResultsLoading(false); }
  };
  useEffect(() => { loadResults(); }, [group.id]);

  const results = allResults.length > 0 ? allResults : (group.results || []);
  const filtered = filterText.trim()
    ? results.filter((r) => (r.question || '').includes(filterText) || (r.model_response || '').includes(filterText))
    : results;
  const correctCount = group.correctCount || results.filter((r) => r.is_correct).length;
  const totalCount = group.resultCount || results.length;
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

  const summary = useMemo(() => {
    let totalTokens = 0, totalRuntime = 0, totalTools = 0, totalErrors = 0;
    results.forEach((r) => {
      totalTokens += r.token_count || 0;
      totalRuntime += r.runtime_ms || 0;
      const stats = computeTrajectoryStats(r.trajectory);
      totalTools += stats.toolCalls;
      totalErrors += stats.errorTools;
    });
    return { totalTokens, avgRuntime: totalCount > 0 ? totalRuntime / totalCount : 0, avgTools: totalCount > 0 ? totalTools / totalCount : 0, totalErrors };
  }, [results, totalCount]);

  const hasTrajectory = results.some((r) => r.trajectory && r.trajectory.length > 0);
  const hasCustomScores = results.some((r) => r.custom_scores && Object.keys(r.custom_scores).length > 0);

  const handleSaveAnnotation = async (id: string) => {
    setSavingAnno(true);
    try {
      await updateResult(id, { annotation: annoText });
      setAllResults((prev) => prev.map((r) => (r.id === id ? { ...r, annotation: annoText } : r)));
      setEditingAnno(null);
    } catch { /* */ }
    finally { setSavingAnno(false); }
  };
  const startEditAnno = (record: EvaluationResult) => { setEditingAnno(record.id); setAnnoText(record.annotation || ''); };

  const questionFilters = [...new Set(results.map((r) => r.question || '').filter(Boolean))].slice(0, 200).map((q) => ({ text: q.length > 40 ? q.slice(0, 40) + '...' : q, value: q }));
  const resultFilters = [{ text: '✅ 正确', value: 'correct' }, { text: '❌ 错误', value: 'incorrect' }];

  const openTrajModal = (record: EvaluationResult) => { setTrajModal(record); setShowThink(false); };

  const columns: ColumnsType<EvaluationResult> = [
    {
      title: '题目', dataIndex: 'question', key: 'question', width: 200, ellipsis: true,
      sorter: (a, b) => (a.question || '').localeCompare(b.question || ''),
      filters: questionFilters, onFilter: (v, r) => r.question === v, filterSearch: true,
      render: (t: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{t}</span>,
    },
    {
      title: '正确答案', dataIndex: 'expected_answer', key: 'expected_answer', width: 160, ellipsis: true,
      sorter: (a, b) => (a.expected_answer || '').localeCompare(b.expected_answer || ''),
      render: (t: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{t || '-'}</span>,
    },
    {
      title: 'Agent回答', dataIndex: 'model_response', key: 'model_response', width: 220,
      sorter: (a, b) => (a.model_response || '').localeCompare(b.model_response || ''),
      render: (t: string) => (
        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto', background: '#fafafa', padding: 4, borderRadius: 4, fontSize: 12 }}>
          {t || <span style={{ color: '#ccc' }}>无回答</span>}
        </div>
      ),
    },
    {
      title: '结果', key: 'result', width: 68, sorter: (a, b) => a.is_correct - b.is_correct,
      filters: resultFilters, onFilter: (v, r) => v === 'correct' ? r.is_correct === 1 : r.is_correct === 0,
      render: (_: unknown, r: EvaluationResult) =>
        r.is_correct ? <Tag icon={<CheckCircleOutlined />} color="success">正确</Tag> : <Tag icon={<CloseCircleOutlined />} color="error">错误</Tag>,
    },
    { title: '原因', key: 'reason', width: 110, ellipsis: true, sorter: (a, b) => (a.reason || '').localeCompare(b.reason || ''), render: (_: unknown, r: EvaluationResult) => r.reason || '-' },
    { title: 'Token', key: 'token', width: 65, sorter: (a, b) => (a.token_count || 0) - (b.token_count || 0), render: (_: unknown, r: EvaluationResult) => (r.token_count || 0).toLocaleString() },
    { title: '耗时', key: 'runtime', width: 65, sorter: (a, b) => (a.runtime_ms || 0) - (b.runtime_ms || 0), render: (_: unknown, r: EvaluationResult) => `${r.runtime_ms || 0}ms` },
    ...(hasTrajectory ? [
      { title: '步骤', key: 'steps', width: 50, sorter: (a, b) => computeTrajectoryStats(a.trajectory).totalSteps - computeTrajectoryStats(b.trajectory).totalSteps, render: (_: unknown, r: EvaluationResult) => computeTrajectoryStats(r.trajectory).totalSteps || '-' },
      {
        title: '工具', key: 'tools', width: 55, sorter: (a, b) => computeTrajectoryStats(a.trajectory).toolCalls - computeTrajectoryStats(b.trajectory).toolCalls,
        render: (_: unknown, r: EvaluationResult) => {
          const { toolCalls, errorTools } = computeTrajectoryStats(r.trajectory);
          if (!toolCalls) return '-';
          return <span>{toolCalls}{errorTools > 0 && <WarningOutlined style={{ color: '#ff4d4f', marginLeft: 4 }} />}</span>;
        },
      },
    ] : []),
    {
      title: '标注', key: 'annotation', width: 120,
      render: (_: unknown, record: EvaluationResult) =>
        editingAnno === record.id ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Input.TextArea size="small" rows={2} value={annoText} onChange={(e) => setAnnoText(e.target.value)} />
            <Space size={0}>
              <Button size="small" type="link" loading={savingAnno} onClick={() => handleSaveAnnotation(record.id)}>保存</Button>
              <Button size="small" type="link" onClick={() => setEditingAnno(null)}>取消</Button>
            </Space>
          </Space>
        ) : (
          <div>
            <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{record.annotation || <span style={{ color: '#ccc' }}>—</span>}</span>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => startEditAnno(record)} style={{ marginLeft: 4 }} />
          </div>
        ),
    },
    ...(hasTrajectory ? [{
      title: '轨迹', key: 'traj', width: 48, align: 'center',
      render: (_: unknown, r: EvaluationResult) =>
        r.trajectory?.length ? <Button type="text" size="small" icon={<EyeOutlined style={{ color: '#1677ff' }} />} onClick={() => openTrajModal(r)} title="查看轨迹" /> : null,
    }] : []),
  ];

  return (
    <div>
      <Title level={3}>{group.name}</Title>
      <Tag color="purple" style={{ marginBottom: 24 }}>实验: {experimentName}</Tag>

      {/* 汇总卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={6}><Card style={{ height: '100%' }}><Statistic title="准确率" value={(accuracy * 100).toFixed(1)} suffix="%" valueStyle={{ color: accuracy >= 0.8 ? '#52c41a' : accuracy >= 0.5 ? '#faad14' : '#ff4d4f' }} /></Card></Col>
        <Col xs={12} sm={8} md={6}><Card style={{ height: '100%' }}><Statistic title="正确 / 总数" value={correctCount} suffix={`/ ${totalCount}`} /></Card></Col>
        <Col xs={12} sm={8} md={6}><Card style={{ height: '100%' }}><Statistic title="总 Token" value={summary.totalTokens.toLocaleString()} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col xs={12} sm={8} md={6}><Card style={{ height: '100%' }}><Statistic title="平均耗时" value={summary.avgRuntime.toFixed(0)} suffix="ms" prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col xs={12} sm={8} md={6}><Card style={{ height: '100%' }}><Statistic title="平均得分" value={(results.reduce((s, r) => s + (r.score || 0), 0) / (totalCount || 1)).toFixed(2)} /></Card></Col>
        <Col xs={12} sm={8} md={6}><Card style={{ height: '100%' }}><Statistic title="平均工具调用" value={hasTrajectory ? summary.avgTools.toFixed(1) : '-'} prefix={<ToolOutlined />} /></Card></Col>
        <Col xs={12} sm={8} md={6}><Card style={{ height: '100%' }}><Statistic title="工具错误次数" value={hasTrajectory ? summary.totalErrors : '-'} prefix={summary.totalErrors > 0 ? <WarningOutlined style={{ color: '#ff4d4f' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />} valueStyle={{ color: summary.totalErrors > 0 ? '#ff4d4f' : undefined }} /></Card></Col>
        <Col xs={12} sm={8} md={6}><Card style={{ height: '100%' }}><Statistic title="测试用例数" value={totalCount} /></Card></Col>
        {Object.entries(group.parameters || {}).map(([k, v]) => (
          <Col xs={12} sm={8} md={6} key={k}><Card style={{ height: '100%' }}><Statistic title={k} value={String(v)} /></Card></Col>
        ))}
      </Row>

      {/* 多维评分 */}
      {hasCustomScores && <CustomScoresChart results={results} />}

      {/* 结果表格 */}
      <Card title="📋 Agent 评测结果" style={{ borderRadius: 8 }}
        extra={
          <span style={{ display: 'flex', gap: 8 }}>
            <Input size="small" placeholder="筛选..." prefix={<SearchOutlined />} value={filterText} onChange={(e) => setFilterText(e.target.value)} allowClear style={{ width: 180 }} />
            <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>管理评测结果</Button>
          </span>
        }
      >
        <Table columns={columns} dataSource={filtered} rowKey="id" pagination={{ pageSize: 20 }}
          size="small" bordered scroll={{ x: 1100 }} loading={resultsLoading}
          rowClassName={(record) => (record.is_correct ? '' : 'param-diff-row')} />
      </Card>

      {/* 轨迹弹窗 */}
      <Modal title="Agent 执行轨迹" open={!!trajModal} onCancel={() => setTrajModal(null)} footer={null} width={800}>
        {trajModal?.trajectory ? (
          <div>
            <TrajectoryViewer trajectory={trajModal.trajectory} />
            {trajModal.think && (
              <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                <Button
                  type={showThink ? 'default' : 'primary'}
                  icon={<BulbOutlined />}
                  onClick={() => setShowThink(!showThink)}
                >
                  {showThink ? '隐藏 Think 过程' : '查看 Think 过程'}
                </Button>
                {showThink && (
                  <div style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto', background: '#fafafa', padding: 12, borderRadius: 4, fontSize: 13, marginTop: 8 }}>
                    {trajModal.think}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>该用例没有轨迹数据</div>
        )}
      </Modal>

      <Modal title={`管理评测结果 — ${group.name}`} open={uploadOpen} onCancel={() => setUploadOpen(false)}
        footer={null} width={900} destroyOnClose
      >
        <ResultsUploader groupId={group.id} testCases={testCases} existingResults={results} onRefresh={onRefresh} isAgent />
      </Modal>
    </div>
  );
};

export default AgentEvaluationDetail;
