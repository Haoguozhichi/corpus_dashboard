import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, message, Tabs } from 'antd';
import { getLlmConfig, saveLlmConfig, testLlmConnection, getLlmPrompts, saveLlmPrompts } from '../api/endpoints';

interface Props {
  open: boolean;
  onCancel: () => void;
  onSaved: () => void;
}

const LlmSettingsModal: React.FC<Props> = ({ open, onCancel, onSaved }) => {
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [prompts, setPrompts] = useState({ diagnoseError: '', clusterErrors: '' });
  const [savingPrompts, setSavingPrompts] = useState(false);

  useEffect(() => {
    if (open) {
      getLlmConfig().then((cfg) => {
        form.setFieldsValue({ apiUrl: cfg.apiUrl, modelName: cfg.modelName, apiKey: cfg.apiKey || '' });
      }).catch(() => {});
      getLlmPrompts().then((p) => setPrompts({
        diagnoseError: p.diagnoseError || '',
        clusterErrors: p.clusterErrors || '',
      })).catch(() => {});
    }
  }, [open, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    await saveLlmConfig(values);
    message.success('LLM 配置已保存');
    onSaved();
  };

  const handleSavePrompts = async () => {
    setSavingPrompts(true);
    try {
      await saveLlmPrompts(prompts);
      message.success('Prompt 已保存');
    } catch { message.error('保存失败'); }
    finally { setSavingPrompts(false); }
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
    <Modal title="LLM 模型配置" open={open} onCancel={onCancel} footer={null} width={700}>
      <Tabs items={[
        {
          key: 'basic',
          label: '基本配置',
          children: (
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
          ),
        },
        {
          key: 'prompts',
          label: 'Prompt 编辑',
          children: (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>AI 错误诊断 Prompt</div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  变量：{'{question}'} {'{expectedAnswer}'} {'{modelResponse}'}
                </div>
                <Input.TextArea
                  rows={8}
                  value={prompts.diagnoseError}
                  onChange={(e) => setPrompts((p) => ({ ...p, diagnoseError: e.target.value }))}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>AI 错误聚类 Prompt</div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  变量：{'{count}'} {'{casesText}'}
                </div>
                <Input.TextArea
                  rows={8}
                  value={prompts.clusterErrors}
                  onChange={(e) => setPrompts((p) => ({ ...p, clusterErrors: e.target.value }))}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
              <Button type="primary" onClick={handleSavePrompts} loading={savingPrompts}>保存 Prompt</Button>
            </div>
          ),
        },
      ]} />
    </Modal>
  );
};

export default LlmSettingsModal;
