import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { getLlmConfig, saveLlmConfig } from '../api/endpoints';

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
        form.setFieldsValue({ apiUrl: cfg.apiUrl, modelName: cfg.modelName });
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
      const url = form.getFieldValue('apiUrl');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: form.getFieldValue('modelName'),
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        }),
      });
      if (res.ok) {
        message.success('连接成功！');
      } else {
        const err = await res.text();
        message.error(`连接失败: ${err.slice(0, 200)}`);
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
          <Input placeholder="http://localhost:8000/v1/chat/completions" />
        </Form.Item>
        <Form.Item name="modelName" label="模型名称" rules={[{ required: true }]}>
          <Input placeholder="gpt-4o" />
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
