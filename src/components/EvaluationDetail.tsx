import React, { useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Button, Modal, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, ThunderboltOutlined, UploadOutlined } from '@ant-design/icons';
import type { ExperimentGroup, TestCase } from '../types';
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

  const results = group.results || [];
  const filtered = filterText.trim()
    ? results.filter((r) =>
        (r.question || '').includes(filterText) ||
        (r.expected_answer || '').includes(filterText) ||
        (r.model_response || '').includes(filterText))
    : results;
  const correctCount = group.correctCount || 0;
  const totalCount = group.resultCount || results.length;
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

  const columns = [
    {
      title: '题目', dataIndex: 'question', key: 'question', width: 200, ellipsis: true,
      render: (text: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{text}</span>,
    },
    {
      title: '标准答案', dataIndex: 'expected_answer', key: 'expected_answer', width: 180, ellipsis: true,
      render: (text: string) => <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{text}</span>,
    },
    {
      title: '模型回答', dataIndex: 'model_response', key: 'model_response', width: 280,
      render: (text: string) => (
        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto', background: '#fafafa', padding: 6, borderRadius: 4, fontSize: 12 }}>
          {text || <span style={{ color: '#ccc' }}>无回答</span>}
        </div>
      ),
    },
    {
      title: '结果', dataIndex: 'is_correct', key: 'is_correct', width: 70,
      render: (v: number) =>
        v ? <Tag icon={<CheckCircleOutlined />} color="success">正确</Tag> : <Tag icon={<CloseCircleOutlined />} color="error">错误</Tag>,
    },
    { title: '得分', dataIndex: 'score', key: 'score', width: 60, render: (v: number) => v?.toFixed(2) ?? '-' },
    { title: '耗时', dataIndex: 'runtime_ms', key: 'runtime', width: 80, render: (v: number) => v ? `${v}ms` : '-' },
    { title: 'Token', dataIndex: 'token_count', key: 'token', width: 70, render: (v: number) => v > 0 ? v.toLocaleString() : '-' },
    { title: '标签', dataIndex: 'category_tag', key: 'category_tag', width: 80 },
  ];

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

      {(() => {
        const tagMap: Record<string, { total: number; correct: number }> = {};
        results.forEach((r) => {
          const tag = r.category_tag || '未分类';
          if (!tagMap[tag]) tagMap[tag] = { total: 0, correct: 0 };
          tagMap[tag].total++;
          if (r.is_correct) tagMap[tag].correct++;
        });
        return Object.keys(tagMap).length > 0 ? (
          <Card title="按类别统计" style={{ marginBottom: 16 }} size="small">
            {Object.entries(tagMap).map(([tag, stats]) => (
              <Tag key={tag} color={stats.correct === stats.total ? 'green' : 'orange'} style={{ marginBottom: 4 }}>
                {tag}: {stats.correct}/{stats.total} ({(stats.correct / stats.total * 100).toFixed(0)}%)
              </Tag>
            ))}
          </Card>
        ) : null;
      })()}

      <Card title="📋 评测结果与答案对比" style={{ borderRadius: 8 }}
        extra={
          <span style={{ display: 'flex', gap: 8 }}>
            <Input
              size="small" placeholder="筛选..." prefix={<SearchOutlined />}
              value={filterText} onChange={(e) => setFilterText(e.target.value)} allowClear style={{ width: 180 }}
            />
            <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>管理评测结果</Button>
          </span>
        }
      >
        <Table columns={columns} dataSource={filtered} rowKey="id" pagination={{ pageSize: 20 }}
          size="small" bordered scroll={{ x: 900 }}
          rowClassName={(record) => (record.is_correct ? '' : 'param-diff-row')} />
      </Card>

      <Modal title={`管理评测结果 — ${group.name}`} open={uploadOpen} onCancel={() => setUploadOpen(false)}
        footer={null} width={900} destroyOnClose
      >
        <ResultsUploader groupId={group.id} testCases={testCases} existingResults={results} onRefresh={onRefresh} />
      </Modal>
    </div>
  );
};

export default EvaluationDetail;
