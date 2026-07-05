import React, { useEffect, useState } from 'react';
import { Modal, Form, InputNumber, Tabs, Input, Button, Space, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { TrainingMetrics } from '../types';
import { saveMetrics } from '../api/endpoints';

interface Props {
  open: boolean;
  groupId: string;
  groupName: string;
  metrics?: TrainingMetrics | null;
  onSaved: () => void;
  onCancel: () => void;
}

const TrainingMetricsForm: React.FC<Props> = ({ open, groupId, groupName, metrics, onSaved, onCancel }) => {
  const [form] = Form.useForm();
  const [lossText, setLossText] = useState('');
  const [accText, setAccText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        accuracy: metrics?.accuracy ?? 0,
        precision: metrics?.precision ?? 0,
        recall: metrics?.recall ?? 0,
        f1_score: metrics?.f1_score ?? 0,
        token_count: metrics?.token_count ?? 0,
        runtime: metrics?.runtime ?? 0,
      });
      setLossText((metrics?.loss_curve || []).join(', '));
      setAccText((metrics?.accuracy_curve || []).join(', '));
    }
  }, [open, metrics, form]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const lossCurve = parseCurveText(lossText);
      const accCurve = parseCurveText(accText);

      await saveMetrics(groupId, {
        ...values,
        loss_curve: lossCurve,
        accuracy_curve: accCurve,
      });
      message.success('指标已保存');
      onSaved();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // form validation
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`管理训练指标 — ${groupName}`}
      open={open}
      onCancel={onCancel}
      width={640}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
        </Space>
      }
    >
      <Tabs items={[
        {
          key: 'metrics',
          label: '指标数值',
          children: (
            <Form form={form} layout="vertical">
              <Form.Item name="accuracy" label="准确率" rules={[{ type: 'number', min: 0, max: 1 }]}>
                <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} placeholder="0.000 ~ 1.000" />
              </Form.Item>
              <Form.Item name="precision" label="精确率 (Precision)" rules={[{ type: 'number', min: 0, max: 1 }]}>
                <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="recall" label="召回率 (Recall)" rules={[{ type: 'number', min: 0, max: 1 }]}>
                <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="f1_score" label="F1 Score" rules={[{ type: 'number', min: 0, max: 1 }]}>
                <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="token_count" label="Token 消耗">
                <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
              <Form.Item name="runtime" label="运行时间 (秒)">
                <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Form>
          ),
        },
        {
          key: 'curves',
          label: '训练曲线',
          children: (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Loss 曲线数据</div>
                <Input.TextArea
                  rows={4}
                  value={lossText}
                  onChange={(e) => setLossText(e.target.value)}
                  placeholder="用逗号分隔的数值，如: 2.1, 1.8, 1.2, 0.8, 0.5, 0.3"
                />
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  共 {parseCurveText(lossText).length} 个数据点
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Accuracy 曲线数据</div>
                <Input.TextArea
                  rows={4}
                  value={accText}
                  onChange={(e) => setAccText(e.target.value)}
                  placeholder="用逗号分隔的数值，如: 0.15, 0.32, 0.48, 0.62, 0.71, 0.76"
                />
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  共 {parseCurveText(accText).length} 个数据点（应与 Loss 数据点数量一致）
                </div>
              </div>
            </div>
          ),
        },
      ]} />
    </Modal>
  );
};

/** 解析逗号分隔的数值文本 */
function parseCurveText(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n) && isFinite(n));
}

export default TrainingMetricsForm;
