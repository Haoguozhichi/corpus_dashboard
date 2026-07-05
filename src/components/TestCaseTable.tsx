import React, { useState } from 'react';
import { Table, Button, Input, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { TestCase } from '../types';
import { createTestCase, updateTestCase, deleteTestCase } from '../api/endpoints';

interface Props {
  experimentId: string;
  testCases: TestCase[];
  onRefresh: () => void;
}

const TestCaseTable: React.FC<Props> = ({ experimentId, testCases, onRefresh }) => {
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [newTag, setNewTag] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState('');
  const [editA, setEditA] = useState('');

  const handleAdd = async () => {
    if (!newQ.trim()) return;
    try {
      await createTestCase(experimentId, { question: newQ, expected_answer: newA, category_tag: newTag });
      message.success('测试用例已添加');
      setNewQ(''); setNewA(''); setNewTag(''); setAdding(false);
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '添加失败');
    }
  };

  const handleSave = async (id: string) => {
    try {
      await updateTestCase(id, { question: editQ, expected_answer: editA });
      message.success('已更新');
      setEditingId(null);
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTestCase(id);
      message.success('已删除');
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const startEdit = (tc: TestCase) => {
    setEditingId(tc.id);
    setEditQ(tc.question);
    setEditA(tc.expected_answer);
  };

  const columns = [
    {
      title: '题目 (Question)',
      dataIndex: 'question',
      key: 'question',
      render: (text: string, record: TestCase) =>
        editingId === record.id ? (
          <Input value={editQ} onChange={(e) => setEditQ(e.target.value)} />
        ) : (
          <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
        ),
    },
    {
      title: '标准答案 (Expected)',
      dataIndex: 'expected_answer',
      key: 'expected_answer',
      width: 220,
      render: (text: string, record: TestCase) =>
        editingId === record.id ? (
          <Input value={editA} onChange={(e) => setEditA(e.target.value)} />
        ) : (
          <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
        ),
    },
    {
      title: '标签',
      dataIndex: 'category_tag',
      key: 'category_tag',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: TestCase) =>
        editingId === record.id ? (
          <Space>
            <Button size="small" type="link" onClick={() => handleSave(record.id)}>保存</Button>
            <Button size="small" type="link" onClick={() => setEditingId(null)}>取消</Button>
          </Space>
        ) : (
          <Space>
            <Button size="small" type="link" onClick={() => startEdit(record)}>编辑</Button>
            <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record.id)}>
              <Button size="small" type="link" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Table
        dataSource={testCases}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="middle"
        bordered
        scroll={{ x: 800 }}
        footer={() =>
          adding ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input placeholder="题目" value={newQ} onChange={(e) => setNewQ(e.target.value)} />
              <Input placeholder="标准答案" value={newA} onChange={(e) => setNewA(e.target.value)} />
              <Input placeholder="标签 (可选)" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
              <Space>
                <Button type="primary" size="small" onClick={handleAdd}>确认添加</Button>
                <Button size="small" onClick={() => setAdding(false)}>取消</Button>
              </Space>
            </Space>
          ) : (
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setAdding(true)} block>
              添加测试用例
            </Button>
          )
        }
      />
    </div>
  );
};

export default TestCaseTable;
