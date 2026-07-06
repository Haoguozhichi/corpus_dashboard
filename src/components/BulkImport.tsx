import React, { useState } from 'react';
import { Upload, Button, message, Alert, Descriptions, Space, Spin } from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { importExperimentCsv } from '../api/endpoints';

const { Dragger } = Upload;

interface Props {
  experimentId: string;
  experimentType: string;
  onSuccess: () => void;
}

const BulkImport: React.FC<Props> = ({ experimentId, experimentType, onSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ groupsCreated: number; resultsCreated: number } | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const res = await importExperimentCsv(experimentId, file);
      setResult(res);
      message.success(`导入完成：${res.groupsCreated} 个实验组，${res.resultsCreated} 条评测结果`);
      onSuccess();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '导入失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const uploadProps: UploadProps = {
    accept: '.csv',
    showUploadList: false,
    beforeUpload: (file) => { handleUpload(file); return false; },
  };

  const isEval = experimentType === 'evaluation';
  const isAgent = experimentType === 'agent_evaluation';
  const csvSample = isAgent
    ? `group_name,model,temperature,question,expected_answer,model_response,is_correct,runtime_ms,token_count,trajectory,custom_scores
GPT-4o Agent,gpt-4o,0.5,搜索天气,返回气温,搜索成功22°C,1,2500,350,"[{""step"":1,""thought"":""打开网页""}]","{""tool"":0.9}"
Claude Agent,claude-sonnet,0.5,搜索天气,返回气温,搜索成功22°C,1,2100,300,"[{""step"":1,""thought"":""导航到网站""}]","{""tool"":0.95}"`
    : `group_name,model,temperature,max_tokens,question,expected_answer,model_response,is_correct,runtime_ms,token_count
GPT-4o,gpt-4o,0.7,4096,法国首都是哪里？,巴黎,巴黎是法国的首都。,1,190,25
GPT-4o,gpt-4o,0.7,4096,计算123*456,56088,56088,1,160,20
GPT-3.5,gpt-3.5-turbo,0.7,2048,法国首都是哪里？,巴黎,巴黎,1,210,28`;

  return (
    <div>
      <Spin spinning={uploading} tip="导入中...">
        <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">拖拽或点击上传一键导入 CSV</p>
          <p className="ant-upload-hint">
            一个 CSV 文件包含所有实验组、变量和评测结果
          </p>
        </Dragger>
      </Spin>

      {result && (
        <Alert
          type="success" showIcon
          message="导入成功"
          description={
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="实验组">{result.groupsCreated} 个</Descriptions.Item>
              <Descriptions.Item label="评测结果">{result.resultsCreated} 条</Descriptions.Item>
            </Descriptions>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Alert
        type="info" showIcon
        message="CSV 格式说明"
        description={
          <div style={{ fontSize: 12 }}>
            <p><strong>必填列</strong>：<code>group_name</code>（实验组名）、<code>question</code>（题目）</p>
            <p><strong>可选列</strong>：<code>model</code>、<code>expected_answer</code>、<code>model_response</code>、<code>is_correct</code>、<code>score</code>、<code>runtime_ms</code>、<code>token_count</code>{isAgent && '、<code>trajectory</code>、<code>custom_scores</code>'}</p>
            <p><strong>其他列</strong>自动识别为实验组变量（如 <code>temperature</code>、<code>max_tokens</code>）</p>
            <p>相同 <code>group_name</code> 的行自动归入同一实验组；题目自动匹配或创建测试用例。</p>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      <div style={{ background: '#fafafa', borderRadius: 4, padding: 12 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>CSV 示例（{isAgent ? 'Agent评测' : isEval ? '评测实验' : '训练实验'}）</div>
        <pre style={{ fontSize: 11, maxHeight: 200, overflow: 'auto', margin: 0, background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #f0f0f0' }}>
          {csvSample}
        </pre>
      </div>
    </div>
  );
};

export default BulkImport;
