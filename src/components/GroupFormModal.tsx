import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ExperimentGroup } from '../types';

interface Props {
  open: boolean;
  editing?: ExperimentGroup | null;
  onOk: (values: { name: string; model: string; parameters: Record<string, string | number> }) => void;
  onCancel: () => void;
}

const GroupFormModal: React.FC<Props> = ({ open, editing, onOk, onCancel }) => {
  const [form] = Form.useForm();
  const [params, setParams] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: editing?.name || '',
        model: editing?.model || '',
      });
      const p = editing?.parameters || {};
      const entries = Object.entries(p).map(([key, value]) => ({ key, value: String(value) }));
      setParams(entries.length > 0 ? entries : [{ key: '', value: '' }]);
    }
  }, [open, editing, form]);

  const addParam = () => setParams([...params, { key: '', value: '' }]);
  const removeParam = (index: number) => setParams(params.filter((_, i) => i !== index));
  const updateParam = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...params];
    next[index] = { ...next[index], [field]: val };
    setParams(next);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    const parameters: Record<string, string | number> = {};
    params.forEach(({ key, value }) => {
      if (key.trim()) parameters[key.trim()] = isNaN(Number(value)) ? value : Number(value);
    });
    onOk({ name: values.name, model: values.model, parameters });
    form.resetFields();
    setParams([{ key: '', value: '' }]);
  };

  return (
    <Modal
      title={editing ? '编辑实验组' : '创建实验组'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnClose
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="实验组名称" rules={[{ required: true }]}>
          <Input placeholder="例如：GPT-4o" />
        </Form.Item>
        <Form.Item name="model" label="模型">
          <Input placeholder="例如：gpt-4o-2024-05-13" />
        </Form.Item>
        <Form.Item label="变量">
          {params.map((p, i) => (
            <Space key={i} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
              <Input
                placeholder="变量名"
                value={p.key}
                onChange={(e) => updateParam(i, 'key', e.target.value)}
                style={{ width: 160 }}
              />
              <Input
                placeholder="变量值"
                value={p.value}
                onChange={(e) => updateParam(i, 'value', e.target.value)}
                style={{ width: 200 }}
              />
              <Button icon={<DeleteOutlined />} size="small" danger onClick={() => removeParam(i)} disabled={params.length <= 1} />
            </Space>
          ))}
          <Button type="dashed" onClick={addParam} icon={<PlusOutlined />} block>
            添加变量
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default GroupFormModal;
