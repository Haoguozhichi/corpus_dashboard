import React from 'react';
import { Timeline, Typography, Tag, Collapse } from 'antd';
import { BulbOutlined, ToolOutlined, EyeOutlined, RightCircleOutlined } from '@ant-design/icons';
import type { TrajectoryStep } from '../types';

const { Text, Paragraph } = Typography;

interface Props {
  trajectory: TrajectoryStep[];
}

const stepIcon = (step: TrajectoryStep) => {
  if (step.thought) return <BulbOutlined style={{ color: '#faad14' }} />;
  if (step.action || step.tool) return <ToolOutlined style={{ color: '#1677ff' }} />;
  if (step.observation) return <EyeOutlined style={{ color: '#52c41a' }} />;
  return <RightCircleOutlined style={{ color: '#999' }} />;
};

const TrajectoryViewer: React.FC<Props> = ({ trajectory }) => {
  if (!trajectory || trajectory.length === 0) return null;

  const items = trajectory.map((step, i) => {
    const tags: React.ReactNode[] = [];
    if (step.tool) tags.push(<Tag key="tool" color="blue" style={{ fontSize: 11 }}>{step.tool}</Tag>);

    const content = (
      <div style={{ fontSize: 13 }}>
        {step.thought && (
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>💭 思考</Text>
            <Paragraph style={{ margin: '2px 0', fontSize: 12, background: '#fffbe6', padding: '4px 8px', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
              {step.thought}
            </Paragraph>
          </div>
        )}
        {step.action && (
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>🎬 行动</Text>
            <Paragraph style={{ margin: '2px 0', fontSize: 12, background: '#e6f4ff', padding: '4px 8px', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
              {step.action}
            </Paragraph>
          </div>
        )}
        {step.tool_input && (
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>📥 输入</Text>
            <Paragraph code style={{ margin: '2px 0', fontSize: 11, whiteSpace: 'pre-wrap' }}>{step.tool_input}</Paragraph>
          </div>
        )}
        {step.observation && (
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>👁 观察</Text>
            <Paragraph style={{ margin: '2px 0', fontSize: 12, background: '#f6ffed', padding: '4px 8px', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
              {step.observation}
            </Paragraph>
          </div>
        )}
        {step.tool_output && (
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>📤 输出</Text>
            <Paragraph code style={{ margin: '2px 0', fontSize: 11, whiteSpace: 'pre-wrap' }}>{step.tool_output}</Paragraph>
          </div>
        )}
      </div>
    );

    return {
      key: i,
      dot: stepIcon(step),
      children: (
        <div>
          <div style={{ marginBottom: 4 }}>
            <Text strong>Step {step.step || i + 1}</Text>
            {tags}
          </div>
          {content}
        </div>
      ),
    };
  });

  return <Timeline items={items} />;
};

export default TrajectoryViewer;
