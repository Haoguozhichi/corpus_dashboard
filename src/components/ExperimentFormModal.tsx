import React, { useEffect } from 'react';
import { Modal, Form, Input, DatePicker } from 'antd';
import type { Experiment } from '../types';
import dayjs from 'dayjs';

interface Props {
  open: boolean;
  editing?: Experiment | null;
  onOk: (values: { name: string; description: string; date: string; owner?: string }) => void;
  onCancel: () => void;
}

const ExperimentFormModal: React.FC<Props> = ({ open, editing, onOk, onCancel }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: editing?.name || '',
        description: editing?.description || '',
        date: editing?.date ? dayjs(editing.date) : dayjs(),
        owner: editing?.owner || '',
      });
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onOk({
      name: values.name, description: values.description,
      date: values.date.format('YYYY-MM-DD'), owner: values.owner,
    });
    form.resetFields();
  };

  return (
    <Modal title={editing ? '编辑实验' : '创建实验'} open={open} onOk={handleOk} onCancel={onCancel} destroyOnHidden width={560}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="实验名称" rules={[{ required: true }]}>
          <Input placeholder="例如：GPT系列模型指令遵循能力对比" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="owner" label="实验负责人">
          <Input placeholder="例如：张三" />
        </Form.Item>
        <Form.Item name="date" label="实验日期" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ExperimentFormModal;
