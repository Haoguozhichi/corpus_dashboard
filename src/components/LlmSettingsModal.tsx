import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { getLlmConfig, saveLlmConfig, testLlmConnection } from '../api/endpoints';

interface Props {
  open: boolean;
  onCancel: () => void;
  onSaved: () => void;
}

const LlmSettingsModal: React.FC<Props> = ({ open, onCancel, onSaved }) => {
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      getLlmConfig().then((cfg) => {
        form.setFieldsValue({ apiUrl: cfg.apiUrl, modelName: cfg.modelName, apiKey: cfg.apiKey || '' });
      }).catch(() => {});
    }
  }, [open, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    await saveLlmConfig(values);
    message.success('LLM 配置已保存');
    onSaved();
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const values = form.getFieldsValue();
      const res = await testLlmConnection(values);
      if (res.success) {
        message.success(`连接成功！模型: ${res.message || ''}`);
      } else {
        message.error(res.error || '连接失败');
      }
    } catch (err: unknown) {
      message.error(`连接失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal title="LLM 模型配置" open={open} onCancel={onCancel} footer={null} width={500}>
      <Form form={form} layout="vertical">
        <Form.Item name="apiUrl" label="API 地址" rules={[{ required: true }]}>
          <Input placeholder="https://api.deepseek.com/v1/chat/completions" />
        </Form.Item>
        <Form.Item name="modelName" label="模型名称" rules={[{ required: true }]}>
          <Input placeholder="gpt-4o" />
        </Form.Item>
        <Form.Item name="apiKey" label="API Key">
          <Input.Password placeholder="sk-..." />
        </Form.Item>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={handleTest} loading={testing}>测试连接</Button>
          <Button type="primary" onClick={handleSave}>保存配置</Button>
        </div>
      </Form>
    </Modal>
  );
};

export default LlmSettingsModal;
