import React from 'react';
import { Card, Progress, Row, Col, Empty } from 'antd';
import type { EvaluationResult } from '../types';

interface Props {
  results: EvaluationResult[];
}

const CustomScoresChart: React.FC<Props> = ({ results }) => {
  // 收集所有结果中的 custom_scores 维度
  const scoreMap = new Map<string, number[]>();
  results.forEach((r) => {
    if (r.custom_scores) {
      Object.entries(r.custom_scores).forEach(([key, val]) => {
        if (!scoreMap.has(key)) scoreMap.set(key, []);
        scoreMap.get(key)!.push(val);
      });
    }
  });

  if (scoreMap.size === 0) return null;

  const dimensions = Array.from(scoreMap.entries()).map(([name, values]) => ({
    name,
    avg: values.reduce((s, v) => s + v, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  }));

  return (
    <Card title="📐 多维评分分布" size="small" style={{ marginBottom: 16 }}>
      <Row gutter={[16, 12]}>
        {dimensions.map((dim) => (
          <Col xs={24} sm={12} key={dim.name}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {dim.name}
              <span style={{ color: '#888', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                均值 {(dim.avg * 100).toFixed(0)}%（范围 {(dim.min * 100).toFixed(0)}%~{(dim.max * 100).toFixed(0)}%）
              </span>
            </div>
            <Progress
              percent={Number((dim.avg * 100).toFixed(0))}
              size="small"
              strokeColor={
                dim.avg >= 0.8 ? '#52c41a' : dim.avg >= 0.5 ? '#faad14' : '#ff4d4f'
              }
            />
          </Col>
        ))}
      </Row>
    </Card>
  );
};

export default CustomScoresChart;
