import React, { useEffect } from 'react';
import { Modal, Form, Input } from 'antd';
import type { Category } from '../types';

interface Props {
  open: boolean;
  editing?: Category | null;
  onOk: (values: { name: string; description: string }) => void;
  onCancel: () => void;
}

const CategoryFormModal: React.FC<Props> = ({ open, editing, onOk, onCancel }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ name: editing?.name || '', description: editing?.description || '' });
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onOk(values);
    form.resetFields();
  };

  return (
    <Modal
      title={editing ? '编辑实验类别' : '创建实验类别'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="类别名称" rules={[{ required: true, message: '请输入类别名称' }]}>
          <Input placeholder="例如：大语言模型评测" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} placeholder="简要描述该类别的实验方向..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CategoryFormModal;
