import React, { useState, useEffect } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Button, Modal, Input, Space, Dropdown, message } from 'antd';
import { SearchOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, ThunderboltOutlined, UploadOutlined, EditOutlined, BulbOutlined, RobotOutlined, DownOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ExperimentGroup, TestCase, EvaluationResult } from '../types';
import { fetchResults, updateResult, updateGroup } from '../api/endpoints';
import { diagnoseError, autoAnnotate, clusterErrors } from '../api/endpoints';
import ResultsUploader from './ResultsUploader';

const { Title } = Typography;

interface Props {
  group: ExperimentGroup;
  experimentName: string;
  experimentId: string;
  testCases: TestCase[];
  onRefresh: () => void;
}

const EvaluationDetail: React.FC<Props> = ({ group, experimentName, experimentId, testCases, onRefresh }) => {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [allResults, setAllResults] = useState<EvaluationResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [thinkModal, setThinkModal] = useState<string | null>(null);
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
  const filtered = (() => {
    if (!filterText.trim()) return results;
    const q = filterText.toLowerCase();
    return results.filter((r) =>
      (r.question || '').toLowerCase().includes(q) ||
      (r.expected_answer || '').toLowerCase().includes(q) ||
      (r.model_response || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q),
    );
  })();

  // 跟踪列筛选状态
  const [colFilters, setColFilters] = useState<Record<string, string[] | null>>({});

  // 综合文本搜索 + 列筛选后的最终条数
  const displayCount = (() => {
    let data = filtered;
    for (const [key, vals] of Object.entries(colFilters)) {
      if (!vals || vals.length === 0) continue;
      data = data.filter((r) => {
        if (key === 'is_correct') return vals.some((v: string) => v === 'correct' ? r.is_correct : !r.is_correct);
        const rv = String((r as any)[key] ?? '');
        return vals.some((v: string) => rv === v);
      });
    }
    return data.length;
  })();
  const correctCount = group.correctCount || results.filter((r) => r.is_correct).length;
  const totalCount = group.resultCount || results.length;
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

  const handleSaveAnnotation = async (id: string) => {
    setSavingAnno(true);
    try {
      await updateResult(id, { annotation: annoText });
      // 乐观更新本地数据
      setAllResults((prev) => prev.map((r) => (r.id === id ? { ...r, annotation: annoText } : r)));
      setEditingAnno(null);
    } catch { /* */ }
    finally { setSavingAnno(false); }
  };

  const startEditAnno = (record: EvaluationResult) => {
    setEditingAnno(record.id);
    setAnnoText(record.annotation || '');
  };

  // LLM 状态
  // 行选择
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const [llmLoading, setLlmLoading] = useState(false);
  const [llmResult, setLlmResult] = useState<string | null>(null);
  const [llmModalTitle, setLlmModalTitle] = useState('');

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
        // 自动填入原因列
        await updateResult(r.id, { reason: res.result }).catch(() => {});
        setAllResults((prev) => prev.map((x) => (x.id === r.id ? { ...x, reason: res.result } : x)));
        parts.push(`## ${i + 1}. ${r.question?.slice(0, 40)}...\n${res.result}\n`);
      } catch (err: any) { parts.push(`## ${i + 1}. 诊断失败: ${err?.message || err}\n`); }
    }
    setLlmResult(parts.join('\n---\n'));
    setLlmLoading(false);
  };

  const handleAutoAnnotate = async () => {
    if (selectedRowKeys.length === 0) { message.warning('请先勾选要标注的用例'); return; }
    const targets = getSelected();
    setLlmLoading(true); setLlmModalTitle(`自动标注 (${Math.min(targets.length, 10)}条)`);
    const sample = targets.slice(0, 10);
    const parts: string[] = [];
    for (const r of sample) {
      try {
        const scores = await autoAnnotate({ question: r.question || '', expected_answer: r.expected_answer || '', model_response: r.model_response || '' });
        if (!scores.error) {
          // 自动保存到 ai_scores
          await updateResult(r.id, { ai_scores: scores }).catch(() => {});
          setAllResults((prev) => prev.map((x) => (x.id === r.id ? { ...x, ai_scores: scores } : x)));
        }
        parts.push(`- ${r.question?.slice(0, 30)}... | correctness:${scores.correctness} completeness:${scores.completeness} conciseness:${scores.conciseness} format:${scores.format}`);
      } catch { parts.push(`- 标注失败`); }
    }
    setLlmResult(parts.join('\n'));
    setLlmLoading(false);
  };

  const handleClusterErrors = async () => {
    const errors = results.filter((r) => !r.is_correct);
    if (errors.length === 0) { message.warning('没有错误用例'); return; }
    setLlmLoading(true); setLlmModalTitle(`错误聚类分析 (${errors.length}条)`);
    try {
      const res = await clusterErrors({ cases: errors.map((r) => ({ question: r.question || '', model_response: r.model_response || '' })) });
      if (res.clusters) {
        // 保存聚类结果到实验组
        await updateGroup(group.id, { error_clusters: res.clusters }).catch(() => {});
        onRefresh();
        const text = res.clusters.map((c: any) => `### ${c.name} (${c.count}条)\n${c.description}`).join('\n\n');
        setLlmResult(text + (res.summary ? `\n\n---\n**总结**: ${res.summary}` : ''));
      } else {
        setLlmResult(res.raw || JSON.stringify(res));
      }
    } catch { setLlmResult('聚类分析失败'); }
    setLlmLoading(false);
  };

  // 为筛选收集唯一值
  const questionFilters = [...new Set(results.map((r) => r.question || '').filter(Boolean))].slice(0, 200).map((q) => ({ text: q.length > 40 ? q.slice(0, 40) + '...' : q, value: q }));
  const resultFilters = [
    { text: '✅ 正确', value: 'correct' },
    { text: '❌ 错误', value: 'incorrect' },
  ];
  const answerFilters = [...new Set(results.map((r) => r.expected_answer || '').filter(Boolean))].slice(0, 100).map((v) => ({ text: v.length > 40 ? v.slice(0, 40) + '...' : v, value: v }));
  const reasonFilters = [...new Set(results.map((r) => r.reason || '').filter(Boolean))].slice(0, 50).map((v) => ({ text: v, value: v }));

  // 收集 JSON 导入带来的自定义字段（不在标准字段中的）
  const STD_FIELDS = new Set(['id', 'groupId', 'group_id', 'test_case_id', 'question', 'expected_answer', 'model_response', 'is_correct', 'score', 'runtime_ms', 'token_count', 'reason', 'annotation', 'think', 'ai_scores', 'category_tag', 'trajectory', 'custom_scores', 'conversations', 'eval_dataset', 'experiment_id', 'name', 'model', 'parameters', 'created_at', 'key']);
  const extraFields = [...new Set(results.flatMap((r) => Object.keys(r).filter((k) => !STD_FIELDS.has(k))))];

  const columns: ColumnsType<EvaluationResult> = [
    {
      title: '题目', dataIndex: 'question', key: 'question', width: 200, ellipsis: true,
      sorter: (a, b) => (a.question || '').localeCompare(b.question || ''),
      filters: questionFilters, onFilter: (value, record) => record.question === value,
      filterSearch: true,
      render: (t: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{t}</span>,
    },
    {
      title: '标准答案', dataIndex: 'expected_answer', key: 'expected_answer', width: 160, ellipsis: true,
      sorter: (a, b) => (a.expected_answer || '').localeCompare(b.expected_answer || ''),
      filters: answerFilters, onFilter: (v, r) => r.expected_answer === v, filterSearch: true,
      render: (t: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{t}</span>,
    },
    {
      title: '模型回答', dataIndex: 'model_response', key: 'model_response', width: 240,
      sorter: (a, b) => (a.model_response || '').localeCompare(b.model_response || ''),
      render: (t: string) => (
        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', background: '#fafafa', padding: 6, borderRadius: 4, fontSize: 12 }}>
          {t || <span style={{ color: '#ccc' }}>无回答</span>}
        </div>
      ),
    },
    // JSON 导入的自定义字段（插入在模型回答与结果之间）
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
      title: '结果', dataIndex: 'is_correct', key: 'is_correct', width: 76,
      sorter: (a, b) => a.is_correct - b.is_correct,
      filters: resultFilters,
      onFilter: (value, record) => value === 'correct' ? record.is_correct === 1 : record.is_correct === 0,
      render: (v: number) =>
        v ? <Tag icon={<CheckCircleOutlined />} color="success">正确</Tag> : <Tag icon={<CloseCircleOutlined />} color="error">错误</Tag>,
    },
    { title: '原因', dataIndex: 'reason', key: 'reason', width: 130, ellipsis: true, filters: reasonFilters, onFilter: (v, r) => r.reason === v, filterSearch: true, sorter: (a, b) => (a.reason || '').localeCompare(b.reason || ''), render: (t: string) => t || '-' },
    { title: '得分', dataIndex: 'score', key: 'score', width: 60, sorter: (a, b) => (a.score || 0) - (b.score || 0), render: (v: number) => v?.toFixed(2) ?? '-' },
    { title: '耗时', dataIndex: 'runtime_ms', key: 'runtime', width: 80, sorter: (a, b) => (a.runtime_ms || 0) - (b.runtime_ms || 0), render: (v: number) => v ? `${v}ms` : '-' },
    { title: 'Token', dataIndex: 'token_count', key: 'token', width: 70, sorter: (a, b) => (a.token_count || 0) - (b.token_count || 0), render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    {
      title: 'AI评分', key: 'ai_scores', width: 130,
      render: (_: unknown, record: EvaluationResult) => {
        if (!record.ai_scores) return <span style={{ color: '#ccc' }}>—</span>;
        return (
          <span style={{ fontSize: 11 }}>
            {Object.entries(record.ai_scores).map(([k, v]) => (
              <Tag key={k} style={{ marginBottom: 2 }}>{k}: {typeof v === 'number' ? v.toFixed(2) : v}</Tag>
            ))}
          </span>
        );
      },
    },
    {
      title: '标注', key: 'annotation', width: 150,
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
    {
      title: 'Think', key: 'think', width: 60, align: 'center',
      render: (_: unknown, record: EvaluationResult) => (
        <Button
          type="link" size="small" icon={<BulbOutlined />}
          onClick={() => setThinkModal(record.id)}
          disabled={!record.think}
          title={record.think ? '查看思考过程' : '无Think数据'}
        />
      ),
    },
  ];

  const thinkRecord = thinkModal ? results.find((r) => r.id === thinkModal) : null;

  return (
    <div>
      <Title level={3}>{group.name}</Title>
      <Tag color="blue" style={{ marginBottom: 24 }}>实验: {experimentName}</Tag>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={12} md={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="准确率" value={(accuracy * 100).toFixed(2)} suffix="%"
              valueStyle={{ color: accuracy >= 0.8 ? '#52c41a' : accuracy >= 0.5 ? '#faad14' : '#ff4d4f' }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="正确 / 总数" value={correctCount} suffix={`/ ${totalCount}`} /></Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="总 Token" value={results.reduce((s, r) => s + (r.token_count || 0), 0).toLocaleString()} /></Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="平均耗时" value={totalCount > 0 ? (results.reduce((s, r) => s + (r.runtime_ms || 0), 0) / totalCount).toFixed(0) : '-'} suffix="ms" />
          </Card>
        </Col>
        {Object.entries(group.parameters || {}).map(([k, v]) => (
          <Col xs={12} sm={12} md={6} key={k}>
            <Card style={{ height: '100%' }}><Statistic title={k} value={String(v)} /></Card>
          </Col>
        ))}
      </Row>

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

      <Card title="📋 评测结果与答案对比" style={{ borderRadius: 8 }}
        extra={
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Input size="small" placeholder="搜索..." prefix={<SearchOutlined />}
              value={filterText} onChange={(e) => setFilterText(e.target.value)} allowClear style={{ width: 180 }} />
            <Tag>筛选 {displayCount}/{results.length} 条</Tag>
            {selectedRowKeys.length > 0 && <Tag color="blue">已选 {selectedRowKeys.length} 条</Tag>}
            <Dropdown menu={{ items: [
              { key: 'diagnose', label: selectedRowKeys.length > 0 ? `AI 诊断错误 (${selectedRowKeys.length}已选)` : 'AI 诊断错误（请先勾选）', disabled: selectedRowKeys.length === 0, onClick: handleDiagnose },
              { key: 'annotate', label: selectedRowKeys.length > 0 ? `AI 自动标注 (${selectedRowKeys.length}已选)` : 'AI 自动标注（请先勾选）', disabled: selectedRowKeys.length === 0, onClick: handleAutoAnnotate },
              { key: 'cluster', label: 'AI 错误聚类(全量)', onClick: handleClusterErrors },
            ] }}>
              <Button size="small" icon={<RobotOutlined />} loading={llmLoading}>AI 分析 <DownOutlined /></Button>
            </Dropdown>
            <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>管理评测结果</Button>
          </span>
        }
      >
        <Table columns={columns} dataSource={filtered} rowKey="id" pagination={{ pageSize: 20 }}
          onChange={(_p, filters: any) => setColFilters(filters || {})}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[]),
          }}
          size="small" bordered scroll={{ x: 1400 }}
          loading={resultsLoading}
          rowClassName={(record) => (record.is_correct ? '' : 'param-diff-row')} />
      </Card>

      {/* Think 弹窗 */}
      <Modal title="思考过程 (Think)" open={!!thinkModal} onCancel={() => setThinkModal(null)} footer={null} width={700}>
        {thinkRecord?.think ? (
          <div style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto', background: '#fafafa', padding: 12, borderRadius: 4, fontSize: 13 }}>
            {thinkRecord.think}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>该用例没有录入 Think 过程</div>
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
        <ResultsUploader groupId={group.id} testCases={testCases} existingResults={results} onRefresh={onRefresh} />
      </Modal>
    </div>
  );
};

export default EvaluationDetail;
