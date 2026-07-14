import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Typography, Table, Tag, Button, Input, Select, Space, DatePicker, Statistic, message, Popconfirm } from 'antd';
import {
  SearchOutlined, ExperimentOutlined,
  UserOutlined, CalendarOutlined, TeamOutlined, PlusOutlined,
  EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { fetchExperiments, createExperiment, updateExperiment, deleteExperiment } from '../api/endpoints';
import ExperimentFormModal from '../components/ExperimentFormModal';
import type { Experiment } from '../types';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { selectExperiment } = useData();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

  // 筛选状态
  const [searchName, setSearchName] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterDateRange, setFilterDateRange] = useState<[string, string] | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Experiment | null>(null);

  const load = async () => {
    setLoading(true);
    try { setExperiments(await fetchExperiments()); }
    catch { /* */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreateExperiment = async (values: { name: string; description: string; date: string; owner?: string }) => {
    if (editing) {
      await updateExperiment(editing.id, values);
      message.success('实验已更新');
      setEditing(null);
    } else {
      await createExperiment(values as { name: string; description?: string; date: string; owner?: string });
      message.success('实验已创建');
    }
    setCreateOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteExperiment(id);
    message.success('实验已删除');
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
      if (filterDateRange) {
        const [start, end] = filterDateRange;
        if (start && e.date < start) return false;
        if (end && e.date > end) return false;
      }
      return true;
    });
  }, [experiments, searchName, filterOwner, filterDateRange]);

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
    {
      title: '操作', key: 'actions', width: 80, align: 'center',
      render: (_: unknown, record: Experiment) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <Button
            type="text" size="small" icon={<EditOutlined />}
            onClick={() => { setEditing(record); setCreateOpen(true); }}
          />
          <Popconfirm
            title="确定删除该实验？" description="实验下所有实验组和评测结果将被一并删除"
            onConfirm={() => handleDelete(record.id)}
            okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
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
              实验数据展示平台 — 统一管理评测实验和 Agent 评测结果
            </Typography.Paragraph>
          </Col>
          <Col>
            <Statistic title="实验总数" value={experiments.length} prefix={<ExperimentOutlined />} />
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建实验</Button>
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
        editing={editing}
        onOk={handleCreateExperiment}
        onCancel={() => { setCreateOpen(false); setEditing(null); }}
      />
    </div>
  );
};

export default HomePage;
