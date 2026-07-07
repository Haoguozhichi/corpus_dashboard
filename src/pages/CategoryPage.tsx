import React, { useState, useMemo } from 'react';
import { Card, Col, Row, Typography, Tag, Button, Spin, Popconfirm, message, Input, Space } from 'antd';
import { ExperimentOutlined, FolderOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { createCategory, updateCategory, deleteCategory } from '../api/endpoints';
import CategoryFormModal from '../components/CategoryFormModal';
import type { Category } from '../types';

const { Title, Paragraph } = Typography;

const CategoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { categories, loading, refreshCategories, selectCategory } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [categories, search]);

  const handleCreate = () => { setEditing(null); setModalOpen(true); };
  const handleEdit = (cat: Category) => { setEditing(cat); setModalOpen(true); };

  const handleOk = async (values: { name: string; description: string }) => {
    if (editing) {
      await updateCategory(editing.id, values);
      message.success('类别已更新');
    } else {
      await createCategory(values);
      message.success('类别已创建');
    }
    setModalOpen(false);
    refreshCategories();
  };

  const handleDelete = async (id: string) => {
    await deleteCategory(id);
    message.success('类别已删除');
    refreshCategories();
  };

  const handleClick = (categoryId: string) => {
    selectCategory(categoryId);
    navigate(`/category/${categoryId}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>实验类别管理</Title>
          <Paragraph type="secondary">选择一个实验类别管理以查看其下所有实验。</Paragraph>
        </div>
        <Space>
          <Input
            placeholder="搜索类别..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建类别</Button>
        </Space>
      </div>

      {loading ? (
        <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          {search ? '没有匹配的类别' : '暂无实验类别管理，点击右上角创建'}
        </div>
      ) : (
        <Row gutter={[24, 24]}>
          {filtered.map((cat) => (
            <Col xs={24} sm={12} lg={8} key={cat.id}>
              <Card
                hoverable
                style={{ height: '100%', borderRadius: 8, display: 'flex', flexDirection: 'column' }}
                styles={{ body: { flex: 1, minHeight: 120 } }}
                actions={[
                  <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); handleEdit(cat); }} />,
                  <Popconfirm key="del" title="确认删除此类别及其下所有实验?" onConfirm={(e) => { e?.stopPropagation(); handleDelete(cat.id); }} onCancel={(e) => e?.stopPropagation()}>
                    <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>,
                ]}
              >
                <div onClick={() => handleClick(cat.id)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <FolderOutlined style={{ fontSize: 36, color: '#1677ff', marginTop: 4 }} />
                    <div style={{ flex: 1 }}>
                      <Title level={5} style={{ margin: 0 }}>{cat.name}</Title>
                      <Paragraph type="secondary" style={{ margin: '8px 0 12px' }} ellipsis={{ rows: 2 }}>
                        {cat.description}
                      </Paragraph>
                      <Tag icon={<ExperimentOutlined />} color="blue">
                        {cat.experimentCount ?? 0} 个实验
                      </Tag>
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <CategoryFormModal open={modalOpen} editing={editing} onOk={handleOk} onCancel={() => setModalOpen(false)} />
    </div>
  );
};

export default CategoryPage;
