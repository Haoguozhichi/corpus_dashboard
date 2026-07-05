import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker } from 'antd';
import type { Experiment } from '../types';
import dayjs from 'dayjs';

interface Props {
  open: boolean;
  editing?: Experiment | null;
  categoryId?: string;
  onOk: (values: { categoryId?: string; name: string; description: string; type: string; date: string }) => void;
  onCancel: () => void;
}

const TYPE_OPTIONS = [
  { label: '训练实验 (Training)', value: 'training' },
  { label: '评测实验 (Evaluation)', value: 'evaluation' },
  { label: 'Agent评测 (Agent Evaluation)', value: 'agent_evaluation' },
  { label: '其他 (Other)', value: 'other' },
];

const ExperimentFormModal: React.FC<Props> = ({ open, editing, categoryId, onOk, onCancel }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: editing?.name || '',
        description: editing?.description || '',
        type: editing?.type || 'training',
        date: editing?.date ? dayjs(editing.date) : dayjs(),
      });
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onOk({
      categoryId: categoryId || editing?.category_id,
      name: values.name,
      description: values.description,
      type: values.type,
      date: values.date.format('YYYY-MM-DD'),
    });
    form.resetFields();
  };

  return (
    <Modal
      title={editing ? '编辑实验' : '创建实验'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnClose
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="实验名称" rules={[{ required: true }]}>
          <Input placeholder="例如：GPT 系列模型指令遵循能力对比" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="type" label="实验类型" rules={[{ required: true }]}>
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item name="date" label="实验日期" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ExperimentFormModal;
