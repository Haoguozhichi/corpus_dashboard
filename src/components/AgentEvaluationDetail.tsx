import React, { useState, useEffect, useMemo } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Button, Modal, Input, Space, Dropdown, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  ThunderboltOutlined, ToolOutlined, WarningOutlined, UploadOutlined, SearchOutlined, EditOutlined,
  EyeOutlined, RobotOutlined, DownOutlined,
} from '@ant-design/icons';
import type { ExperimentGroup, TestCase, EvaluationResult, TrajectoryStep } from '../types';
import { fetchResults, updateResult, updateGroup, diagnoseTrajectory, diagnoseError, clusterErrors } from '../api/endpoints';
import ResultsUploader from './ResultsUploader';
import TrajectoryViewer from './TrajectoryViewer';

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
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');
  const [allResults, setAllResults] = useState<EvaluationResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [trajModal, setTrajModal] = useState<EvaluationResult | null>(null);
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

  const [colFilters, setColFilters] = useState<Record<string, any>>({});
  const displayCount = (() => {
    let data = filtered;
    Object.entries(colFilters).forEach(([key, vals]) => {
      if (!vals || (Array.isArray(vals) && vals.length === 0)) return;
      const arr = Array.isArray(vals) ? vals : [vals];
      data = data.filter((r) => arr.some((v: any) => {
        if (key === 'is_correct') return v === 'correct' ? r.is_correct === 1 : r.is_correct === 0;
        return String((r as any)[key] ?? '') === String(v);
      }));
    });
    return data.length;
  })();

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

  // LLM 轨迹诊断（每个用例独立）
  const [trajDiagnosis, setTrajDiagnosis] = useState<Record<string, string>>({});
  const [trajDiagLoading, setTrajDiagLoading] = useState(false);

  const handleDiagnoseTraj = async () => {
    if (!trajModal) return;
    const rid = trajModal.id;
    // 已有诊断直接显示
    if (trajDiagnosis[rid] || trajModal.traj_diagnosis) {
      setTrajDiagnosis((prev) => ({ ...prev, [rid]: prev[rid] || trajModal.traj_diagnosis || '' }));
      return;
    }
    setTrajDiagLoading(true);
    setTrajDiagnosis((prev) => ({ ...prev, [rid]: '分析中...' }));
    try {
      const res = await diagnoseTrajectory({ question: trajModal.question || '', trajectory: trajModal.trajectory, is_correct: !!trajModal.is_correct });
      setTrajDiagnosis((prev) => ({ ...prev, [rid]: res.result }));
      // 自动保存到数据库
      await updateResult(rid, { traj_diagnosis: res.result }).catch(() => {});
      setAllResults((prev) => prev.map((r) => (r.id === rid ? { ...r, traj_diagnosis: res.result } : r)));
    } catch {
      setTrajDiagnosis((prev) => ({ ...prev, [rid]: '诊断失败' }));
    } finally { setTrajDiagLoading(false); }
  };

  // LLM 通用分析
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmResult, setLlmResult] = useState<string | null>(null);
  const [llmModalTitle, setLlmModalTitle] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const getSelected = () => filtered.filter((r) => selectedRowKeys.includes(r.id));

  const handleDiagnose = async () => {
    if (selectedRowKeys.length === 0) { message.warning('请先勾选要诊断的用例'); return; }
    const targets = getSelected();
    const errors = targets.filter((r) => !r.is_correct);
    if (errors.length === 0) { message.warning('所选用例中没有错误的'); return; }
    setLlmLoading(true); setLlmModalTitle(`错误诊断 (${Math.min(errors.length, 10)}条)`);
    const parts: string[] = [];
    for (let i = 0; i < Math.min(errors.length, 10); i++) {
      const r = errors[i];
      try {
        const res = await diagnoseError({ question: r.question || '', expected_answer: r.expected_answer || '', model_response: r.model_response || '' });
        await updateResult(r.id, { reason: res.result }).catch(() => {});
        setAllResults((prev) => prev.map((x) => (x.id === r.id ? { ...x, reason: res.result } : x)));
        parts.push(`## ${i + 1}. ${r.question?.slice(0, 40)}...\n${res.result}\n`);
      } catch (err: any) { parts.push(`## ${i + 1}. 诊断失败\n`); }
    }
    setLlmResult(parts.join('\n---\n'));
    setLlmLoading(false);
  };

  const handleClusterErrors = async () => {
    const errors = results.filter((r) => !r.is_correct);
    if (errors.length === 0) { message.warning('没有错误用例'); return; }
    setLlmLoading(true); setLlmModalTitle(`错误聚类分析 (${errors.length}条)`);
    try {
      const res = await clusterErrors({ cases: errors.map((r) => ({ question: r.question || '', model_response: r.model_response || '' })) });
      if ((res as any).clusters) {
        await updateGroup(group.id, { error_clusters: (res as any).clusters }).catch(() => {});
        onRefresh();
        const text = (res as any).clusters.map((c: any) => `### ${c.name} (${c.count}条)\n${c.description}`).join('\n\n');
        setLlmResult(text + ((res as any).summary ? `\n\n---\n**总结**: ${(res as any).summary}` : ''));
      } else {
        setLlmResult((res as any).raw || JSON.stringify(res));
      }
    } catch { setLlmResult('聚类分析失败'); }
    setLlmLoading(false);
  };

  const questionFilters = [...new Set(results.map((r) => r.question || '').filter(Boolean))].slice(0, 200).map((q) => ({ text: q.length > 40 ? q.slice(0, 40) + '...' : q, value: q }));
  const resultFilters = [{ text: '✅ 正确', value: 'correct' }, { text: '❌ 错误', value: 'incorrect' }];

  const openTrajModal = (record: EvaluationResult) => { setTrajModal(record); setShowThink(false); };

  // 收集 JSON 导入带来的自定义字段
  const STD_FIELDS = new Set(['id', 'groupId', 'group_id', 'test_case_id', 'question', 'expected_answer', 'model_response', 'is_correct', 'runtime_ms', 'token_count', 'reason', 'annotation', 'think', 'category_tag', 'trajectory', 'traj_diagnosis', 'sub_category', 'key', 'case_id']);
  const extraFields = [...new Set(results.flatMap((r) => Object.keys(r).filter((k) => !STD_FIELDS.has(k))))];
  const hasSubCategory = results.some((r) => r.sub_category);
  const subCatFilters = hasSubCategory ? [...new Set(results.map((r) => r.sub_category).filter(Boolean))].map((v) => ({ text: v, value: v })) : [];

  const columns: ColumnsType<EvaluationResult> = [
    {
      title: '#', key: 'index', width: 44, align: 'center',
      render: (_: any, _r: any, i: number) => <span style={{ color: '#999', fontSize: 12 }}>{i + 1}</span>,
    },
    {
      title: '题目', dataIndex: 'question', key: 'question', width: 200, ellipsis: true,
      sorter: (a, b) => (a.question || '').localeCompare(b.question || ''),
      filters: questionFilters, onFilter: (v, r) => r.question === v, filterSearch: true,
      render: (t: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{t}</span>,
    },
    // 子分组列（仅在有子分组时显示）
    ...(hasSubCategory ? [{
      title: '子分组', dataIndex: 'sub_category', key: 'sub_category', width: 100,
      sorter: (a, b) => (a.sub_category || '').localeCompare(b.sub_category || ''),
      filters: subCatFilters, onFilter: (v: any, r: EvaluationResult) => r.sub_category === v, filterSearch: true,
      render: (t: string) => t ? <Tag>{t}</Tag> : <span style={{ color: '#ccc' }}>—</span>,
    }] : []),
    {
      title: '正确答案', dataIndex: 'expected_answer', key: 'expected_answer', width: 160, ellipsis: true,
      sorter: (a, b) => (a.expected_answer || '').localeCompare(b.expected_answer || ''),
      filters: [...new Set(results.slice(0, 500).map((r) => r.expected_answer || '').filter(Boolean))].slice(0, 100).map((v) => ({ text: v.length > 40 ? v.slice(0, 40) + '...' : v, value: v })),
      onFilter: (v, r) => r.expected_answer === v, filterSearch: true,
      render: (t: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{t || '-'}</span>,
    },
    {
      title: 'Agent回答', dataIndex: 'model_response', key: 'model_response', width: 220,
      sorter: (a, b) => (a.model_response || '').localeCompare(b.model_response || ''),
      render: (t: string, record: EvaluationResult) => {
        const expanded = expandedCells.has(record.id);
        const long = t && t.length > 100;
        return (
          <div>
            <div style={{
              whiteSpace: 'pre-wrap', maxHeight: expanded ? 'none' : 100, overflow: expanded ? 'visible' : 'auto',
              background: '#fafafa', padding: 4, borderRadius: 4, fontSize: 12,
            }}>
              {t || <span style={{ color: '#ccc' }}>无回答</span>}
            </div>
            {long && (
              <Button type="link" size="small" onClick={() => {
                setExpandedCells((prev) => { const next = new Set(prev); expanded ? next.delete(record.id) : next.add(record.id); return next; });
              }}>
                {expanded ? '收起' : '更多'}
              </Button>
            )}
          </div>
        );
      },
    },
    // JSON 导入的自定义字段
    ...extraFields.map((field) => ({
      title: field,
      dataIndex: field,
      key: field,
      width: Math.max(100, Math.min(160, field.length * 14 + 20)),
      ellipsis: true,
      sorter: (a: any, b: any) => {
        const va = a[field], vb = b[field];
        if (typeof va === 'number' && typeof vb === 'number') return va - vb;
        return String(va ?? '').localeCompare(String(vb ?? ''));
      },
      render: (v: any) => {
        if (v === undefined || v === null) return <span style={{ color: '#ccc' }}>—</span>;
        if (typeof v === 'boolean') return v ? '✅' : '❌';
        if (typeof v === 'object') return <span style={{ fontSize: 11 }}>{JSON.stringify(v).slice(0, 80)}</span>;
        return <span style={{ fontSize: 12 }}>{String(v)}</span>;
      },
    })),
    {
      title: '结果', dataIndex: 'is_correct', key: 'is_correct', width: 68, sorter: (a, b) => a.is_correct - b.is_correct,
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
        title: '工具调用', key: 'tools', width: 62, sorter: (a, b) => computeTrajectoryStats(a.trajectory).toolCalls - computeTrajectoryStats(b.trajectory).toolCalls,
        render: (_: unknown, r: EvaluationResult) => computeTrajectoryStats(r.trajectory).toolCalls || '-',
      },
      {
        title: '工具错误', key: 'errTools', width: 62, sorter: (a, b) => computeTrajectoryStats(a.trajectory).errorTools - computeTrajectoryStats(b.trajectory).errorTools,
        render: (_: unknown, r: EvaluationResult) => {
          const n = computeTrajectoryStats(r.trajectory).errorTools;
          if (!n) return <span style={{ color: '#52c41a' }}>0</span>;
          return <span style={{ color: '#ff4d4f', fontWeight: 500 }}>{n}</span>;
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

      {/* AI 错误聚类结果 */}
      {group.error_clusters && group.error_clusters.length > 0 && (
        <Card title="🤖 AI 错误聚类分析" size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
          {group.error_clusters.map((c: any, i: number) => (
            <Tag key={i} color={['red', 'orange', 'gold', 'purple', 'magenta'][i % 5]} style={{ marginBottom: 4 }}>
              {c.name} ({c.count}条)
            </Tag>
          ))}
          {group.error_clusters.map((c: any, i: number) => (
            <div key={i} style={{ marginTop: 4, fontSize: 12, color: '#666' }}><strong>{c.name}</strong>：{c.description}</div>
          ))}
        </Card>
      )}

      {/* 结果表格 */}
      <Card title="📋 Agent 评测结果" style={{ borderRadius: 8 }}
        extra={
          <span style={{ display: 'flex', gap: 8 }}>
            <Input size="small" placeholder="筛选..." prefix={<SearchOutlined />} value={filterText} onChange={(e) => setFilterText(e.target.value)} allowClear style={{ width: 180 }} />
            <Tag>筛选 {displayCount}/{results.length} 条</Tag>
            {selectedRowKeys.length > 0 && <Tag color="blue">已选 {selectedRowKeys.length} 条</Tag>}
            <Dropdown menu={{ items: [
              { key: 'diagnose', label: selectedRowKeys.length > 0 ? `AI 诊断错误 (${selectedRowKeys.length}已选)` : 'AI 诊断错误（请先勾选）', disabled: selectedRowKeys.length === 0, onClick: handleDiagnose },
              { key: 'cluster', label: 'AI 错误聚类(全量)', onClick: handleClusterErrors },
            ] }}>
              <Button size="small" icon={<RobotOutlined />} loading={llmLoading}>AI 分析 <DownOutlined /></Button>
            </Dropdown>
            <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>管理评测结果</Button>
          </span>
        }
      >
        <Table columns={columns} dataSource={filtered} rowKey="id" pagination={{ pageSize: 20 }}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as string[]) }}
          onChange={(_p, filters: any) => setColFilters(filters || {})}
          size="small" bordered scroll={{ x: 1100 }} loading={resultsLoading}
          rowClassName={(record) => (record.is_correct ? '' : 'param-diff-row')} />
      </Card>

      {/* 轨迹弹窗 */}
      <Modal title="Agent 执行轨迹" open={!!trajModal} onCancel={() => setTrajModal(null)} footer={null} width={800}>
        {trajModal?.trajectory ? (
          <div>
            <TrajectoryViewer trajectory={trajModal.trajectory} />
            {/* AI 轨迹诊断 */}
            <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <Button icon={<RobotOutlined />} onClick={handleDiagnoseTraj} loading={trajDiagLoading}>
                AI 诊断轨迹
              </Button>
              {(trajDiagnosis[trajModal.id] || trajModal.traj_diagnosis) && (
                <div style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', background: '#fafafa', padding: 12, borderRadius: 4, fontSize: 13, marginTop: 8 }}>
                  {trajDiagnosis[trajModal.id] || trajModal.traj_diagnosis}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>该用例没有轨迹数据</div>
        )}
      </Modal>

      {/* LLM 分析结果弹窗 */}
      <Modal title={`AI 分析 - ${llmModalTitle}`} open={!!llmResult} onCancel={() => setLlmResult(null)} footer={null} width={700}>
        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto', background: '#fafafa', padding: 12, borderRadius: 4, fontSize: 13 }}>
          {llmResult || '分析中...'}
        </div>
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
