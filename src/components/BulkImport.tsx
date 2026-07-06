import React, { useState } from 'react';
import { Upload, Button, message, Alert, Descriptions, Typography } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { importExperimentJson } from '../api/endpoints';

const { Dragger } = Upload;
const { Text } = Typography;

interface Props {
  experimentId: string;
  experimentType: string;
  onSuccess: () => void;
}

const evalSample = `[
  {
    "group_name": "GPT-4o",
    "model": "gpt-4o",
    "variables": { "temperature": 0.7, "max_tokens": 4096 },
    "results": [
      {
        "question": "法国首都是哪里？",
        "expected_answer": "巴黎",
        "model_response": "巴黎是法国的首都。",
        "is_correct": true,
        "score": 1.0,
        "runtime_ms": 190,
        "token_count": 25
      }
    ]
  }
]`;

const agentSample = `[
  {
    "group_name": "GPT-4o Agent",
    "model": "gpt-4o + ReAct",
    "variables": { "temperature": 0.5, "max_steps": 10 },
    "results": [
      {
        "question": "搜索北京天气",
        "expected_answer": "返回气温和湿度",
        "model_response": "搜索成功 22°C 45%",
        "is_correct": true,
        "score": 1.0,
        "runtime_ms": 2500,
        "token_count": 350,
        "trajectory": [
          { "step": 1, "thought": "打开天气网站", "action": "navigate", "observation": "加载成功" },
          { "step": 2, "thought": "搜索北京", "action": "type", "observation": "输入完成" }
        ],
        "custom_scores": { "tool_accuracy": 1.0, "extraction_quality": 1.0 }
      }
    ]
  }
]`;

const BulkImport: React.FC<Props> = ({ experimentId, experimentType, onSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ groupsCreated: number; resultsCreated: number } | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const res = await importExperimentJson(experimentId, file);
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
    accept: '.json',
    showUploadList: false,
    beforeUpload: (file) => { handleUpload(file); return false; },
  };

  const isAgent = experimentType === 'agent_evaluation';
  const sample = isAgent ? agentSample : evalSample;

  return (
    <div>
      <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">拖拽或点击上传 JSON 文件</p>
        <p className="ant-upload-hint">一个 JSON 文件包含所有实验组、变量和评测结果</p>
      </Dragger>

      {uploading && <div style={{ textAlign: 'center', margin: '16px 0', color: '#1677ff' }}>导入中...</div>}

      {result && (
        <Alert
          type="success" showIcon message="导入成功"
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
        type="info" showIcon message="JSON 格式说明"
        description={
          <div style={{ fontSize: 12 }}>
            <p>JSON 数组，每个元素代表一个<strong>实验组</strong>：</p>
            <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
              <li><code>group_name</code>（必填）— 实验组名称</li>
              <li><code>model</code> — 模型名</li>
              <li><code>variables</code> — 实验变量，如 {`{"temperature": 0.7}`}</li>
              <li><code>results</code> — 评测结果数组，每条包含：
                <ul>
                  <li><code>question</code>（必填）、<code>expected_answer</code> — 题目和标准答案（自动匹配或创建测试用例）</li>
                  <li><code>model_response</code>、<code>is_correct</code>、<code>score</code>、<code>runtime_ms</code>、<code>token_count</code></li>
                  {isAgent && <li><code>trajectory</code> — 轨迹数组；<code>custom_scores</code> — 多维评分对象</li>}
                </ul>
              </li>
            </ul>
            <Text type="secondary">相同题目+答案会自动合并为同一测试用例。</Text>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      <div style={{ background: '#fafafa', borderRadius: 4, padding: 12 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>JSON 示例（{isAgent ? 'Agent评测' : '评测实验'}）</div>
        <pre style={{ fontSize: 11, maxHeight: 300, overflow: 'auto', margin: 0, background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #f0f0f0' }}>
          {sample}
        </pre>
      </div>
    </div>
  );
};

export default BulkImport;
