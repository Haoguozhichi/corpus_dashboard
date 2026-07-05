import React, { useState } from 'react';
import { Upload, Button, message, Alert, Table } from 'antd';
import { UploadOutlined, InboxOutlined } from '@ant-design/icons';
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

  const handleBeforeUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.trim().split('\n');
      const parsed = lines.slice(0, 6).map((line) => {
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
      setPreview(parsed);
    };
    reader.readAsText(file);
    return false; // 阻止自动上传
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
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
    beforeUpload: handleBeforeUpload,
    customRequest: ({ file }) => handleUpload(file as File),
  };

  return (
    <div>
      <Dragger {...uploadProps} disabled={uploading}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">点击或拖拽 CSV 文件到此处上传</p>
        <p className="ant-upload-hint">CSV 需包含 question 和 expected_answer 列</p>
      </Dragger>

      {preview && (
        <div style={{ marginTop: 16 }}>
          <Alert
            message={`预览 (前 ${preview.length - 1} 行数据)`}
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
          />
          <Table
            dataSource={preview.slice(1).map((row, i) => {
              const obj: Record<string, string> = { _key: String(i) };
              preview[0].forEach((h, j) => { obj[h] = row[j] || ''; });
              obj._key = String(i);
              return obj;
            })}
            columns={
              preview[0].map((h) => ({
                title: h,
                dataIndex: h,
                key: h,
                ellipsis: true,
              }))
            }
            pagination={false}
            size="small"
            rowKey="_key"
            scroll={{ x: 'max-content' }}
          />
        </div>
      )}
    </div>
  );
};

export default CsvUploader;
