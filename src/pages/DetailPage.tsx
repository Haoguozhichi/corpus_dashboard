import React, { useEffect } from 'react';
import {
  Card, Col, Row, Typography, Descriptions, Statistic, Table,
  Empty, Tag, Spin,
} from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, ThunderboltOutlined, SettingOutlined, LineChartOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useData } from '../context/DataContext';
import EvaluationDetail from '../components/EvaluationDetail';
import AgentEvaluationDetail from '../components/AgentEvaluationDetail';

const { Title } = Typography;

const DetailPage: React.FC = () => {
  const { experimentId, groupId } = useParams<{ experimentId: string; groupId: string }>();
  const { experimentDetail, experimentLoading, refreshExperiment, selectExperiment, selectGroup } = useData();

  // 同步 URL 到 context，触发数据加载
  useEffect(() => {
    if (experimentId) selectExperiment(experimentId);
    if (groupId) selectGroup(groupId);
  }, [experimentId, groupId, selectExperiment, selectGroup]);

  // 数据未加载完时显示 spinner
  if (!experimentDetail) return <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />;

  const experiment = experimentDetail;
  const group = experiment?.groups?.find((g) => g.id === groupId);

  if (!experiment || !group) {
    return <Empty description="未找到该实验组" style={{ marginTop: 80 }} />;
  }

  // ====== Evaluation 类型 ======
  if (experiment.type === 'evaluation') {
    return (
      <EvaluationDetail
        group={group}
        experimentName={experiment.name}
        experimentId={experiment.id!}
        testCases={experiment.testCases || []}
        onRefresh={refreshExperiment}
      />
    );
  }

  if (experiment.type === 'agent_evaluation') {
    return (
      <AgentEvaluationDetail
        group={group}
        experimentName={experiment.name}
        experimentId={experiment.id!}
        testCases={experiment.testCases || []}
        onRefresh={refreshExperiment}
      />
    );
  }

  // ====== Training 类型 ======
  const metrics = group.metrics;
  if (!metrics) {
    return <Empty description="该实验组暂无训练指标数据" style={{ marginTop: 80 }} />;
  }

  const allGroups = experiment.groups || [];
  const allAccuracies = allGroups.map((g) => g.metrics?.accuracy ?? 0).filter((a) => a > 0);
  const bestAcc = Math.max(...allAccuracies, 0);
  const worstAcc = Math.min(...allAccuracies, Infinity);
  const avgAcc = allAccuracies.length > 0 ? allAccuracies.reduce((s, a) => s + a, 0) / allAccuracies.length : 0;

  const formatRuntime = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  // 曲线数据
  const curveData = (metrics.loss_curve || []).map((loss: number, i: number) => ({
    step: i + 1,
    loss,
    accuracy: metrics.accuracy_curve?.[i] ?? null,
  }));
  const hasCurves = curveData.length > 0;

  // 变量
  const paramData = Object.entries(group.parameters || {}).map(([key, value]) => ({ key, value: String(value) }));

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>{group.name}</Title>
      <Tag color="blue" style={{ marginBottom: 24 }}>实验: {experiment.name}</Tag>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}>
            <Statistic title="准确率" value={(metrics.accuracy * 100).toFixed(2)} suffix="%"
              valueStyle={{ color: metrics.accuracy === bestAcc ? '#52c41a' : '#1677ff' }} />
            <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
              {metrics.accuracy === bestAcc ? '🥇 最佳' : metrics.accuracy === worstAcc ? '最低' : `实验平均 ${(avgAcc * 100).toFixed(1)}%`}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="F1 Score" value={(metrics.f1_score * 100).toFixed(2)} suffix="%" /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="精确率" value={(metrics.precision * 100).toFixed(2)} suffix="%" /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="召回率" value={(metrics.recall * 100).toFixed(2)} suffix="%" /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="Token 消耗" value={metrics.token_count > 0 ? metrics.token_count.toLocaleString() : 'N/A'} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card style={{ height: '100%' }}><Statistic title="运行时间" value={formatRuntime(metrics.runtime)} /></Card>
        </Col>
        {paramData.map(({ key, value }) => (
          <Col xs={12} sm={8} md={6} key={key}>
            <Card style={{ height: '100%' }}><Statistic title={key} value={value} /></Card>
          </Col>
        ))}
      </Row>

      {/* 自定义指标 */}
      {metrics.custom_metrics && Object.keys(metrics.custom_metrics).length > 0 && (
        <Card title="📐 自定义指标" style={{ borderRadius: 8, marginBottom: 24 }}>
          <Table
            columns={[{ title: '指标名', dataIndex: 'key', width: 200 }, { title: '值', dataIndex: 'value' }]}
            dataSource={Object.entries(metrics.custom_metrics).map(([key, value]) => ({ key, value }))}
            pagination={false} size="middle" bordered
          />
        </Card>
      )}

      {hasCurves && (
        <Card title={<span><LineChartOutlined /> 训练曲线</span>} style={{ borderRadius: 8 }}>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={curveData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="step" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="loss" stroke="#ff4d4f" name="Loss" dot={false} strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="accuracy" stroke="#1677ff" name="Accuracy" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
};

export default DetailPage;
