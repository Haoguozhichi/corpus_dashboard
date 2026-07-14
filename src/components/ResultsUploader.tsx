import React, { useState, useMemo } from 'react';
import { Button, message, Table, Space, Input, Popconfirm, Tag, Tabs, Select } from 'antd';
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
  isAgent?: boolean;
}

// 标准字段（不是自定义列）
const STD_KEYS = new Set([
  'id', 'group_id', 'group_id', 'test_case_id', 'group_id',
  'question', 'expected_answer', 'category_tag',
  'model_response', 'is_correct', 'runtime_ms', 'token_count',
  'reason', 'annotation', 'think', 'ai_scores', 'traj_diagnosis', 'trajectory',
  'sub_category', 'custom_scores', 'case_id',
]);

interface EditRow {
  _id: string;        // result id (empty for new)
  _isNew: boolean;
  _deleted: boolean;
  [key: string]: any;
}

let rowCounter = 0;

const ResultsUploader: React.FC<Props> = ({ groupId, testCases, existingResults, onRefresh, isAgent }) => {
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('manage');
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [customCols, setCustomCols] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  // 初始化编辑数据
  const initEditData = () => {
    if (initialized) return;
    // 收集所有自定义字段名
    const extraKeys = new Set<string>();
    existingResults.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (!STD_KEYS.has(k) && k !== 'key') extraKeys.add(k);
      });
    });
    const cols = [...extraKeys];
    setCustomCols(cols);

    // 构建编辑行
    const rows: EditRow[] = existingResults.map((r) => {
      const row: EditRow = { _id: r.id, _isNew: false, _deleted: false };
      // 标准字段
      row.question = r.question || '';
      row.expected_answer = r.expected_answer || '';
      row.model_response = r.model_response || '';
      row.is_correct = r.is_correct ? '正确' : '错误';
      row.runtime_ms = String(r.runtime_ms ?? '');
      row.token_count = String(r.token_count ?? '');
      row.reason = r.reason || '';
      row.annotation = r.annotation || '';
      row.think = r.think || '';
      row.trajectory = r.trajectory ? JSON.stringify(r.trajectory) : '';
      // 自定义字段
      cols.forEach((k) => { row[k] = r[k] !== undefined ? String(r[k]) : ''; });
      return row;
    });
    setEditRows(rows);
    setInitialized(true);
  };

  // 打开 tab 时初始化
  useMemo(() => { if (activeTab === 'manage') initEditData(); }, [activeTab, existingResults]);

  const setCell = (rowIdx: number, key: string, value: string) => {
    setEditRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r));
  };

  const addRow = () => {
    const newRow: EditRow = { _id: `__new_${++rowCounter}`, _isNew: true, _deleted: false, question: '', expected_answer: '', model_response: '', is_correct: '错误', score: '', runtime_ms: '', token_count: '', reason: '', annotation: '', think: '', trajectory: '' };
    customCols.forEach((k) => { newRow[k] = ''; });
    setEditRows((prev) => [...prev, newRow]);
  };

  const deleteRow = (idx: number) => {
    setEditRows((prev) => {
      const row = prev[idx];
      if (row._isNew) return prev.filter((_, i) => i !== idx);
      return prev.map((r, i) => i === idx ? { ...r, _deleted: true } : r);
    });
  };

  const restoreRow = (idx: number) => {
    setEditRows((prev) => prev.map((r, i) => i === idx ? { ...r, _deleted: false } : r));
  };

  const addCustomCol = () => {
    setCustomCols((prev) => [...prev, '']);
    // 所有现有行添加空值
    setEditRows((prev) => prev.map((r) => ({ ...r, '': '' })));
  };

  const updateCustomColName = (idx: number, newName: string) => {
    const oldName = customCols[idx];
    setCustomCols((prev) => prev.map((k, i) => i === idx ? newName : k));
    // 迁移旧 key 的值到新 key
    if (oldName && newName && oldName !== newName) {
      setEditRows((prev) => prev.map((r) => {
        const val = r[oldName] ?? '';
        const updated = { ...r, [newName]: val };
        delete updated[oldName];
        return updated;
      }));
    }
  };

  const deleteCustomCol = (idx: number) => {
    const oldName = customCols[idx];
    setCustomCols((prev) => prev.filter((_, i) => i !== idx));
    if (oldName) {
      setEditRows((prev) => prev.map((r) => {
        const updated = { ...r };
        delete updated[oldName];
        return updated;
      }));
    }
  };

  const handleSave = async () => {
    for (const row of editRows) {
      if (row._isNew) {
        // 新建
        if (!row.question?.trim() && !row.model_response?.trim()) continue;
        const extra: Record<string, any> = {};
        customCols.forEach((k) => { if (k.trim() && row[k] !== '' && row[k] !== undefined) extra[k.trim()] = row[k]; });
        const isCorrect = row.is_correct === '正确';
        let trajectory;
        if (isAgent && row.trajectory?.trim()) {
          try { trajectory = JSON.parse(row.trajectory); } catch { /* ignore */ }
        }
        await createResult(groupId, {
          question: row.question?.trim() || undefined,
          expected_answer: row.expected_answer?.trim() || undefined,
          model_response: row.model_response || '',
          is_correct: isCorrect,
          runtime_ms: Number(row.runtime_ms) || 0,
          token_count: Number(row.token_count) || 0,
          reason: row.reason || undefined,
          trajectory,
          ...extra,
        } as any);
      } else if (!row._deleted) {
        // 更新
        const updates: Record<string, any> = {
          model_response: row.model_response,
          is_correct: row.is_correct === '正确',
          runtime_ms: Number(row.runtime_ms) || 0,
          token_count: Number(row.token_count) || 0,
          reason: row.reason || undefined,
          annotation: row.annotation || undefined,
          think: row.think || undefined,
        };
        customCols.forEach((k) => { if (k.trim()) updates[k.trim()] = row[k] || undefined; });
        if (isAgent && row.trajectory) {
          try { updates.trajectory = JSON.parse(row.trajectory); } catch { /* keep old */ }
        }
        await updateResult(row._id, updates as any);
      }
    }
    // 删除被标记的
    for (const row of editRows) {
      if (!row._isNew && row._deleted) {
        await deleteResult(row._id);
      }
    }
    message.success('已保存');
    setInitialized(false);
    onRefresh();
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

  const allColKeys = ['question', 'expected_answer', 'model_response', 'is_correct', 'runtime_ms', 'token_count', 'reason', 'annotation', 'think', ...(isAgent ? ['trajectory'] : []), ...customCols];

  const editColumns = [
    { title: '#', width: 36, align: 'center' as const, render: (_: any, __: any, idx: number) => idx + 1 },
    { title: '题目', key: 'question', width: 140,
      render: (_: any, r: any, idx: number) => (
        <Input size="small" value={r.question} onChange={(e) => setCell(idx, 'question', e.target.value)} disabled={r._deleted} placeholder="题目" />
      ),
    },
    { title: '标准答案', key: 'expected_answer', width: 130,
      render: (_: any, r: any, idx: number) => (
        <Input size="small" value={r.expected_answer} onChange={(e) => setCell(idx, 'expected_answer', e.target.value)} disabled={r._deleted} placeholder="标准答案" />
      ),
    },
    { title: '模型回答', key: 'model_response', width: 220,
      render: (_: any, r: any, idx: number) => (
        <Input.TextArea size="small" rows={1} value={r.model_response} onChange={(e) => setCell(idx, 'model_response', e.target.value)} disabled={r._deleted} placeholder="模型回答" style={{ fontSize: 12 }} />
      ),
    },
    // 自定义字段列（与详情页一致：在模型回答和结果之间）
    ...customCols.map((colName, ci) => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Input size="small" value={colName} onChange={(e) => updateCustomColName(ci, e.target.value)} placeholder="字段名" style={{ width: 80, fontWeight: 500 }} />
          <Popconfirm title="删除此列？所有行的该字段数据将被移除" onConfirm={() => deleteCustomCol(ci)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
      key: `custom_${ci}`,
      width: 160,
      render: (_: any, r: any, idx: number) => (
        <Input size="small" value={r[colName] || ''} onChange={(e) => setCell(idx, colName, e.target.value)} disabled={r._deleted} placeholder="..." />
      ),
    })),
    { title: '结果', key: 'is_correct', width: 80,
      render: (_: any, r: any, idx: number) => (
        <Select size="small" value={r.is_correct} onChange={(v) => setCell(idx, 'is_correct', v)} disabled={r._deleted} style={{ width: '100%' }}
          options={[{ label: '✅ 正确', value: '正确' }, { label: '❌ 错误', value: '错误' }]} />
      ),
    },
    { title: '耗时(ms)', key: 'runtime_ms', width: 90,
      render: (_: any, r: any, idx: number) => (
        <Input size="small" value={r.runtime_ms} onChange={(e) => setCell(idx, 'runtime_ms', e.target.value)} disabled={r._deleted} placeholder="0" />
      ),
    },
    { title: 'Token', key: 'token_count', width: 80,
      render: (_: any, r: any, idx: number) => (
        <Input size="small" value={r.token_count} onChange={(e) => setCell(idx, 'token_count', e.target.value)} disabled={r._deleted} placeholder="0" />
      ),
    },
    { title: '原因', key: 'reason', width: 130,
      render: (_: any, r: any, idx: number) => (
        <Input size="small" value={r.reason} onChange={(e) => setCell(idx, 'reason', e.target.value)} disabled={r._deleted} placeholder="原因" />
      ),
    },
    { title: '标注', key: 'annotation', width: 120,
      render: (_: any, r: any, idx: number) => (
        <Input size="small" value={r.annotation} onChange={(e) => setCell(idx, 'annotation', e.target.value)} disabled={r._deleted} placeholder="标注" />
      ),
    },
    { title: 'Think', key: 'think', width: 120,
      render: (_: any, r: any, idx: number) => (
        <Input size="small" value={r.think} onChange={(e) => setCell(idx, 'think', e.target.value)} disabled={r._deleted} placeholder="Think" />
      ),
    },
    ...(isAgent ? [{
      title: '轨迹(JSON)', key: 'trajectory', width: 160,
      render: (_: any, r: any, idx: number) => (
        <Input.TextArea size="small" rows={1} value={r.trajectory} onChange={(e) => setCell(idx, 'trajectory', e.target.value)} disabled={r._deleted} placeholder='[{"step":1}]' style={{ fontSize: 11 }} />
      ),
    }] : []),
    {
      title: '操作', key: 'action', width: 60, align: 'center' as const, fixed: 'right' as const,
      render: (_: any, r: any, idx: number) => (
        r._deleted ? (
          <Button type="link" size="small" onClick={() => restoreRow(idx)}>恢复</Button>
        ) : (
          <Button type="link" size="small" danger onClick={() => deleteRow(idx)}>删除</Button>
        )
      ),
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={(key) => { setActiveTab(key); if (key !== 'manage') setInitialized(false); }}
      destroyInactiveTabPane
      items={[
        {
          key: 'manage',
          label: `逐条管理 (${existingResults.length})`,
          children: (
            <div>
              <Table
                dataSource={editRows}
                columns={editColumns}
                rowClassName={(r: any) => r._deleted ? 'ant-table-row-hidden' : ''}
                rowKey="_id"
                pagination={{ pageSize: 20, size: 'small' }}
                size="small"
                scroll={{ x: 1200 + customCols.length * 130 }}
                locale={{ emptyText: '暂无评测结果，点击下方按钮添加' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Button type="dashed" onClick={addRow} icon={<PlusOutlined />} style={{ flex: 1 }}>添加行</Button>
                <Button type="dashed" onClick={addCustomCol} icon={<PlusOutlined />} style={{ flex: 1 }}>添加列</Button>
                <Button type="primary" onClick={handleSave}>保存全部</Button>
              </div>
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
