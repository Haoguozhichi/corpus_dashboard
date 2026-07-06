import React, { useState } from 'react';
import { Upload, message, Alert, Table } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { uploadTestCasesJson } from '../api/endpoints';

const { Dragger } = Upload;

interface Props {
  experimentId: string;
  onSuccess: () => void;
}

const JsonUploader: React.FC<Props> = ({ experimentId, onSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      // 先读文件做预览
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      });
      let items;
      try { items = JSON.parse(text); } catch { message.error('JSON 格式错误'); setUploading(false); return false; }
      if (!Array.isArray(items)) { message.error('JSON 应为数组'); setUploading(false); return false; }

      setPreview(items.slice(0, 10));

      // 上传到后端
      const result = await uploadTestCasesJson(experimentId, file);
      message.success(`成功导入 ${result.imported} 条测试用例`);
      setPreview(null);
      onSuccess();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '上传失败');
    } finally { setUploading(false); }
    return false;
  };

  const uploadProps: UploadProps = {
    accept: '.json', showUploadList: false,
    beforeUpload: (file) => { handleUpload(file); return false; },
  };

  return (
    <div>
      <Dragger {...uploadProps} disabled={uploading}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">点击或拖拽 JSON 文件上传</p>
        <p className="ant-upload-hint">JSON 数组，每项包含 question、expected_answer</p>
      </Dragger>

      {uploading && <div style={{ textAlign: 'center', margin: '16px 0', color: '#1677ff' }}>上传中...</div>}

      {preview && (
        <div style={{ marginTop: 16 }}>
          <Alert message={`预览 (前 ${preview.length} 条)`} type="info" showIcon style={{ marginBottom: 8 }} />
          <Table
            dataSource={preview.map((item, i) => ({ ...item, _key: String(i) }))}
            columns={[
              { title: 'question', dataIndex: 'question', key: 'question', ellipsis: true },
              { title: 'expected_answer', dataIndex: 'expected_answer', key: 'expected_answer', ellipsis: true },
              { title: 'category_tag', dataIndex: 'category_tag', key: 'category_tag', width: 120 },
            ]}
            pagination={false} size="small" rowKey="_key" scroll={{ x: 600 }}
          />
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: '#888', background: '#fafafa', padding: 8, borderRadius: 4 }}>
        <strong>JSON 格式示例：</strong>
        <pre style={{ margin: '4px 0', fontSize: 11 }}>{`[
  { "question": "法国首都是哪里？", "expected_answer": "巴黎", "category_tag": "知识问答" },
  { "question": "计算 123*456", "expected_answer": "56088" }
]`}</pre>
      </div>
    </div>
  );
};

export default JsonUploader;
