import React, { useEffect, useState, useMemo } from 'react';
import { Card, Col, Row, Typography, Tag, Button, Spin, Empty, Popconfirm, message, Input, Space } from 'antd';
import { CalendarOutlined, TeamOutlined, UserOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { fetchExperiments, createExperiment, updateExperiment, deleteExperiment } from '../api/endpoints';
import ExperimentFormModal from '../components/ExperimentFormModal';
import type { Experiment } from '../types';

const { Title, Paragraph } = Typography;

const ExperimentListPage: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { categories, selectExperiment, selectCategory, refreshCategories } = useData();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Experiment | null>(null);
  const [search, setSearch] = useState('');

  const category = categories.find((c) => c.id === categoryId);

  const filtered = useMemo(() => {
    if (!search.trim()) return experiments;
    const q = search.toLowerCase();
    return experiments.filter(
      (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.type.toLowerCase().includes(q),
    );
  }, [experiments, search]);

  const load = async () => {
    setLoading(true);
    try { setExperiments(await fetchExperiments(categoryId)); }
    catch { /* error */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (categoryId) {
      selectCategory(categoryId);
      load();
    }
  }, [categoryId]);

  if (!category && !loading) {
    return <Empty description="未找到该实验类别" style={{ marginTop: 80 }} />;
  }

  const handleCreate = () => { setEditing(null); setModalOpen(true); };
  const handleEdit = (exp: Experiment) => { setEditing(exp); setModalOpen(true); };

  const handleOk = async (values: { categoryId?: string; name: string; description: string; type: string; date: string; owner?: string }) => {
    if (editing) {
      await updateExperiment(editing.id, values);
      message.success('实验已更新');
    } else {
      await createExperiment({ ...values, categoryId: values.categoryId || categoryId! } as { categoryId: string; name: string; description?: string; type: string; date: string; owner?: string });
      message.success('实验已创建');
    }
    setModalOpen(false);
    load();
    refreshCategories();
  };

  const handleDelete = async (id: string) => {
    await deleteExperiment(id);
    message.success('实验已删除');
    load();
    refreshCategories();
  };

  const typeLabel: Record<string, { color: string; text: string }> = {
    training: { color: 'green', text: '训练' },
    evaluation: { color: 'orange', text: '评测' },
    agent_evaluation: { color: 'purple', text: 'Agent评测' },
    other: { color: 'default', text: '其他' },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>{category?.name || '实验列表'}</Title>
          <Paragraph type="secondary">{category?.description}</Paragraph>
        </div>
        <Space>
          <Input
            placeholder="搜索实验..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建实验</Button>
        </Space>
      </div>

      {loading && experiments.length === 0 ? (
        <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          {search ? '没有匹配的实验' : '暂无实验，点击右上角创建'}
        </div>
      ) : (
        <Row gutter={[24, 24]}>
          {filtered.map((exp) => (
            <Col xs={24} sm={12} lg={8} key={exp.id}>
              <Card
                hoverable
                style={{ height: '100%', borderRadius: 8, display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, minHeight: 110 } }}
                actions={[
                  <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); handleEdit(exp); }} />,
                  <Popconfirm key="del" title="确认删除此实验?" onConfirm={(e) => { e?.stopPropagation(); handleDelete(exp.id); }} onCancel={(e) => e?.stopPropagation()}>
                    <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ]}
              >
                <div onClick={() => { selectExperiment(exp.id); navigate(`/experiment/${exp.id}`); }}>
                  <Title level={5} style={{ margin: 0 }}>{exp.name}</Title>
                  <Paragraph type="secondary" style={{ margin: '8px 0 12px' }} ellipsis={{ rows: 2 }}>
                    {exp.description}
                  </Paragraph>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <Tag icon={<CalendarOutlined />} color="default">{exp.date}</Tag>
                    <Tag icon={<TeamOutlined />} color="green">{exp.groupCount ?? 0} 个实验组</Tag>
                    {exp.owner && <Tag icon={<UserOutlined />} color="blue">{exp.owner}</Tag>}
                    <Tag color={typeLabel[exp.type]?.color || 'default'}>
                      {typeLabel[exp.type]?.text || exp.type}
                    </Tag>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <ExperimentFormModal open={modalOpen} editing={editing} categoryId={categoryId} onOk={handleOk} onCancel={() => setModalOpen(false)} />
    </div>
  );
};

export default ExperimentListPage;
