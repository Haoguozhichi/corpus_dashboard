import React, { useState } from 'react';
import { Button, message, Table, Input, Popconfirm, Select } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { batchResults } from '../api/endpoints';
import type { TestCase, EvaluationResult } from '../types';

interface Props {
  groupId: string;
  testCases: TestCase[];
  existingResults: EvaluationResult[];
  onRefresh: () => void;
  onClose: () => void;
  isAgent?: boolean;
}

const STD_KEYS = new Set([
  'id', 'group_id', 'test_case_id',
  'question', 'expected_answer', 'category_tag',
  'model_response', 'is_correct', 'runtime_ms', 'token_count',
  'reason', 'annotation', 'think', 'ai_scores', 'traj_diagnosis', 'trajectory',
  'sub_category', 'case_id', 'key',
]);

interface EditRow { _id: string; _isNew: boolean; _deleted: boolean; [key: string]: any; }

let rowCounter = 0;

const ResultsUploader: React.FC<Props> = ({ groupId, testCases, existingResults, onRefresh, onClose, isAgent }) => {
  // 初始化：从 existingResults 提取数据和自定义列
  const [editData, setEditData] = useState<Record<string, EditRow>>(() => {
    const data: Record<string, EditRow> = {};
    existingResults.forEach((r) => {
      data[r.id] = {
        _id: r.id, _isNew: false, _deleted: false,
        question: r.question || '',
        expected_answer: r.expected_answer || '',
        model_response: r.model_response || '',
        is_correct: r.is_correct ? '正确' : '错误',
        runtime_ms: String(r.runtime_ms ?? ''),
        token_count: String(r.token_count ?? ''),
        reason: r.reason || '',
        annotation: r.annotation || '',
        think: r.think || '',
        trajectory: r.trajectory ? JSON.stringify(r.trajectory) : '',
      };
      // 自定义字段
      Object.keys(r).forEach((k) => {
        if (!STD_KEYS.has(k)) data[r.id][k] = r[k] !== undefined ? String(r[k]) : '';
      });
    });
    return data;
  });
  const [editOrder, setEditOrder] = useState<string[]>(() => existingResults.map((r) => r.id));
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [customCols, setCustomCols] = useState<string[]>(() => {
    const keys = new Set<string>();
    existingResults.forEach((r) => Object.keys(r).forEach((k) => { if (!STD_KEYS.has(k) && r[k] != null) keys.add(k); }));
    return [...keys];
  });
  const [deletedCols, setDeletedCols] = useState<string[]>([]);
  const [newCols, setNewCols] = useState<Set<string>>(new Set());

  const setCell = (id: string, key: string, value: string) => {
    setEditData((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const addRow = () => {
    const newId = `__new_${++rowCounter}`;
    const row: EditRow = { _id: newId, _isNew: true, _deleted: false,
      question: '', expected_answer: '', model_response: '', is_correct: '错误',
      runtime_ms: '', token_count: '', reason: '', annotation: '', think: '', trajectory: '' };
    setEditData((prev) => ({ ...prev, [newId]: row }));
    setEditOrder((prev) => [...prev, newId]);
  };

  const deleteRow = (id: string) => {
    if (id.startsWith('__new_')) {
      setEditOrder((prev) => prev.filter((i) => i !== id));
    } else {
      setDeletedIds((prev) => new Set(prev).add(id));
    }
  };

  const restoreRow = (id: string) => {
    setDeletedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  // 列管理：与 DashboardPage 完全一致
  const addCustomCol = () => {
    setCustomCols((prev) => [...prev, '']);
    setNewCols((prev) => new Set(prev).add(''));
  };
  const updateCustomColName = (idx: number, name: string) => {
    const oldName = customCols[idx];
    setCustomCols((prev) => prev.map((k, i) => i === idx ? name : k));
    if (name.trim()) {
      setNewCols((prev) => { const next = new Set(prev); if (oldName) next.delete(oldName); next.add(name.trim()); return next; });
    }
  };
  const deleteCustomCol = (idx: number) => {
    const oldName = customCols[idx];
    setCustomCols((prev) => prev.filter((_, i) => i !== idx));
    setDeletedCols((prev) => [...prev, oldName]);
    setEditData((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const row = { ...next[id] };
        delete row[oldName];
        next[id] = row;
      }
      return next;
    });
  };

  const handleSave = async () => {
    // 检查是否有未命名的列
    const unnamed = customCols.some((k) => !k.trim());
    if (unnamed) { message.warning('请先为所有列填写列名，或删除不需要的列'); return; }

    const deletes: string[] = [...deletedIds];
    const updates: Record<string, unknown>[] = [];
    const creates: Record<string, unknown>[] = [];

    // 收集更新
    for (const id of editOrder) {
      const row = editData[id]; if (!row || row._isNew || deletedIds.has(id)) continue;
      const up: Record<string, unknown> = { id };
      if (row.model_response !== undefined) up.model_response = row.model_response;
      up.is_correct = row.is_correct === '正确';
      up.runtime_ms = Number(row.runtime_ms) || 0;
      up.token_count = Number(row.token_count) || 0;
      if (row.reason) up.reason = row.reason;
      if (row.annotation) up.annotation = row.annotation;
      if (!isAgent && row.think) up.think = row.think;
      if (isAgent && row.trajectory) { try { up.trajectory = JSON.parse(row.trajectory); } catch { /* keep old */ } }
      customCols.forEach((k) => {
        const key = k.trim(); if (!key) return;
        if (newCols.has(key)) { up[key] = row[k] ?? ''; }
        else if (row[k] !== undefined && row[k] !== '') { up[key] = row[k]; }
      });
      deletedCols.forEach((k) => { up[k] = null; });
      updates.push(up);
    }

    // 收集新建
    for (const id of editOrder) {
      const row = editData[id]; if (!row || !row._isNew) continue;
      if (!row.question?.trim() && !row.model_response?.trim()) continue;
      const data: Record<string, unknown> = {
        question: row.question?.trim() || undefined,
        expected_answer: row.expected_answer?.trim() || undefined,
        model_response: row.model_response || '',
        is_correct: row.is_correct === '正确',
        runtime_ms: Number(row.runtime_ms) || 0,
        token_count: Number(row.token_count) || 0,
        reason: row.reason || undefined,
        annotation: row.annotation || undefined,
        ...(!isAgent ? { think: row.think || undefined } : {}),
      };
      if (isAgent && row.trajectory?.trim()) { try { data.trajectory = JSON.parse(row.trajectory); } catch { /* ignore */ } }
      customCols.forEach((k) => { const key = k.trim(); if (key) data[key] = row[k] ?? ''; });
      creates.push(data);
    }

    if (deletes.length > 0 || updates.length > 0 || creates.length > 0) {
      await batchResults(groupId, { deletes, updates, creates });
    }
    message.success('已保存');
    try { await onRefresh(); } catch { /* ignore */ }
    onClose();
  };

  const rows = editOrder.map((id) => editData[id]).filter(Boolean);
  const editColumns = [
    { title: '#', width: 36, align: 'center' as const, render: (_: any, __: any, idx: number) => idx + 1 },
    { title: '题目', key: 'question', width: 130,
      render: (_: any, r: any) => <Input size="small" value={r.question} onChange={(e) => setCell(r._id, 'question', e.target.value)} disabled={deletedIds.has(r._id)} placeholder="题目" /> },
    { title: '标准答案', key: 'expected_answer', width: 120,
      render: (_: any, r: any) => <Input size="small" value={r.expected_answer} onChange={(e) => setCell(r._id, 'expected_answer', e.target.value)} disabled={deletedIds.has(r._id)} placeholder="标准答案" /> },
    { title: '模型回答', key: 'model_response', width: 200,
      render: (_: any, r: any) => <Input.TextArea size="small" rows={1} value={r.model_response} onChange={(e) => setCell(r._id, 'model_response', e.target.value)} disabled={deletedIds.has(r._id)} placeholder="模型回答" style={{ fontSize: 12 }} /> },
    ...customCols.map((colName, ci) => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Input size="small" value={colName} onChange={(e) => updateCustomColName(ci, e.target.value)} placeholder="变量名" style={{ width: 80, fontWeight: 500 }} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteCustomCol(ci)} />
        </div>
      ),
      key: colName || `cc_${ci}`,
      width: 150,
      render: (_: any, r: any) => <Input size="small" value={r[colName] || ''} onChange={(e) => setCell(r._id, colName, e.target.value)} disabled={deletedIds.has(r._id)} placeholder="..." />,
    })),
    { title: '结果', key: 'is_correct', width: 80,
      render: (_: any, r: any) => <Select size="small" value={r.is_correct} onChange={(v) => setCell(r._id, 'is_correct', v)} disabled={deletedIds.has(r._id)} style={{ width: '100%' }}
        options={[{ label: '✅ 正确', value: '正确' }, { label: '❌ 错误', value: '错误' }]} /> },
    { title: '耗时(ms)', key: 'runtime_ms', width: 85,
      render: (_: any, r: any) => <Input size="small" value={r.runtime_ms} onChange={(e) => setCell(r._id, 'runtime_ms', e.target.value)} disabled={deletedIds.has(r._id)} placeholder="0" /> },
    { title: 'Token', key: 'token_count', width: 75,
      render: (_: any, r: any) => <Input size="small" value={r.token_count} onChange={(e) => setCell(r._id, 'token_count', e.target.value)} disabled={deletedIds.has(r._id)} placeholder="0" /> },
    { title: '原因', key: 'reason', width: 120,
      render: (_: any, r: any) => <Input size="small" value={r.reason} onChange={(e) => setCell(r._id, 'reason', e.target.value)} disabled={deletedIds.has(r._id)} placeholder="原因" /> },
    { title: '标注', key: 'annotation', width: 110,
      render: (_: any, r: any) => <Input size="small" value={r.annotation} onChange={(e) => setCell(r._id, 'annotation', e.target.value)} disabled={deletedIds.has(r._id)} placeholder="标注" /> },
    ...(!isAgent ? [{ title: 'Think', key: 'think', width: 110,
      render: (_: any, r: any) => <Input size="small" value={r.think} onChange={(e) => setCell(r._id, 'think', e.target.value)} disabled={deletedIds.has(r._id)} placeholder="Think" /> }] : []),
    ...(isAgent ? [{ title: '轨迹(JSON)', key: 'trajectory', width: 150,
      render: (_: any, r: any) => <Input.TextArea size="small" rows={1} value={r.trajectory} onChange={(e) => setCell(r._id, 'trajectory', e.target.value)} disabled={deletedIds.has(r._id)} placeholder='[{"step":1}]' style={{ fontSize: 11 }} /> }] : []),
    { title: '操作', key: 'action', width: 55, align: 'center' as const,
      render: (_: any, r: any) => deletedIds.has(r._id)
        ? <Button type="link" size="small" onClick={() => restoreRow(r._id)}>恢复</Button>
        : <Button type="link" size="small" danger onClick={() => deleteRow(r._id)}>删除</Button> },
  ];

  return (
    <div>
      <Table dataSource={rows} columns={editColumns} rowKey="_id" pagination={{ pageSize: 20, size: 'small' }} size="small"
        scroll={{ x: 1100 + customCols.length * 140 }} locale={{ emptyText: '暂无评测结果，点击下方按钮添加' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button type="dashed" onClick={addRow} icon={<PlusOutlined />} style={{ flex: 1 }}>添加行</Button>
        <Button type="dashed" onClick={addCustomCol} icon={<PlusOutlined />} style={{ flex: 1 }}>添加列</Button>
        <Button type="primary" onClick={handleSave}>保存全部</Button>
      </div>
    </div>
  );
};

export default ResultsUploader;
