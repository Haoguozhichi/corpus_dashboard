import React, { useState, useEffect, useMemo } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Button, Modal, Input, Spin } from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  ThunderboltOutlined, ToolOutlined, WarningOutlined, UploadOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ExperimentGroup, TestCase, EvaluationResult, TrajectoryStep } from '../types';
import { fetchResults } from '../api/endpoints';
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

/** 从轨迹中计算统计信息 */
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
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');
  const [allResults, setAllResults] = useState<EvaluationResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  // 独立加载全量结果
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

  // 汇总统计
  const summary = useMemo(() => {
    let totalTokens = 0, totalRuntime = 0, totalTools = 0, totalErrors = 0;
    results.forEach((r) => {
      totalTokens += r.token_count || 0;
      totalRuntime += r.runtime_ms || 0;
      const stats = computeTrajectoryStats(r.trajectory);
      totalTools += stats.toolCalls;
      totalErrors += stats.errorTools;
    });
    return {
      totalTokens,
      avgRuntime: totalCount > 0 ? totalRuntime / totalCount : 0,
      avgTools: totalCount > 0 ? totalTools / totalCount : 0,
      totalErrors,
    };
  }, [results, totalCount]);

  const hasTrajectory = results.some((r) => r.trajectory && r.trajectory.length > 0);
  const hasCustomScores = results.some((r) => r.custom_scores && Object.keys(r.custom_scores).length > 0);

  const columns = [
    {
      title: '题目', dataIndex: 'question', key: 'question', width: 250, ellipsis: true,
      render: (t: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{t}</span>,
    },
    {
      title: '结果', key: 'result', width: 70,
      render: (_: unknown, r: EvaluationResult) =>
        r.is_correct ? <Tag icon={<CheckCircleOutlined />} color="success">正确</Tag> : <Tag icon={<CloseCircleOutlined />} color="error">错误</Tag>,
    },
    {
      title: 'Token', key: 'token', width: 80,
      render: (_: unknown, r: EvaluationResult) => (r.token_count || 0).toLocaleString(),
    },
    {
      title: '耗时', key: 'runtime', width: 80,
      render: (_: unknown, r: EvaluationResult) => `${r.runtime_ms || 0}ms`,
    },
    {
      title: '原因', key: 'reason', width: 120, ellipsis: true,
      render: (_: unknown, r: EvaluationResult) => r.reason || '-',
    },
    ...(hasTrajectory ? [
      {
        title: '步骤', key: 'steps', width: 60,
        render: (_: unknown, r: EvaluationResult) => computeTrajectoryStats(r.trajectory).totalSteps || '-',
      },
      {
        title: '工具调用', key: 'tools', width: 80,
        render: (_: unknown, r: EvaluationResult) => {
          const { toolCalls, errorTools } = computeTrajectoryStats(r.trajectory);
          if (!toolCalls) return '-';
          return (
            <span>
              {toolCalls}
              {errorTools > 0 && <WarningOutlined style={{ color: '#ff4d4f', marginLeft: 4 }} title={`${errorTools} 次错误`} />}
            </span>
          );
        },
      },
      {
        title: '', key: 'expand', width: 60,
        render: (_: unknown, r: EvaluationResult) =>
          r.trajectory && r.trajectory.length > 0 ? (
            <Button type="link" size="small" onClick={() => toggleRow(r.id)}>
              {expandedRows.includes(r.id) ? '收起' : '展开'}
            </Button>
          ) : null,
      },
    ] : []),
  ];

  const toggleRow = (id: string) => {
    setExpandedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div>
      <Title level={3}>{group.name}</Title>
      <Tag color="purple" style={{ marginBottom: 24 }}>实验: {experimentName}</Tag>

      {/* 汇总卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="准确率" value={(accuracy * 100).toFixed(1)} suffix="%"
              valueStyle={{ color: accuracy >= 0.8 ? '#52c41a' : accuracy >= 0.5 ? '#faad14' : '#ff4d4f' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="正确 / 总数" value={correctCount} suffix={`/ ${totalCount}`} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="总 Token" value={summary.totalTokens.toLocaleString()} prefix={<ThunderboltOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="平均耗时" value={summary.avgRuntime.toFixed(0)} suffix="ms" prefix={<ClockCircleOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="平均得分" value={(results.reduce((s, r) => s + (r.score || 0), 0) / (totalCount || 1)).toFixed(2)} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="平均工具调用" value={hasTrajectory ? summary.avgTools.toFixed(1) : '-'} prefix={<ToolOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="工具错误次数" value={hasTrajectory ? summary.totalErrors : '-'}
              prefix={summary.totalErrors > 0 ? <WarningOutlined style={{ color: '#ff4d4f' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: summary.totalErrors > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="测试用例数" value={totalCount} /></Card>
        </Col>
        {Object.entries(group.parameters || {}).map(([k, v]) => (
          <Col xs={12} sm={8} md={6} key={k}>
            <Card style={{ height: '100%' }}><Statistic title={k} value={String(v)} /></Card>
          </Col>
        ))}
      </Row>

      {/* 多维评分 */}
      {hasCustomScores && <CustomScoresChart results={results} />}

      {/* 结果表格 */}
      <Card
        title="📋 Agent 评测结果"
        style={{ borderRadius: 8 }}
        extra={
          <span style={{ display: 'flex', gap: 8 }}>
            <Input size="small" placeholder="筛选..." prefix={<SearchOutlined />}
              value={filterText} onChange={(e) => setFilterText(e.target.value)} allowClear style={{ width: 180 }} />
            <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>管理评测结果</Button>
          </span>
        }
      >
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="small"
          bordered
          scroll={{ x: hasTrajectory ? 800 : 600 }}
          rowClassName={(record) => (record.is_correct ? '' : 'param-diff-row')}
          expandable={hasTrajectory ? {
            expandedRowRender: (record) =>
              record.trajectory ? <TrajectoryViewer trajectory={record.trajectory} /> : null,
            rowExpandable: (record) => !!(record.trajectory && record.trajectory.length > 0),
            expandedRowKeys: expandedRows,
            onExpand: (expanded, record) => {
              setExpandedRows((prev) =>
                expanded ? [...prev, record.id] : prev.filter((x) => x !== record.id),
              );
            },
          } : undefined}
        />
      </Card>

      <Modal title={`管理评测结果 — ${group.name}`} open={uploadOpen} onCancel={() => setUploadOpen(false)}
        footer={null} width={900} destroyOnClose
      >
        <ResultsUploader groupId={group.id} testCases={testCases} existingResults={results} onRefresh={onRefresh} isAgent />
      </Modal>
    </div>
  );
};

export default AgentEvaluationDetail;
