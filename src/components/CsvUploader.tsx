import React, { useState } from 'react';
import { Upload, message, Alert, Table } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { uploadTestCasesCsv } from '../api/endpoints';

const { Dragger } = Upload;

interface Props {
  experimentId: string;
  onSuccess: () => void;
}

const CsvUploader: React.FC<Props> = ({ experimentId, onSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string[][] | null>(null);

  const parseCSV = (text: string): string[][] => {
    const lines = text.trim().split('\n');
    return lines.map((line) => {
      const result: string[] = [];
      let current = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { result.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      result.push(current.trim());
      return result;
    });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    // 先解析预览
    const reader = new FileReader();
    const text = await new Promise<string>((resolve) => {
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsText(file);
    });
    const parsed = parseCSV(text);
    setPreview(parsed.slice(0, 6));

    // 上传到后端
    try {
      const result = await uploadTestCasesCsv(experimentId, file);
      message.success(`成功导入 ${result.imported} 条测试用例`);
      setPreview(null);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '上传失败';
      message.error(msg);
    } finally {
      setUploading(false);
    }
    return false;
  };

  const uploadProps: UploadProps = {
    accept: '.csv',
    showUploadList: false,
    beforeUpload: (file) => {
      handleUpload(file);
      return false;
    },
  };

  return (
    <div>
      <Dragger {...uploadProps} disabled={uploading}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">点击或拖拽 CSV 文件到此处上传</p>
        <p className="ant-upload-hint">CSV 需包含 question 和 expected_answer 列</p>
      </Dragger>

      {uploading && <div style={{ textAlign: 'center', margin: '16px 0', color: '#1677ff' }}>上传中...</div>}

      {preview && (
        <div style={{ marginTop: 16 }}>
          <Alert message={`预览 (前 ${preview.length - 1} 行)`} type="info" showIcon style={{ marginBottom: 8 }} />
          <Table
            dataSource={preview.slice(1).map((row, i) => {
              const obj: Record<string, string> = { _key: String(i) };
              preview[0].forEach((h, j) => { obj[h] = row[j] || ''; });
              return obj;
            })}
            columns={preview[0].map((h) => ({ title: h, dataIndex: h, key: h, ellipsis: true }))}
            pagination={false} size="small" rowKey="_key" scroll={{ x: 'max-content' }}
          />
        </div>
      )}
    </div>
  );
};

export default CsvUploader;
