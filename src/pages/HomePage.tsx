import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Button, Input, Select, Space, DatePicker, Statistic, message } from 'antd';
import {
  SearchOutlined, ExperimentOutlined, FolderOpenOutlined,
  UserOutlined, CalendarOutlined, TeamOutlined, ArrowRightOutlined, PlusOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { fetchExperiments, createExperiment } from '../api/endpoints';
import ExperimentFormModal from '../components/ExperimentFormModal';
import type { Experiment } from '../types';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const typeOptions = [
  { label: '训练实验', value: 'training' },
  { label: '评测实验', value: 'evaluation' },
  { label: 'Agent评测', value: 'agent_evaluation' },
  { label: '其他', value: 'other' },
];

const typeLabel: Record<string, { color: string; text: string }> = {
  training: { color: 'green', text: '训练' },
  evaluation: { color: 'orange', text: '评测' },
  agent_evaluation: { color: 'purple', text: 'Agent评测' },
  other: { color: 'default', text: '其他' },
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { categories, selectExperiment } = useData();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

  // 筛选状态
  const [searchName, setSearchName] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterDateRange, setFilterDateRange] = useState<[string, string] | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setExperiments(await fetchExperiments()); }
    catch { /* */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreateExperiment = async (values: { name: string; description: string; date: string; owner?: string }) => {
    await createExperiment(values);
    message.success('实验已创建');
    setCreateOpen(false);
    load();
  };

  // 收集所有负责人用于筛选
  const ownerOptions = useMemo(() =>
    [...new Set(experiments.map((e) => e.owner).filter(Boolean))].map((v) => ({ label: v, value: v! })),
    [experiments],
  );

  // 筛选
  const filtered = useMemo(() => {
    return experiments.filter((e) => {
      if (searchName && !e.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterOwner && e.owner !== filterOwner) return false;
      if (filterType && e.type !== filterType) return false;
      if (filterDateRange) {
        const [start, end] = filterDateRange;
        if (start && e.date < start) return false;
        if (end && e.date > end) return false;
      }
      return true;
    });
  }, [experiments, searchName, filterOwner, filterType, filterDateRange]);

  const columns: ColumnsType<Experiment> = [
    {
      title: '实验名称', dataIndex: 'name', key: 'name', width: 280, ellipsis: true,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record: Experiment) => (
        <a onClick={() => { selectExperiment(record.id); navigate(`/experiment/${record.id}`); }}>
          {name}
        </a>
      ),
    },
    {
      title: '类别', key: 'category', width: 140,
      sorter: (a, b) => {
        const ca = categories.find((c) => c.id === a.category_id)?.name || '';
        const cb = categories.find((c) => c.id === b.category_id)?.name || '';
        return ca.localeCompare(cb);
      },
      render: (_: unknown, r: Experiment) => {
        const cat = categories.find((c) => c.id === r.category_id);
        return <Tag color="blue">{cat?.name || '—'}</Tag>;
      },
    },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 110,
      sorter: (a, b) => a.type.localeCompare(b.type),
      render: (t: string) => <Tag color={typeLabel[t]?.color || 'default'}>{typeLabel[t]?.text || t}</Tag>,
    },
    {
      title: '负责人', dataIndex: 'owner', key: 'owner', width: 110, ellipsis: true,
      sorter: (a, b) => (a.owner || '').localeCompare(b.owner || ''),
      render: (v: string) => v ? <Tag icon={<UserOutlined />}>{v}</Tag> : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: '日期', dataIndex: 'date', key: 'date', width: 120,
      sorter: (a, b) => a.date.localeCompare(b.date),
      render: (d: string) => <Tag icon={<CalendarOutlined />}>{d}</Tag>,
    },
    {
      title: '实验组', dataIndex: 'groupCount', key: 'groupCount', width: 80, align: 'center',
      sorter: (a, b) => (a.groupCount ?? 0) - (b.groupCount ?? 0),
      render: (v: number) => <Tag icon={<TeamOutlined />} color="green">{v ?? 0}</Tag>,
    },
  ];

  return (
    <div>
      {/* 顶部横幅 */}
      <Card style={{ marginBottom: 24, background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 100%)', border: '1px solid #d6e4ff', borderRadius: 12 }}>
        <Row align="middle" gutter={[24, 16]}>
          <Col flex="auto">
            <Title level={2} style={{ margin: 0, color: '#1677ff' }}>📊 语料实验室</Title>
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 15 }}>
              实验数据展示平台 — 统一管理训练实验、评测实验和 Agent 评测结果
            </Typography.Paragraph>
          </Col>
          <Col>
            <Space size={24}>
              <Statistic title="实验类别" value={categories.length} prefix={<FolderOpenOutlined />} />
              <Statistic title="实验总数" value={experiments.length} prefix={<ExperimentOutlined />} />
            </Space>
          </Col>
          <Col>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建实验</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Space wrap>
          <Input
            placeholder="搜索实验名称..."
            prefix={<SearchOutlined />}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Select
            placeholder="实验负责人"
            value={filterOwner || undefined}
            onChange={(v) => setFilterOwner(v || null)}
            allowClear
            options={ownerOptions}
            style={{ width: 160 }}
          />
          <Select
            placeholder="实验类型"
            value={filterType}
            onChange={(v) => setFilterType(v || null)}
            allowClear
            options={typeOptions}
            style={{ width: 150 }}
          />
          <RangePicker
            placeholder={['开始日期', '结束日期']}
            onChange={(_, dateStrings) => setFilterDateRange(dateStrings[0] && dateStrings[1] ? [dateStrings[0], dateStrings[1]] as [string, string] : null)}
            style={{ width: 260 }}
            allowClear
          />
          <Tag color="blue">{filtered.length} / {experiments.length} 个实验</Tag>
        </Space>
      </Card>

      {/* 实验列表 */}
      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
        size="middle"
        scroll={{ x: 900 }}
        onRow={(record) => ({
          onClick: () => { selectExperiment(record.id); navigate(`/experiment/${record.id}`); },
          style: { cursor: 'pointer' },
        })}
      />

      <ExperimentFormModal
        open={createOpen}
        onOk={handleCreateExperiment}
        onCancel={() => setCreateOpen(false)}
      />
    </div>
  );
};

export default HomePage;
