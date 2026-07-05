import React, { useState, useCallback } from 'react';
import { Table, InputNumber, Button, Space, Popconfirm, message, Tabs, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { saveMetrics } from '../api/endpoints';
import type { ExperimentGroup, TrainingMetrics } from '../types';

interface Props {
  groups: ExperimentGroup[];
  onRefresh: () => void;
}

interface CustomMetric {
  name: string;
  values: Record<string, number>; // groupId -> value
}

interface MetricsRow {
  key: string;
  groupId: string;
  groupName: string;
  model: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  token_count: number;
  runtime: number;
  lossText: string;
  accText: string;
  customMetrics: Record<string, number>; // name -> value
  _original: TrainingMetrics | null;
}

function parseCurveText(text: string): number[] {
  return text.split(/[,\s]+/).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && isFinite(n));
}

const TrainingMetricsManager: React.FC<Props> = ({ groups, onRefresh }) => {
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [customFields, setCustomFields] = useState<string[]>([]);

  const buildRows = useCallback((): MetricsRow[] => {
    // 收集所有已有的自定义指标名
    const allCustomNames = new Set(customFields);
    groups.forEach((g) => {
      const cm = g.metrics?.custom_metrics || {};
      Object.keys(cm).forEach((k) => allCustomNames.add(k));
    });
    if (allCustomNames.size > 0 && customFields.length === 0) {
      setCustomFields(Array.from(allCustomNames));
    }

    return groups.map((g) => {
      const m = g.metrics;
      return {
        key: g.id,
        groupId: g.id,
        groupName: g.name,
        model: g.model || '',
        accuracy: m?.accuracy ?? 0,
        precision: m?.precision ?? 0,
        recall: m?.recall ?? 0,
        f1_score: m?.f1_score ?? 0,
        token_count: m?.token_count ?? 0,
        runtime: m?.runtime ?? 0,
        lossText: (m?.loss_curve || []).join(', '),
        accText: (m?.accuracy_curve || []).join(', '),
        customMetrics: m?.custom_metrics || {},
        _original: m || null,
      };
    });
  }, [groups, customFields]);

  const [rows, setRows] = useState<MetricsRow[]>(buildRows());

  React.useEffect(() => { setRows(buildRows()); }, [groups]);

  const updateCell = (groupId: string, field: keyof MetricsRow, value: number | string) => {
    setRows((prev) => prev.map((r) => (r.groupId === groupId ? { ...r, [field]: value } : r)));
  };

  const updateCustomMetric = (groupId: string, name: string, value: number) => {
    setRows((prev) => prev.map((r) => {
      if (r.groupId !== groupId) return r;
      return { ...r, customMetrics: { ...r.customMetrics, [name]: value } };
    }));
  };

  const handleSave = async (groupId: string) => {
    setSaving((prev) => ({ ...prev, [groupId]: true }));
    const row = rows.find((r) => r.groupId === groupId);
    if (!row) return;
    try {
      // 清理空的 custom metrics
      const cm: Record<string, number> = {};
      Object.entries(row.customMetrics).forEach(([k, v]) => {
        if (k.trim()) cm[k.trim()] = v;
      });
      await saveMetrics(groupId, {
        accuracy: row.accuracy,
        precision: row.precision,
        recall: row.recall,
        f1_score: row.f1_score,
        token_count: row.token_count,
        runtime: row.runtime,
        loss_curve: parseCurveText(row.lossText),
        accuracy_curve: parseCurveText(row.accText),
        custom_metrics: cm,
      });
      message.success(`${row.groupName} 指标已保存`);
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  const handleDelete = async (groupId: string) => {
    try {
      await saveMetrics(groupId, {
        accuracy: 0, precision: 0, recall: 0, f1_score: 0,
        token_count: 0, runtime: 0, loss_curve: [], accuracy_curve: [], custom_metrics: {},
      });
      message.success('指标已清零');
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  // 添加自定义指标字段
  const [newFieldName, setNewFieldName] = useState('');
  const addCustomField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    if (customFields.includes(name)) { message.warning('该字段已存在'); return; }
    setCustomFields((prev) => [...prev, name]);
    setNewFieldName('');
  };

  const removeCustomField = (name: string) => {
    setCustomFields((prev) => prev.filter((f) => f !== name));
    // 同时从所有行中移除该字段
    setRows((prev) => prev.map((r) => {
      const cm = { ...r.customMetrics };
      delete cm[name];
      return { ...r, customMetrics: cm };
    }));
  };

  const numberCell = (groupId: string, field: keyof MetricsRow, min = 0, max = 1, step = 0.001) => (
    <InputNumber
      size="small"
      min={min}
      max={max}
      step={step}
      value={(rows.find((r) => r.groupId === groupId)?.[field] as number) ?? 0}
      onChange={(v) => updateCell(groupId, field, v ?? 0)}
      style={{ width: '100%' }}
    />
  );

  // 固定列 + 自定义列
  const mainColumns = [
    { title: '实验组', dataIndex: 'groupName', key: 'groupName', width: 130, fixed: 'left' as const, render: (t: string) => <strong>{t}</strong> },
    { title: '模型', dataIndex: 'model', key: 'model', width: 150, ellipsis: true },
    { title: '准确率', key: 'accuracy', width: 90, render: (_: unknown, r: MetricsRow) => numberCell(r.groupId, 'accuracy') },
    { title: '精确率', key: 'precision', width: 90, render: (_: unknown, r: MetricsRow) => numberCell(r.groupId, 'precision') },
    { title: '召回率', key: 'recall', width: 90, render: (_: unknown, r: MetricsRow) => numberCell(r.groupId, 'recall') },
    { title: 'F1', key: 'f1_score', width: 90, render: (_: unknown, r: MetricsRow) => numberCell(r.groupId, 'f1_score') },
    ...customFields.map((name) => ({
      title: (
        <span>
          {name}
          <DeleteOutlined
            style={{ marginLeft: 4, fontSize: 11, color: '#999', cursor: 'pointer' }}
            onClick={() => removeCustomField(name)}
          />
        </span>
      ),
      key: `custom_${name}`,
      width: 100,
      render: (_: unknown, r: MetricsRow) => (
        <InputNumber
          size="small"
          min={0}
          step={0.001}
          value={r.customMetrics[name] ?? 0}
          onChange={(v) => updateCustomMetric(r.groupId, name, v ?? 0)}
          style={{ width: '100%' }}
        />
      ),
    })),
    { title: 'Token', key: 'token_count', width: 80, render: (_: unknown, r: MetricsRow) => (
      <InputNumber size="small" min={0} step={1} value={r.token_count} onChange={(v) => updateCell(r.groupId, 'token_count', v ?? 0)} style={{ width: '100%' }} />
    )},
    { title: '运行(s)', key: 'runtime', width: 80, render: (_: unknown, r: MetricsRow) => (
      <InputNumber size="small" min={0} step={1} value={r.runtime} onChange={(v) => updateCell(r.groupId, 'runtime', v ?? 0)} style={{ width: '100%' }} />
    )},
    {
      title: '操作', key: 'action', width: 110, fixed: 'right' as const,
      render: (_: unknown, r: MetricsRow) => (
        <Space size={0}>
          <Button type="link" size="small" loading={saving[r.groupId]} onClick={() => handleSave(r.groupId)}>保存</Button>
          <Popconfirm title="清零该组指标?" onConfirm={() => handleDelete(r.groupId)} getPopupContainer={(t) => t.parentElement || document.body}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const curveColumns = [
    { title: '实验组', dataIndex: 'groupName', key: 'groupName', width: 120, render: (t: string) => <strong>{t}</strong> },
    {
      title: 'Loss 曲线', key: 'loss', width: 300,
      render: (_: unknown, r: MetricsRow) => (
        <div>
          <Input.TextArea size="small" rows={3} value={r.lossText}
            onChange={(e) => updateCell(r.groupId, 'lossText', e.target.value)}
            placeholder="逗号分隔: 2.1, 1.8, 1.2, ..." style={{ fontSize: 12 }} />
          <div style={{ fontSize: 11, color: '#888' }}>{parseCurveText(r.lossText).length} 个点</div>
        </div>
      ),
    },
    {
      title: 'Acc 曲线', key: 'acc', width: 300,
      render: (_: unknown, r: MetricsRow) => (
        <div>
          <Input.TextArea size="small" rows={3} value={r.accText}
            onChange={(e) => updateCell(r.groupId, 'accText', e.target.value)}
            placeholder="逗号分隔: 0.15, 0.32, 0.48, ..." style={{ fontSize: 12 }} />
          <div style={{ fontSize: 11, color: '#888' }}>{parseCurveText(r.accText).length} 个点</div>
        </div>
      ),
    },
    {
      title: '', key: 'act', width: 60,
      render: (_: unknown, r: MetricsRow) => (
        <Button type="link" size="small" loading={saving[r.groupId]} onClick={() => handleSave(r.groupId)}>保存</Button>
      ),
    },
  ];

  return (
    <Tabs items={[
      {
        key: 'metrics',
        label: '指标数值',
        children: (
          <div>
            {/* 自定义指标字段管理 */}
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 4 }}>
              <span style={{ fontWeight: 500, marginRight: 12 }}>自定义指标:</span>
              <Space>
                <Input
                  size="small"
                  placeholder="指标名称 (如 BLEU)"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  onPressEnter={addCustomField}
                  style={{ width: 160 }}
                />
                <Button size="small" icon={<PlusOutlined />} onClick={addCustomField}>添加</Button>
              </Space>
              {customFields.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
                  已添加: {customFields.join(', ')}（点击列标题上的 × 可删除）
                </div>
              )}
            </div>

            <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>
              直接编辑数值，点击「保存」提交修改。
            </div>
            <Table dataSource={rows} columns={mainColumns} rowKey="key"
              pagination={false} size="small" scroll={{ x: 800 + customFields.length * 100 }} />
          </div>
        ),
      },
      {
        key: 'curves',
        label: '训练曲线',
        children: (
          <div>
            <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>
              粘贴逗号分隔的数值序列。保存后可在详情页和对比分析中查看折线图。
            </div>
            <Table dataSource={rows} columns={curveColumns} rowKey="key"
              pagination={false} size="small" scroll={{ x: 800 }} />
          </div>
        ),
      },
    ]} />
  );
};

export default TrainingMetricsManager;
