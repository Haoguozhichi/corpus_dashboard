import React, { useState } from 'react';
import { Button, message, Table, Space, Input, Switch, Popconfirm, Tag, Tabs } from 'antd';
import { InboxOutlined, PlusOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import Upload from 'antd/es/upload';
import { uploadResultsJson, createResult, deleteResult, updateResult } from '../api/endpoints';
import type { TestCase, EvaluationResult } from '../types';

const { Dragger } = Upload;

interface Props {
  groupId: string;
  testCases: TestCase[];
  existingResults: EvaluationResult[];
  onRefresh: () => void;
  isAgent?: boolean; // agent评测时显示轨迹列
}

interface ManualEntry {
  key: string;
  test_case_id?: string;
  question: string;
  expected_answer: string;
  model_response: string;
  is_correct: boolean;
  reason: string;
  annotation: string;
  think: string;
  trajectory: string;
}

let entryCounter = 0;

const ResultsUploader: React.FC<Props> = ({ groupId, testCases, existingResults, onRefresh, isAgent }) => {
  const [uploading, setUploading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [activeTab, setActiveTab] = useState('manage');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const hasResult = (tcId: string) => existingResults.some((r) => r.test_case_id === tcId);

  const initManualEntries = () => {
    const pending = testCases
      .filter((tc) => !hasResult(tc.id))
      .map((tc) => ({
        key: `tc-${tc.id}`,
        test_case_id: tc.id,
        question: tc.question,
        expected_answer: tc.expected_answer,
        model_response: '',
        is_correct: false,
        reason: '',
        trajectory: '',
      }));
    pending.push({
      key: `new-${++entryCounter}`,
      question: '',
      expected_answer: '',
      model_response: '',
      is_correct: false,
      trajectory: '',
    });
    return pending;
  };

  const toggleAddForm = () => {
    if (!showAddForm) setEntries(initManualEntries());
    else setEntries([]);
    setShowAddForm(!showAddForm);
  };

  const updateEntry = (key: string, field: keyof ManualEntry, value: string | boolean) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, [field]: value } : e)));
  };

  const addRow = () => {
    setEntries((prev) => [...prev, { key: `new-${++entryCounter}`, question: '', expected_answer: '', model_response: '', is_correct: false, reason: '', annotation: '', think: '', trajectory: '' }]);
  };

  const removeRow = (key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  };

  const handleUpload: UploadProps['customRequest'] = async ({ file }) => {
    setUploading(true);
    try {
      const result = await uploadResultsJson(groupId, file as File);
      message.success(`成功导入 ${result.imported} 条评测结果`);
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleManualSubmit = async () => {
    const valid = entries.filter((e) => e.model_response.trim() || e.question.trim());
    if (valid.length === 0) { message.warning('请至少填写一条'); return; }
    let count = 0;
    for (const entry of valid) {
      try {
        // 解析 JSON 字段
        let trajectory;
        if (isAgent && entry.trajectory.trim()) {
          try { trajectory = JSON.parse(entry.trajectory); } catch {
            message.error(`轨迹JSON格式错误，请检查: ${entry.trajectory.slice(0, 50)}...`);
            continue;
          }
        }
        if (entry.test_case_id) {
          await createResult(groupId, { test_case_id: entry.test_case_id, model_response: entry.model_response, is_correct: entry.is_correct, score: entry.is_correct ? 1 : 0, reason: entry.reason || undefined, trajectory });
        } else if (entry.question.trim()) {
          await createResult(groupId, { question: entry.question.trim(), expected_answer: entry.expected_answer.trim(), model_response: entry.model_response, is_correct: entry.is_correct, score: entry.is_correct ? 1 : 0, reason: entry.reason || undefined, trajectory });
        } else continue;
        count++;
      } catch { /* skip */ }
    }
    if (count > 0) {
      message.success(`成功录入 ${count} 条评测结果`);
      setEntries([]);
      setShowAddForm(false);
      onRefresh();
    }
  };

  const handleDeleteResult = async (id: string) => {
    try {
      await deleteResult(id);
      message.success('已删除');
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const startEdit = (record: EvaluationResult) => {
    setEditingId(record.id);
    setEditingText(record.model_response || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const saveEdit = async (id: string) => {
    try {
      await updateResult(id, { model_response: editingText });
      message.success('已保存');
      setEditingId(null);
      setEditingText('');
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const resultColumns = [
    { title: '题目', dataIndex: 'question', key: 'question', width: 200, ellipsis: true },
    { title: '标准答案', dataIndex: 'expected_answer', key: 'expected_answer', width: 160, ellipsis: true },
    {
      title: '模型回答', dataIndex: 'model_response', key: 'model_response', width: 280,
      render: (t: string, record: EvaluationResult) =>
        editingId === record.id ? (
          <Input.TextArea
            size="small"
            rows={3}
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            style={{ fontSize: 12 }}
          />
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 100, overflow: 'auto' }}>{t || <span style={{ color: '#ccc' }}>无</span>}</div>
        ),
    },
    {
      title: '结果', dataIndex: 'is_correct', key: 'is_correct', width: 64,
      render: (v: number) => v ? <Tag icon={<CheckCircleOutlined />} color="success">正确</Tag> : <Tag icon={<CloseCircleOutlined />} color="error">错误</Tag>,
    },
    {
      title: '', key: 'action', width: 80,
      render: (_: unknown, record: EvaluationResult) =>
        editingId === record.id ? (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => saveEdit(record.id)}>保存</Button>
            <Button type="link" size="small" onClick={cancelEdit}>取消</Button>
          </Space>
        ) : (
          <Space size={0}>
            <Button type="link" size="small" onClick={() => startEdit(record)}>编辑</Button>
            <Popconfirm
              title="确认删除?"
              onConfirm={() => handleDeleteResult(record.id)}
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
    },
  ];

  const addColumns = [
    {
      title: '题目 / 标准答案', key: 'info', width: 250,
      render: (_: unknown, record: ManualEntry) =>
        record.test_case_id ? (
          <div><div style={{ fontWeight: 500, marginBottom: 2, fontSize: 13 }}>{record.question}</div><div style={{ color: '#888', fontSize: 11 }}>标准: {record.expected_answer}</div></div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input size="small" placeholder="题目..." value={record.question} onChange={(e) => updateEntry(record.key, 'question', e.target.value)} />
            <Input size="small" placeholder="标准答案..." value={record.expected_answer} onChange={(e) => updateEntry(record.key, 'expected_answer', e.target.value)} />
          </Space>
        ),
    },
    {
      title: '模型回答', key: 'response', width: 280,
      render: (_: unknown, record: ManualEntry) => (
        <Input.TextArea size="small" rows={2} placeholder="模型回答..." value={record.model_response} onChange={(e) => updateEntry(record.key, 'model_response', e.target.value)} />
      ),
    },
    {
      title: '正确', key: 'correct', width: 56, align: 'center' as const,
      render: (_: unknown, record: ManualEntry) => <Switch size="small" checked={record.is_correct} onChange={(v) => updateEntry(record.key, 'is_correct', v)} />,
    },
    {
      title: '原因', key: 'reason', width: 130,
      render: (_: unknown, record: ManualEntry) => (
        <Input size="small" placeholder="判断原因..." value={record.reason} onChange={(e) => updateEntry(record.key, 'reason', e.target.value)} />
      ),
    },
    ...(isAgent ? [{
      title: '轨迹(JSON)', key: 'trajectory', width: 180,
      render: (_: unknown, record: ManualEntry) => (
        <Input.TextArea size="small" rows={2} placeholder='[{"step":1,"thought":"..."}]'
          value={record.trajectory} onChange={(e) => updateEntry(record.key, 'trajectory', e.target.value)} style={{ fontSize: 11 }} />
      ),
    }] : []),
    {
      title: '', key: 'action', width: 40,
      render: (_: unknown, record: ManualEntry) => !record.test_case_id ? <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => removeRow(record.key)} /> : null,
    },
  ];

  const pendingCount = testCases.filter((tc) => !hasResult(tc.id)).length;

  return (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      items={[
        {
          key: 'manage',
          label: `逐条管理 (${existingResults.length})`,
          children: (
            <div>
              {/* 已有结果 */}
              <div style={{ marginBottom: 8, fontWeight: 500 }}>已有评测结果</div>
              {existingResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#999', background: '#fafafa', borderRadius: 4, marginBottom: 12 }}>
                  暂无评测结果
                </div>
              ) : (
                <Table
                  dataSource={existingResults}
                  columns={resultColumns}
                  rowKey="id"
                  pagination={{ pageSize: 10, size: 'small' }}
                  size="small"
                  scroll={{ x: 800 }}
                  style={{ marginBottom: 16 }}
                />
              )}

              {/* 添加 */}
              <div style={{ marginBottom: 8, fontWeight: 500 }}>
                添加评测结果 {pendingCount > 0 && <Tag color="orange">{pendingCount} 个待录入</Tag>}
              </div>
              {!showAddForm ? (
                <Button type="dashed" icon={<PlusOutlined />} onClick={toggleAddForm} block>
                  添加评测结果
                </Button>
              ) : (
                <div>
                  <Table dataSource={entries} columns={addColumns} rowKey="key" pagination={false} size="small" scroll={{ x: 700 }} />
                  <Space style={{ marginTop: 12 }}>
                    <Button icon={<PlusOutlined />} onClick={addRow}>添加一行</Button>
                    <Button type="primary" onClick={handleManualSubmit} disabled={entries.length === 0}>提交录入</Button>
                    <Button onClick={toggleAddForm}>取消</Button>
                  </Space>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>自由添加的行提交时自动创建测试用例。</div>
                </div>
              )}
            </div>
          ),
        },
        {
          key: 'json',
          label: 'JSON 批量上传',
          children: (
            <div>
              <Dragger accept=".json" showUploadList={false} disabled={uploading} customRequest={handleUpload} style={{ marginBottom: 16 }}>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">拖拽或点击上传 JSON</p>
                <p className="ant-upload-hint">JSON 数组，每项为一个评测结果</p>
              </Dragger>
              <div style={{ fontSize: 12, color: '#888', lineHeight: 1.8, marginBottom: 8 }}>
                <div><strong>JSON 格式说明：</strong></div>
                <div>• <code>question</code> — 题目（匹配测试用例）</div>
                <div>• <code>expected_answer</code> — 标准答案</div>
                <div>• <code>model_response</code> — 模型回答</div>
                <div>• <code>is_correct</code> — true 或 false</div>
                <div style={{ marginTop: 4 }}>未匹配到测试用例的行将自动创建。</div>
              </div>
              <pre style={{ fontSize: 11, background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0 }}>{`[
  { "question": "...", "expected_answer": "...", "model_response": "...", "is_correct": true, "score": 1.0, "runtime_ms": 190, "token_count": 25 }
]`}</pre>
            </div>
          ),
        },
      ]}
    />
  );
};

export default ResultsUploader;
